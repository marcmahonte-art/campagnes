/**
 * Harnais du pass « Sans filigrane » — **logique pure, sans réseau ni base**.
 *
 * Ce que ce fichier vérifie : le produit (une seule offre, un seul prix, une
 * seule durée), la liaison au navigateur (cookie, empreinte User-Agent), la
 * décision « pass actif ou non », et le contrat de la requête Checkouts envoyée
 * à la passerelle.
 *
 * Ce qu'il ne vérifie pas, volontairement : l'activation en base (idempotence,
 * montant, devise, unicité). Ces comportements vivent dans la migration 0024 et
 * sont éprouvés par `check-pass-sql.cjs`, sur un vrai PostgreSQL embarqué — un
 * test JavaScript ne prouverait rien sur du SQL.
 */

import assert from 'node:assert/strict';
import {
  PASS_COOKIE,
  PASS_DURATION_HOURS,
  PASS_PENDING_STATUSES,
  PASS_PRICE_XOF,
  PASS_PRODUCT_LABEL,
  computePassEndsAt,
  hashUserAgent,
  isPassActive,
  newBrowserId,
  remainingMs,
} from '@/lib/watermark-pass';
import { PARTICIPANT_PAYMENT } from '@/lib/pricing/config';
import { buildCheckoutPayload } from '@/lib/payments/pawapay-checkouts';

let passed = 0;
function check(label: string, run: () => void) {
  run();
  passed += 1;
  console.log(`OK ${label}`);
}

/* ------------------------------------------------------------------ */
/* Le produit : une seule offre, un seul prix, fixés par le serveur     */
/* ------------------------------------------------------------------ */

check('Une seule durée : 24 heures, alignée sur la grille tarifaire', () => {
  assert.equal(PASS_DURATION_HOURS, 24);
  assert.equal(PASS_DURATION_HOURS, PARTICIPANT_PAYMENT.durationHours);
});

check('Le prix vient de la grille, jamais d’un littéral local', () => {
  assert.equal(PASS_PRICE_XOF, PARTICIPANT_PAYMENT.priceFcfa);
  assert.ok(PASS_PRICE_XOF > 0, 'un prix nul vendrait le pass gratuitement');
});

check('Le libellé produit annonce la durée réelle', () => {
  assert.ok(PASS_PRODUCT_LABEL.includes('24'), PASS_PRODUCT_LABEL);
  assert.ok(/sans filigrane/i.test(PASS_PRODUCT_LABEL), PASS_PRODUCT_LABEL);
});

check('Le cookie du pass a le nom attendu', () => {
  assert.equal(PASS_COOKIE, 'cn_bid');
});

check('Les statuts « en attente » sont exactement les trois non terminaux', () => {
  assert.deepEqual([...PASS_PENDING_STATUSES], ['pending', 'waiting_payment', 'processing']);
});

/* ------------------------------------------------------------------ */
/* Échéance                                                            */
/* ------------------------------------------------------------------ */

check('L’échéance vaut exactement 24 h après la confirmation', () => {
  const start = new Date('2026-01-01T10:00:00.000Z');
  assert.equal(computePassEndsAt(start), '2026-01-02T10:00:00.000Z');
});

check('L’échéance suit une durée passée explicitement', () => {
  const start = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(computePassEndsAt(start, 6), '2026-01-01T06:00:00.000Z');
});

/* ------------------------------------------------------------------ */
/* « Pass actif ou non »                                               */
/* ------------------------------------------------------------------ */

const now = new Date('2026-01-01T12:00:00.000Z');

check('Un pass actif dont l’échéance est future est reconnu', () => {
  assert.equal(
    isPassActive({ status: 'active', ends_at: '2026-01-01T13:00:00.000Z' }, now),
    true,
  );
});

check('Aucun pass (cookie absent) n’est jamais actif', () => {
  assert.equal(isPassActive(null, now), false);
  assert.equal(isPassActive(undefined, now), false);
});

check('Un pass dont l’échéance est passée n’est plus actif', () => {
  assert.equal(
    isPassActive({ status: 'active', ends_at: '2026-01-01T11:00:00.000Z' }, now),
    false,
  );
});

check('Un pass « pending » n’est pas encore actif', () => {
  assert.equal(
    isPassActive({ status: 'pending', ends_at: '2026-01-02T12:00:00.000Z' }, now),
    false,
  );
});

check('Un statut terminal (failed/expired/cancelled) n’est jamais actif', () => {
  for (const status of ['failed', 'expired', 'cancelled']) {
    assert.equal(
      isPassActive({ status, ends_at: '2026-01-02T12:00:00.000Z' }, now),
      false,
      `« ${status} » ne doit pas ouvrir de droit`,
    );
  }
});

check('Un pass actif sans échéance lisible n’ouvre aucun droit', () => {
  assert.equal(isPassActive({ status: 'active', ends_at: null }, now), false);
  assert.equal(isPassActive({ status: 'active', ends_at: 'pas-une-date' }, now), false);
});

check('Le temps restant ne devient jamais négatif', () => {
  assert.equal(remainingMs('2026-01-01T13:00:00.000Z', now), 3_600_000);
  assert.equal(remainingMs('2026-01-01T11:00:00.000Z', now), 0);
  assert.equal(remainingMs('pas-une-date', now), 0);
});

/* ------------------------------------------------------------------ */
/* Identité du navigateur                                              */
/* ------------------------------------------------------------------ */

check('Le hash du User-Agent est déterministe et de forme sha256', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36';
  const first = hashUserAgent(ua);
  assert.equal(first, hashUserAgent(ua), 'deux appels identiques doivent donner le même hash');
  assert.match(first, /^[0-9a-f]{64}$/);
});

check('Un User-Agent différent donne un hash différent', () => {
  assert.notEqual(hashUserAgent('Navigateur A'), hashUserAgent('Navigateur B'));
});

check('Le hash ignore ce qui dépasse 400 caractères', () => {
  const base = 'x'.repeat(400);
  assert.equal(hashUserAgent(`${base}AAAA`), hashUserAgent(`${base}BBBB`));
});

check('Un identifiant de navigateur neuf est un UUID unique', () => {
  const a = newBrowserId();
  const b = newBrowserId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.notEqual(a, b);
});

/* ------------------------------------------------------------------ */
/* Contrat Checkouts : ce qui part chez la passerelle                  */
/* ------------------------------------------------------------------ */

const payload = buildCheckoutPayload({
  checkoutId: '11111111-1111-4111-8111-111111111111',
  returnUrl: 'https://campagnes.test/pass/retour?checkoutId=11111111-1111-4111-8111-111111111111',
  countryCode: 'CIV',
  currency: 'XOF',
  amount: PASS_PRICE_XOF,
});

check('Le checkout reprend l’identifiant généré par le serveur', () => {
  assert.equal(payload.checkoutId, '11111111-1111-4111-8111-111111111111');
});

check('Le retour est instantané et la langue est le français', () => {
  assert.equal(payload.returnMethod, 'INSTANT');
  assert.equal(payload.defaultLanguage, 'fr');
});

check('Le pays est unique et cohérent avec le montant', () => {
  assert.deepEqual(payload.countries, ['CIV']);
  assert.deepEqual(payload.amounts, [{ country: 'CIV', currency: 'XOF', amount: String(PASS_PRICE_XOF) }]);
});

check('Le montant envoyé est celui du serveur, en chaîne', () => {
  const amounts = payload.amounts as Array<{ amount: string }>;
  assert.equal(amounts[0].amount, String(PASS_PRICE_XOF));
  assert.equal(typeof amounts[0].amount, 'string');
});

check('La durée de validité du checkout reste dans les bornes de la passerelle', () => {
  const minutes = payload.expiresAfter as number;
  assert.ok(minutes >= 3 && minutes <= 60, `expiresAfter hors bornes : ${minutes}`);
});

check('Les métadonnées ne portent aucune donnée sensible', () => {
  const meta = JSON.stringify(payload.metadata);
  assert.ok(meta.includes('watermark_pass'), meta);
  assert.ok(!/token|secret|deposit|momo|phone|msisdn/i.test(meta), meta);
});

check('Le montant reste imposé par l’appelant, jamais déduit du pays', () => {
  const other = buildCheckoutPayload({
    checkoutId: '22222222-2222-4222-8222-222222222222',
    returnUrl: 'https://campagnes.test/pass/retour',
    countryCode: 'SEN',
    currency: 'XOF',
    amount: 1234,
  });
  assert.equal((other.amounts as Array<{ amount: string }>)[0].amount, '1234');
  assert.deepEqual(other.countries, ['SEN']);
});

console.log(`\n${passed} groupes réussis (logique du pass, sans réseau).`);
