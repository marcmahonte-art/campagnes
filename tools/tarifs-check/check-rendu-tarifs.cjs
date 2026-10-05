#!/usr/bin/env node
/* check:u1-rendu — contrôle le HTML **rendu au serveur** de /tarifs.
 *
 * On mesure le fichier réellement produit par le build statique
 * (`.next/server/app/tarifs.html`) et non le code source : c'est le seul moyen
 * de prouver que les prix sont dans le premier octet servi (exigence « pas de
 * Chargement des formules… », CLS ≈ 0).
 *
 * Les données de reprise d'hydratation (payload RSC) sont retirées : on ne
 * valide que ce qu'un humain voit.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, '.next', 'server', 'app', 'tarifs.html');

const DOIT_ETRE_PRESENT = [
  // Cartes
  'Gratuit',
  'Créateur',
  'Organisations & ONG',
  '0 FCFA',
  '3 000 FCFA',
  '5 000 FCFA',
  // Quotas et coût unitaire (l'argument le plus fort)
  '25 exports',
  '100 distributions incluses par mois',
  '1 000 distributions incluses par mois',
  'soit 30 FCFA par participant',
  'soit 5 FCFA par participant',
  // Sélecteur de durée
  '1 mois',
  '6 mois',
  '12 mois',
  // Paiement
  'Paiement par Mobile Money (Orange, Moov)',
  'Prépaiement',
  // Mise en avant
  'Offre recommandée',
  // Distribution : bandeau + grille repliée
  'Voir la grille des crédits',
  'Acheter des crédits',
  // Entreprise, sans prix
  'Sur devis',
  'Domaine personnalisé',
  'Rapports PDF',
  'Multi-utilisateurs',
  // Réassurance : prépaiement, échéance, rappel (N12)
  'Prépaiement sans reconduction automatique',
  'rappel 7 jours avant',
];

const DOIT_ETRE_ABSENT = [
  'Chargement des formules',
  'Starter',
  'Popular',
  'Growth',
  'Grand volume',
  'pawaPay',
  'PawaPay',
  'Recharger un pack',
  '4 900',
  '19 900',
  'CinetPay',
  'Paydunya',
  'Fedapay',
  'Watermark',
  'Aucun engagement',
];

function texteVisible(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

// --- Falsification : la mesure doit savoir échouer. -------------------------
//
// Témoin : le HTML de la page **avant** la refonte. Il contient à la fois ce qui
// doit rester (les trois noms de formule) et ce qui doit disparaître
// (« Chargement des formules… », 4 900 FCFA, Starter, pawaPay). Exiger que le
// contrôle le rejette prouve qu'il sait dire non.
const TEMOIN_HTML = `
  <p>Chargement des formules…</p>
  <h3>Free</h3><p>4 900 FCFA</p>
  <h3>Creator</h3><p>Redimensionner les affiches sur WhatsApp.</p>
  <h3>Organisation</h3><p>19 900 FCFA</p>
  <details><summary>Starter — 2 500 FCFA</summary></details>
  <p>Connexion sécurisée pawaPay</p>
  <p>Aucun engagement, aucune surprise.</p>
`;
const faux = texteVisible(TEMOIN_HTML);
const fauxDoitEtreRejete =
  DOIT_ETRE_ABSENT.some((s) => faux.includes(s)) &&
  DOIT_ETRE_PRESENT.some((s) => !faux.includes(s));

let failures = 0;
console.log('=== FALSIFICATION ===');
console.log(
  `[${fauxDoitEtreRejete ? 'OK' : 'ECHEC'}] le HTML d'avant-refonte (témoin) est bien rejeté`,
);
if (!fauxDoitEtreRejete) failures++;

if (!fs.existsSync(HTML)) {
  console.error(`\nFichier de rendu absent : ${HTML}\nLance d'abord : npm run build`);
  process.exit(2);
}

const visible = texteVisible(fs.readFileSync(HTML, 'utf8'));

console.log('\n=== PRÉSENCE (contenu visible dans le HTML servi) ===');
for (const s of DOIT_ETRE_PRESENT) {
  const ok = visible.includes(s);
  if (!ok) failures++;
  console.log(`[${ok ? 'OK' : 'ECHEC'}] ${JSON.stringify(s)}`);
}

console.log('\n=== ABSENCE (contenu qui ne doit plus exister) ===');
for (const s of DOIT_ETRE_ABSENT) {
  const ok = !visible.includes(s);
  if (!ok) failures++;
  console.log(`[${ok ? 'OK' : 'ECHEC'}] ${JSON.stringify(s)} encore présent`);
}

console.log('\n=== NOMBRE DE CARTES TARIFAIRES ===');
// Une carte = un titre de niveau 3 dans la grille des formules.
const cartes = (visible.match(/Ce qui est inclus/g) || []).length;
const okCartes = cartes === 3;
if (!okCartes) failures++;
console.log(`[${okCartes ? 'OK' : 'ECHEC'}] ${cartes} carte(s) tarifaire(s) — attendu 3`);

console.log('\n=== BADGE « OFFRE RECOMMANDÉE » ===');
const badges = (visible.match(/Offre recommandée/g) || []).length;
const okBadge = badges === 1;
if (!okBadge) failures++;
console.log(`[${okBadge ? 'OK' : 'ECHEC'}] ${badges} occurrence(s) — attendu 1`);

console.log('\n=== MENTIONS DE PAIEMENT SOUS CTA ===');
const mentions = (visible.match(/sans carte bancaire/g) || []).length;
const okMentions = mentions >= 2;
if (!okMentions) failures++;
console.log(`[${okMentions ? 'OK' : 'ECHEC'}] ${mentions} mention(s) « sans carte bancaire » — attendu au moins 2 (2 cartes payantes)`);

console.log('\n=== VERDICT ===');
if (failures === 0) {
  console.log('CONFORME — le HTML rendu au serveur contient la grille complète.');
  process.exit(0);
}
console.log(`NON-CONFORME — ${failures} échec(s).`);
process.exit(1);