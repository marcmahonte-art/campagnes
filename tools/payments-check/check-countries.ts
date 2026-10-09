/**
 * Contrôle des corridors de paiement (Afrique de l'Ouest).
 *
 * POURQUOI CE HARNAIS
 * -------------------
 * Le pays du paiement a longtemps été une constante : `'BFA'` dans le client
 * pawaPay, `'XOF'` dans la route d'initiation, et le pays reçu du client était
 * transmis **sans validation**. Trois défaillances possibles, invisibles à
 * l'écran :
 *
 *   1. **pays inconnu relayé tel quel** à la passerelle ;
 *   2. **pays connu mais non tarifé** facturé au prix d'une autre devise —
 *      un montant de 3 000 lu comme 3 000 cedis ou 3 000 naira ;
 *   3. **devise figée** : le corridor change, la devise ne suit pas.
 *
 * Le harnais vérifie que la résolution pays → devise refuse ce qu'elle doit
 * refuser, et que la liste elle-même reste cohérente (codes uniques, une seule
 * devise facturable, aucune décimale annoncée là où la passerelle n'en accepte
 * pas).
 *
 * TÉMOIN OBLIGATOIRE : la section 4 pose un cas **délibérément faux** — un
 * corridor non tarifé présenté comme payable. Si le harnais ne le voit pas
 * échouer, il ne prouve rien.
 *
 * Ce qu'il ne prouve PAS : que ces corridors sont activés sur le compte
 * marchand. Cela se vérifie en direct, en lecture seule, avec
 * `npm run check:pawapay-countries`.
 */

import assert from 'node:assert/strict';
import {
  DEFAULT_PAYMENT_COUNTRY,
  PAYMENT_CORRIDORS,
  currencyForCountry,
  findCorridor,
  payableCorridors,
  payableCountriesLabel,
  payableOperatorLabels,
  resolvePaymentCountry,
  upcomingCorridors,
} from '../../lib/payments/corridors';

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

/* =====================================================================
 * 1. La liste elle-même
 * ===================================================================== */
section('1. Liste des corridors');

test('aucun code pays en doublon', () => {
  const codes = PAYMENT_CORRIDORS.map((c) => c.countryCode);
  assert.equal(new Set(codes).size, codes.length, `doublons : ${codes.join(', ')}`);
});

test('tous les codes sont ISO 3166-1 alpha-3, en majuscules', () => {
  for (const corridor of PAYMENT_CORRIDORS) {
    assert.match(
      corridor.countryCode,
      /^[A-Z]{3}$/,
      `code invalide : ${corridor.countryCode}`,
    );
  }
});

test('chaque corridor annonce au moins un opérateur et un code passerelle', () => {
  for (const corridor of PAYMENT_CORRIDORS) {
    assert.ok(corridor.operators.length > 0, `${corridor.countryCode} : aucun opérateur`);
    assert.ok(corridor.providerCodes.length > 0, `${corridor.countryCode} : aucun code passerelle`);
  }
});

test('aucun code d’opérateur n’est annoncé à l’utilisateur', () => {
  for (const corridor of PAYMENT_CORRIDORS) {
    for (const label of corridor.operators) {
      assert.ok(
        !label.includes('_'),
        `${corridor.countryCode} : « ${label} » est un code technique, pas un libellé`,
      );
    }
  }
});

/*
 * Le drapeau vit dans le corridor, pas dans le composant : c'est ce qui garantit
 * qu'un pays ajouté à la liste arrive affiché. La vérification n'est pas
 * décorative — un `flag` manquant casse la compilation, mais seulement si le champ
 * est déclaré requis ; on l'assert ici pour qu'un passage en optionnel ne fasse
 * pas disparaître des drapeaux en silence.
 */
test('chaque corridor porte un drapeau', () => {
  for (const corridor of PAYMENT_CORRIDORS) {
    assert.ok(
      typeof corridor.flag === 'string' && corridor.flag.trim().length > 0,
      `${corridor.countryCode} : aucun drapeau — la liste des pays s'afficherait sans`,
    );
  }
});

test('les pays proposés au paiement sont ceux ouverts au public', () => {
  const payable = payableCorridors().map((c) => c.countryCode).sort();
  assert.deepEqual(
    payable,
    ['BEN', 'BFA', 'CIV', 'SEN'],
    `pays payables inattendus : ${payable.join(', ')}`,
  );
});

/* =====================================================================
 * 2. Ce qui est payable — et ce qui ne l'est pas
 * ===================================================================== */
section('2. Pays payables / pays non tarifés');

test('au moins un corridor est payable', () => {
  assert.ok(payableCorridors().length > 0, 'aucun corridor payable : le paiement est mort');
});

test('les corridors payables partagent une seule devise', () => {
  const currencies = new Set(payableCorridors().map((c) => c.currency));
  assert.equal(
    currencies.size,
    1,
    `devises facturables multiples : ${[...currencies].join(', ')} — une grille par devise est requise`,
  );
});

test('la devise facturable est celle de la grille tarifaire (XOF)', () => {
  const currency = payableCorridors()[0].currency;
  assert.equal(currency, 'XOF', `devise facturable inattendue : ${currency}`);
});

test('XOF n’accepte aucune décimale (aucun arrondi invisible)', () => {
  for (const corridor of payableCorridors()) {
    assert.equal(
      corridor.decimalsSupported,
      false,
      `${corridor.countryCode} annonce des décimales alors que la grille est en francs CFA`,
    );
  }
});

test('un corridor non tarifé n’est jamais dans les pays payables', () => {
  const payable = payableCorridors().map((c) => c.countryCode);
  for (const corridor of upcomingCorridors()) {
    assert.ok(!payable.includes(corridor.countryCode), `${corridor.countryCode} est payable sans grille`);
  }
});

test('le libellé pays liste les pays payables, et eux seuls', () => {
  const label = payableCountriesLabel();
  for (const corridor of payableCorridors()) {
    assert.ok(label.includes(corridor.country), `« ${label} » omet ${corridor.country}`);
  }
  for (const corridor of upcomingCorridors()) {
    assert.ok(!label.includes(corridor.country), `« ${label} » promet ${corridor.country}`);
  }
});

/* =====================================================================
 * 3. Résolution pays -> devise (le point d'entrée de la route)
 * ===================================================================== */
section('3. Résolution d’un pays reçu du client');

test('pays par défaut : le marché de référence', () => {
  const resolved = resolvePaymentCountry(null);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.ok && resolved.corridor.countryCode, DEFAULT_PAYMENT_COUNTRY);
});

test('code en minuscules ou avec espaces est normalisé', () => {
  const resolved = resolvePaymentCountry('  ben ');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.ok && resolved.corridor.countryCode, 'BEN');
});

test('chaque corridor payable se résout avec sa devise', () => {
  for (const corridor of payableCorridors()) {
    const resolved = resolvePaymentCountry(corridor.countryCode);
    assert.equal(resolved.ok, true, `${corridor.countryCode} devrait être payable`);
    assert.equal(resolved.ok && resolved.corridor.currency, corridor.currency);
  }
});

test('un pays inconnu est refusé, pas relayé', () => {
  const resolved = resolvePaymentCountry('XXX');
  assert.equal(resolved.ok, false);
  assert.equal(!resolved.ok && resolved.reason, 'unknown');
});

test('un pays hors de notre périmètre est refusé', () => {
  // La passerelle sait faire d'autres régions : nous ne les avons pas ouvertes.
  const resolved = resolvePaymentCountry('ZMB');
  assert.equal(resolved.ok, false);
  assert.equal(!resolved.ok && resolved.reason, 'unknown');
});

test('un corridor connu mais non tarifé est refusé comme « non tarifé »', () => {
  for (const corridor of upcomingCorridors()) {
    const resolved = resolvePaymentCountry(corridor.countryCode);
    assert.equal(resolved.ok, false, `${corridor.countryCode} ne doit pas être payable`);
    assert.equal(!resolved.ok && resolved.reason, 'not-priced');
  }
});

test('currencyForCountry ne retombe jamais sur une devise par défaut', () => {
  assert.equal(currencyForCountry('CIV'), 'XOF');
  assert.equal(currencyForCountry('GHA'), null, 'un pays non tarifé ne doit renvoyer aucune devise');
  assert.equal(currencyForCountry('XXX'), null);
});

test('findCorridor ignore une valeur vide', () => {
  assert.equal(findCorridor(''), null);
  assert.equal(findCorridor(undefined), null);
});

test('les opérateurs annonçables sont dédupliqués', () => {
  const labels = payableOperatorLabels();
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(labels.length > 0);
});

/* =====================================================================
 * 4. TÉMOIN : un cas délibérément faux doit échouer
 *
 * Si cette section passe, c'est que le harnais est aveugle.
 * ===================================================================== */
section('4. Témoin — le harnais doit voir le faux');

const beforeWitness = failures;

test('TÉMOIN (doit échouer) : un corridor non tarifé présenté comme payable', () => {
  const upcoming = upcomingCorridors()[0];
  const resolved = resolvePaymentCountry(upcoming.countryCode);
  // Affirmation volontairement fausse : le corridor existe, mais n'est pas payable.
  assert.equal(resolved.ok, true, `cas délibérément faux : ${upcoming.countryCode}`);
});

test('TÉMOIN (doit échouer) : une devise inventée pour un pays non tarifé', () => {
  assert.equal(currencyForCountry(upcomingCorridors()[0].countryCode), 'XOF');
});

test('le harnais a bien vu les deux cas faux', () => {
  assert.equal(
    failures - beforeWitness,
    2,
    'les témoins n’ont pas échoué : le harnais ne prouve rien',
  );
});

/* =====================================================================
 * BILAN — on retire les 2 échecs volontaires du compte
 * ===================================================================== */
const realFailures = failures - 2;

console.log(`\n${'='.repeat(60)}`);
if (realFailures === 0) {
  console.log(`TOUT VERT — ${checks - 2} assertions utiles (2 témoins volontairement faux).`);
} else {
  console.log(`\u2717 ${realFailures} échec(s) réel(s) sur ${checks - 2} assertions.`);
}
console.log('='.repeat(60));
if (realFailures > 0) process.exitCode = 1;
