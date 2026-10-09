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
 *   2. un `pending` plus vieux que la fenêtre d'attente est un abandon, pas une
 *      attente → il ne se montre plus.
 *
 * Ce qui doit RESTER visible est aussi important que ce qui disparaît : un
 * `failed` (refus de l'opérateur) porte une information utile et un motif ; un
 * statut inconnu ne doit jamais être masqué en silence ; une date illisible ne
 * doit pas faire disparaître une ligne. Le harnais couvre les quatre.
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
  PENDING_PAYMENT_WINDOW_MS,
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
 * 2. Ce qui disparaît : une attente abandonnée
 * ===================================================================== */
section('2. Attente abandonnée → masquée');

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
  assert.equal(visible(ligne('pending', ilYA(PENDING_PAYMENT_WINDOW_MS))), true);
  assert.equal(visible(ligne('pending', ilYA(PENDING_PAYMENT_WINDOW_MS + 1))), false);
});

test('la fenêtre d’attente vaut bien une heure', () => {
  // Garde-fou sur la constante : une valeur aberrante (0 ou 30 jours) rendrait
  // les règles ci-dessus vraies par accident.
  assert.equal(PENDING_PAYMENT_WINDOW_MS, HOUR);
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
 * On affirme ici le CONTRAIRE de la règle. Ces trois assertions doivent
 * échouer — sinon les sections 1 à 3 passeraient sur n'importe quoi.
 */
test('TÉMOIN (doit échouer) : un paiement annulé présenté comme visible', () => {
  assert.equal(visible(ligne('cancelled', ilYA(1 * MINUTE))), true, 'cas délibérément faux');
});

test('TÉMOIN (doit échouer) : une attente de 48 h présentée comme visible', () => {
  assert.equal(visible(ligne('pending', ilYA(48 * HOUR))), true, 'cas délibérément faux');
});

test('TÉMOIN (doit échouer) : le comportement d’origine (tout visible) présenté comme correct', () => {
  const comportementDOrigine = () => true;
  assert.equal(comportementDOrigine(), false, 'cas délibérément faux : tout est affiché');
});

test('le harnais a bien vu les trois cas faux', () => {
  assert.equal(
    failures - beforeWitness,
    3,
    'les témoins n’ont pas échoué : le harnais ne prouve rien',
  );
});

/* =====================================================================
 * BILAN — on retire les 3 échecs volontaires du compte
 * ===================================================================== */
const TEMOINS = 3;
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
