/*
 * Contrôle de la visibilité d'un paiement dans « Mes paiements ».
 *
 * POURQUOI CE HARNAIS
 * -------------------
 * Constaté en production le 2026-10-09 : 13 paiements testés puis annulés
 * restaient affichés « En cours de vérification » — indéfiniment. La cause est
 * structurelle, pas accidentelle : `/initiate` écrit la ligne `payments` AVANT
 * d'ouvrir la page de paiement, et pawaPay ne crée un dépôt que lorsque le
 * client appuie sur « Pay ». Un abandon ne laisse donc aucune trace côté
 * passerelle, aucun webhook n'arrive, et la ligne ne bouge plus jamais.
 *
 * Deux règles réparent cela, et ce sont elles que le harnais vérifie :
 *
 *   1. un paiement `cancelled` n'a jamais eu lieu → il ne se montre pas ;
 *   2. un abandon, une fois la fenêtre écoulée, ne se montre plus. Deux
 *      situations comptent comme un abandon : un `pending` figé (le client a
 *      fermé la page avant d'appuyer sur « Pay »), et un `failed` portant
 *      `PAYMENT_NOT_APPROVED` (le client a refusé l'invite sur son téléphone,
 *      ou n'a pas saisi son PIN à temps).
 *
 * Ce qui doit RESTER visible est aussi important que ce qui disparaît : les
 * échecs techniques (`INSUFFICIENT_BALANCE`, `WALLET_LIMIT_REACHED`…) portent
 * une information dont le client a besoin ; un statut inconnu ne doit jamais
 * être masqué en silence ; une date illisible ne doit pas faire disparaître une
 * ligne. Le harnais couvre les trois, et vérifie aussi que le masquage ne
 * déborde pas sur les échecs techniques — c'est le faux pas symétrique.
 *
 * On importe la **vraie** fonction du projet : si sa logique change, ce
 * contrôle change avec elle.
 *
 * TÉMOIN OBLIGATOIRE : la dernière section rejoue le bug d'origine (tout
 * visible) et vérifie que les assertions le détectent. Un contrôle qui ne peut
 * pas échouer ne prouve rien.
 */

import assert from 'node:assert/strict';
import {
  ABANDONED_PAYMENT_WINDOW_MS,
  REFUSED_PAYMENT_CODE,
  isVisibleInPaymentHistory,
  type PaymentRow,
} from '../../lib/payments/history';

let failures = 0;
let checks = 0;

function test(name: string, fn: () => void) {
  checks += 1;
  try {
    fn();
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
/* Outillage                                                           */
/* ------------------------------------------------------------------ */

/** Instant de référence figé : aucune assertion ne dépend de l'horloge. */
const NOW = Date.parse('2026-10-09T20:00:00.000Z');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Date ISO située `ms` avant l'instant de référence. */
const ilYA = (ms: number) => new Date(NOW - ms).toISOString();

const ligne = (
  status: string | null,
  createdAt: string | null,
  extra: Partial<PaymentRow> = {},
): PaymentRow => ({
  deposit_id: '11111111-2222-3333-4444-555555555555',
  amount: 2500,
  currency: 'XOF',
  status,
  created_at: createdAt,
  ...extra,
});

const visible = (row: PaymentRow) => isVisibleInPaymentHistory(row, NOW);

/* =====================================================================
 * 1. Ce qui disparaît : un paiement annulé
 * ===================================================================== */
section('1. Paiement annulé → masqué');

test('un paiement annulé n’apparaît pas, même créé il y a une minute', () => {
  assert.equal(visible(ligne('cancelled', ilYA(1 * MINUTE))), false);
});

test('un paiement annulé n’apparaît pas, même très ancien', () => {
  assert.equal(visible(ligne('cancelled', ilYA(90 * 24 * HOUR))), false);
});

test('l’annulation prime sur toute autre considération de date', () => {
  // Date absente, illisible, ou dans le futur : `cancelled` gagne toujours.
  assert.equal(visible(ligne('cancelled', null)), false);
  assert.equal(visible(ligne('cancelled', 'pas-une-date')), false);
  assert.equal(visible(ligne('cancelled', new Date(NOW + HOUR).toISOString())), false);
});

/* =====================================================================
 * 2. Ce qui disparaît : une attente figée, ou un refus du client
 * ===================================================================== */
section('2. Abandon → masqué (attente figée, ou refus du client)');

test('une attente de 2 minutes reste visible', () => {
  assert.equal(visible(ligne('pending', ilYA(2 * MINUTE))), true);
});

test('une attente de 5 minutes reste visible', () => {
  assert.equal(visible(ligne('pending', ilYA(5 * MINUTE))), true);
});

test('une attente de 59 minutes reste visible', () => {
  assert.equal(visible(ligne('pending', ilYA(59 * MINUTE))), true);
});

test('une attente de 61 minutes est masquée', () => {
  assert.equal(visible(ligne('pending', ilYA(61 * MINUTE))), false);
});

test('une attente de 24 heures est masquée', () => {
  assert.equal(visible(ligne('pending', ilYA(24 * HOUR))), false);
});

test('la borne est exacte : à la fenêtre pile on montre, une milliseconde après on cache', () => {
  assert.equal(visible(ligne('pending', ilYA(ABANDONED_PAYMENT_WINDOW_MS))), true);
  assert.equal(visible(ligne('pending', ilYA(ABANDONED_PAYMENT_WINDOW_MS + 1))), false);
});

test('la fenêtre vaut bien une heure', () => {
  // Garde-fou sur la constante : une valeur aberrante (0 ou 30 jours) rendrait
  // les règles ci-dessus vraies par accident.
  assert.equal(ABANDONED_PAYMENT_WINDOW_MS, HOUR);
});

/* --- Le refus du client, traité comme un abandon --------------------- */

test('un refus du client reste visible pendant la fenêtre', () => {
  const refuse = ligne('failed', ilYA(5 * MINUTE), {
    failure_code: REFUSED_PAYMENT_CODE,
    failure_message: 'Le client n’a pas autorisé le paiement.',
  });
  assert.equal(visible(refuse), true);
});

test('un refus du client est masqué une fois la fenêtre écoulée', () => {
  const refuse = ligne('failed', ilYA(61 * MINUTE), {
    failure_code: REFUSED_PAYMENT_CODE,
  });
  assert.equal(visible(refuse), false);
});

test('la borne du refus est la même que celle de l’attente', () => {
  const auBord = ligne('failed', ilYA(ABANDONED_PAYMENT_WINDOW_MS), {
    failure_code: REFUSED_PAYMENT_CODE,
  });
  const justeApres = ligne('failed', ilYA(ABANDONED_PAYMENT_WINDOW_MS + 1), {
    failure_code: REFUSED_PAYMENT_CODE,
  });
  assert.equal(visible(auBord), true);
  assert.equal(visible(justeApres), false);
});

test('le code de refus est bien PAYMENT_NOT_APPROVED', () => {
  // Garde-fou : si la constante changeait, les règles ci-dessus resteraient
  // vraies tout en ne couvrant plus le code réellement émis par pawaPay.
  assert.equal(REFUSED_PAYMENT_CODE, 'PAYMENT_NOT_APPROVED');
});

test('un échec technique ancien reste visible, avec son motif', () => {
  // Le client a besoin de lire « solde insuffisant » pour comprendre.
  for (const code of [
    'INSUFFICIENT_BALANCE',
    'WALLET_LIMIT_REACHED',
    'PAYER_NOT_FOUND',
    'AMOUNT_OUT_OF_BOUNDS',
    'UNSPECIFIED_FAILURE',
  ]) {
    const ancien = ligne('failed', ilYA(90 * 24 * HOUR), { failure_code: code });
    assert.equal(visible(ancien), true, `${code} ne doit jamais être masqué`);
  }
});

test('un échec sans code reste visible : on n’efface pas sur un doute', () => {
  assert.equal(visible(ligne('failed', ilYA(90 * 24 * HOUR), { failure_code: null })), true);
  assert.equal(
    visible(ligne('failed', ilYA(90 * 24 * HOUR), { failure_code: undefined })),
    true,
  );
});

test('un refus sans date lisible reste visible', () => {
  const refuse = ligne('failed', null, { failure_code: REFUSED_PAYMENT_CODE });
  assert.equal(visible(refuse), true);
  const illisible = ligne('failed', 'pas-une-date', { failure_code: REFUSED_PAYMENT_CODE });
  assert.equal(visible(illisible), true);
});

test('un refus très récent n’est jamais masqué par un autre motif', () => {
  // Un `cancelled` est masqué sans condition ; un refus, non. Les deux ne
  // doivent pas être confondus.
  assert.equal(
    visible(ligne('cancelled', ilYA(1 * MINUTE), { failure_code: REFUSED_PAYMENT_CODE })),
    false,
  );
  assert.equal(
    visible(ligne('failed', ilYA(1 * MINUTE), { failure_code: REFUSED_PAYMENT_CODE })),
    true,
  );
});

/* =====================================================================
 * 3. Ce qui RESTE visible — la partie qu’on pourrait casser par excès
 * ===================================================================== */
section('3. Ce qui doit rester visible');

test('un paiement confirmé reste visible, même ancien', () => {
  assert.equal(visible(ligne('completed', ilYA(400 * 24 * HOUR))), true);
});

test('un paiement échoué reste visible : c’est une information, avec son motif', () => {
  const echoue = ligne('failed', ilYA(30 * 24 * HOUR), {
    failure_message: 'Solde insuffisant.',
  });
  assert.equal(visible(echoue), true);
});

test('un statut inconnu reste visible : on ne cache pas ce qu’on ne comprend pas', () => {
  assert.equal(visible(ligne('refunded', ilYA(10 * 24 * HOUR))), true);
  assert.equal(visible(ligne('IN_RECONCILIATION', ilYA(10 * 24 * HOUR))), true);
});

test('un statut absent reste visible', () => {
  assert.equal(visible(ligne(null, ilYA(10 * 24 * HOUR))), true);
  assert.equal(visible(ligne(undefined as unknown as string, ilYA(10 * 24 * HOUR))), true);
});

test('une attente sans date lisible reste visible : on n’efface pas sur un doute', () => {
  assert.equal(visible(ligne('pending', null)), true);
  assert.equal(visible(ligne('pending', 'pas-une-date')), true);
  assert.equal(visible(ligne('pending', '')), true);
});

test('une attente dont la date est dans le futur reste visible', () => {
  // Horloge de poste en retard, ou date écrite par un autre fuseau : un écart
  // négatif ne doit pas se lire comme « très ancien ».
  assert.equal(visible(ligne('pending', new Date(NOW + 3 * HOUR).toISOString())), true);
});

/* =====================================================================
 * 4. TÉMOIN — le bug d’origine doit être détecté
 * ===================================================================== */
section('4. TÉMOIN (doit échouer)');

const beforeWitness = failures;

/*
 * On affirme ici le CONTRAIRE de la règle. Ces cinq assertions doivent
 * échouer — sinon les sections 1 à 3 passeraient sur n'importe quoi.
 *
 * Les deux premières visent le défaut par excès (tout visible, le bug
 * d'origine). La quatrième vise le défaut par défaut, symétrique et plus
 * sournois : masquer TOUS les échecs, y compris « solde insuffisant », ce qui
 * laisserait le client sans explication.
 */
test('TÉMOIN (doit échouer) : un paiement annulé présenté comme visible', () => {
  assert.equal(visible(ligne('cancelled', ilYA(1 * MINUTE))), true, 'cas délibérément faux');
});

test('TÉMOIN (doit échouer) : une attente de 48 h présentée comme visible', () => {
  assert.equal(visible(ligne('pending', ilYA(48 * HOUR))), true, 'cas délibérément faux');
});

test('TÉMOIN (doit échouer) : un refus du client de 48 h présenté comme visible', () => {
  assert.equal(
    visible(ligne('failed', ilYA(48 * HOUR), { failure_code: REFUSED_PAYMENT_CODE })),
    true,
    'cas délibérément faux',
  );
});

test('TÉMOIN (doit échouer) : un échec technique ancien présenté comme masqué', () => {
  // Le faux pas symétrique : masquer TOUS les échecs. Les autres assertions
  // doivent le rejeter, sinon la règle serait trop large.
  assert.equal(
    visible(ligne('failed', ilYA(90 * 24 * HOUR), { failure_code: 'INSUFFICIENT_BALANCE' })),
    false,
    'cas délibérément faux : solde insuffisant ne doit jamais disparaître',
  );
});

test('TÉMOIN (doit échouer) : le comportement d’origine (tout visible) présenté comme correct', () => {
  const comportementDOrigine = () => true;
  assert.equal(comportementDOrigine(), false, 'cas délibérément faux : tout est affiché');
});

test('le harnais a bien vu les cinq cas faux', () => {
  assert.equal(
    failures - beforeWitness,
    5,
    'les témoins n’ont pas échoué : le harnais ne prouve rien',
  );
});

/* =====================================================================
 * BILAN — on retire les échecs volontaires du compte
 * ===================================================================== */
const TEMOINS = 5;
const realFailures = failures - TEMOINS;

console.log(`\n${'='.repeat(60)}`);
if (realFailures === 0) {
  console.log(
    `TOUT VERT — ${checks - TEMOINS} assertions utiles (${TEMOINS} témoins volontairement faux).`,
  );
} else {
  console.log(`\u2717 ${realFailures} échec(s) réel(s) sur ${checks - TEMOINS} assertions.`);
}
console.log('='.repeat(60));
if (realFailures > 0) process.exitCode = 1;
