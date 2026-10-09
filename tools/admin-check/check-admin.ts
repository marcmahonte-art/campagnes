/*
 * Logique pure du Super Admin — sans base, sans réseau.
 *
 * Ce harnais éprouve ce qui doit être vrai **avant même** qu'une base existe :
 *
 *   - l'export CSV ne doit pas permettre d'injecter une formule dans un
 *     tableur, ni décaler une ligne parce qu'un champ contient une virgule ;
 *   - la matrice des rôles ne doit laisser passer aucune permission implicite ;
 *   - une période inconnue doit retomber sur une valeur sûre, jamais sur
 *     « depuis toujours » ;
 *   - une pagination hostile (page négative, page énorme, texte) doit être
 *     bornée, sinon un paramètre d'URL devient une attaque par épuisement.
 */
import assert from 'node:assert/strict';
import { csvCell, exportFilename, toCsv } from '@/lib/admin/csv';
import { can, isAdminRole } from '@/lib/admin/roles';
import {
  ADMIN_PERIODS,
  dailyBuckets,
  normalizePage,
  normalizePeriod,
  normalizeText,
} from '@/lib/admin/filters';

let passed = 0;
let failed = 0;

function test(label: string, run: () => void) {
  try {
    run();
    passed += 1;
    console.log(`OK ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`KO ${label}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

/* ------------------------------------------------------------------ */
/* Export CSV                                                          */
/* ------------------------------------------------------------------ */

test('Une cellule contenant une virgule est encadrée de guillemets', () => {
  assert.equal(csvCell('Dupont, Jean'), '"Dupont, Jean"');
});

test('Un guillemet intérieur est doublé, jamais laissé tel quel', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
});

test('Une cellule qui commence par = n’est plus une formule', () => {
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('+3312345'), "'+3312345");
  assert.equal(csvCell('-2+3'), "'-2+3");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
});

test('Un contenu ordinaire n’est pas modifié', () => {
  assert.equal(csvCell('mpixel'), 'mpixel');
  assert.equal(csvCell(3000), '3000');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('Un retour à la ligne dans une cellule n’ouvre pas une nouvelle ligne', () => {
  const line = toCsv([{ note: 'ligne1\nligne2' }], ['note']);
  assert.equal(line.split('\r\n').length, 2, 'en-tête + une seule ligne');
  assert.ok(line.includes('"ligne1\nligne2"'));
});

test('Le nom de fichier porte la ressource, la date et les filtres actifs', () => {
  const name = exportFilename('payments', { status: 'pending', period: '30d', search: null });
  assert.ok(name.startsWith('campagnes_payments_'));
  assert.ok(name.includes('status-pending'));
  assert.ok(name.endsWith('.csv'));
});

test('Un filtre « all » ne pollue pas le nom du fichier', () => {
  const name = exportFilename('users', { plan: 'all', period: '7d' });
  assert.ok(!name.includes('plan-all'));
  assert.ok(name.includes('period-7d'));
});

/* ------------------------------------------------------------------ */
/* Rôles et permissions                                                */
/* ------------------------------------------------------------------ */

test('Aucun rôle n’obtient une permission qu’il n’a pas demandée', () => {
  assert.equal(can('support_readonly', 'admin:export'), false);
  assert.equal(can('support_readonly', 'admin:write'), false);
  assert.equal(can('support_readonly', 'admin:audit:read'), false);
  assert.equal(can('finance_readonly', 'admin:write'), false);
  assert.equal(can('finance_readonly', 'admin:audit:read'), false);
});

test('La lecture est le socle commun, jamais l’écriture', () => {
  for (const role of ['super_admin', 'finance_readonly', 'support_readonly'] as const) {
    assert.equal(can(role, 'admin:read'), true);
    assert.equal(can(role, 'admin:access'), true);
  }
  assert.equal(can('super_admin', 'admin:write'), true);
});

test('Un rôle inconnu n’est ni reconnu ni autorisé', () => {
  assert.equal(isAdminRole('organization'), false, 'une formule n’est pas un rôle');
  assert.equal(isAdminRole('creator'), false);
  assert.equal(isAdminRole(null), false);
  assert.equal(isAdminRole('super_admin'), true);
  assert.equal(can('organization' as never, 'admin:read'), false);
});

/* ------------------------------------------------------------------ */
/* Filtres                                                             */
/* ------------------------------------------------------------------ */

test('Une période inconnue retombe sur 30 jours', () => {
  assert.equal(normalizePeriod(null), '30d');
  assert.equal(normalizePeriod('depuis toujours'), '30d');
  assert.equal(normalizePeriod('7d'), '7d');
  assert.equal(normalizePeriod('90d'), '90d');
});

test('Une pagination hostile est bornée', () => {
  assert.equal(normalizePage(null), 1);
  assert.equal(normalizePage('0'), 1);
  assert.equal(normalizePage('-5'), 1);
  assert.equal(normalizePage('abc'), 1);
  assert.equal(normalizePage('999999'), 1000, 'un offset énorme doit être plafonné');
  assert.equal(normalizePage(3), 3);
});

test('Un texte de recherche est nettoyé et borné', () => {
  assert.equal(normalizeText('  mpix  '), 'mpix');
  assert.equal(normalizeText('   '), null);
  assert.equal(normalizeText(null), null);
  assert.equal(normalizeText('a'.repeat(500), 80)?.length, 80);
});

test('Les périodes connues produisent le bon nombre de jours', () => {
  assert.equal(dailyBuckets('7d').length, 7);
  assert.equal(dailyBuckets('30d').length, 30);
  assert.equal(dailyBuckets('90d').length, 90);
  assert.equal(new Set(dailyBuckets('30d')).size, 30, 'aucun jour dupliqué');
  assert.ok(ADMIN_PERIODS.includes(normalizePeriod('7d')));
});

console.log(`\n${passed} groupe(s) vert(s), ${failed} échec(s).`);
if (failed > 0) process.exit(1);
