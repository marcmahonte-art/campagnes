#!/usr/bin/env node
/* check:ui-tarifs (U1) — contrôles falsifiables de la refonte /tarifs.
 *
 * Principe du projet : « un contrôle qui ne peut pas échouer ne prouve rien ».
 * Ce script FALSIFIE donc chaque contrôle en injectant une occurrence que l'on
 * sait fautive, et exige de la détecter AVANT de faire confiance au résultat réel.
 *
 * Contrôles :
 *  1. N9  — aucun montant obsolète 4 900 / 19 900 dans app|components|lib
 *  2. N11 — aucune occurrence affichable de « pawapay » dans components|
 *           (les URL de route /api/payments/pawapay/** et le dossier de route sont exclus :
 *            ce sont des chemins réseau, jamais rendus à l'écran)
 *  3. N3  — aucun montant FCFA codé en dur dans components/plans (hors lib/pricing/config)
 *  4. N11 — aucun libellé de passerelle (CinetPay, PayDunya, FedaPay, Stripe, PayPal)
 *  5. N12 — aucune mention de « reconduction automatique » (affirmative)
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

// --- Faux résultat : on modélise des « occurrences » pour tester la règle. -----
// Chaque contrôle est une paire { regle, exemplesFautifs } : la MÊME fonction de
// détection doit renvoyer « faute » sur l'exemple fautif et « propre » sur du bon texte.
function findMatches(text, regex) {
  const out = [];
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[0]);
  return out;
}

const CONTROLS = [
  {
    id: 'N9-montants-obsoletes',
    desc: 'aucun montant obsolète 4 900 / 19 900',
    regex: /4\s?900|19\s?900/g,
    fautif: 'Prix : 4 900 FCFA',
    propre: 'Prix : 5 000 FCFA',
    excludeUrl: false,
  },
  {
    id: 'N11-pawapay-affichable',
    desc: 'aucune occurrence affichable de « pawapay » (hors URL de route)',
    regex: /pawapay/gi,
    fautif: 'Payez avec pawaPay en toute sécurité',
    propre: 'Payez par Mobile Money (Orange, Moov)',
    excludeUrl: true,
  },
  {
    id: 'N11-passerelles',
    desc: 'aucun libellé de passerelle concurrente',
    regex: /cinetpay|paydunya|fedapay|stripe|paypal/gi,
    fautif: 'Propulsé par CinetPay',
    propre: 'Paiement par Mobile Money (Orange, Moov)',
    excludeUrl: false,
  },
  {
    id: 'N12-reconduction-auto',
    desc: 'aucune reconduction automatique affirmée',
    regex: /reconduction automatique|renouvellement automatique|pr[ée]l[eè]vement automatique/gi,
    fautif: 'Renouvellement automatique chaque mois.',
    propre: 'Prépaiement sans reconduction automatique.',
    /*
     * Piège de ce contrôle : le libellé CONFORME contient les mots
     * « reconduction automatique », mais négés (« sans reconduction
     * automatique », « ni prélèvement automatique »). Compter les occurrences
     * reviendrait donc à reprocher au code d'avoir écrit la règle qu'il est censé
     * vérifier.
     *
     * La règle réelle est : ces mots ne doivent apparaître que négés. D'où un
     * masque qui absorbe une négation (`sans`, `ni`, `pas`, `jamais`, `aucun`)
     * devant le terme, avec un ou deux mots d'intermède (`de`, `d'un`, `de la`).
     * `skipComments` : la règle vise le texte affiché, pas les commentaires de
     * code — qui, eux, parlent précisément de ce qu'il ne faut pas promettre.
     */
    negShield:
      /(?:sans|ni|pas de|jamais|aucun(?:e)?|aucun(?:e)? de)\s+(?:\S+\s+){0,2}?(?:reconduction|renouvellement|pr[ée]l[eè]vement)\s+automatique/i,
    skipComments: true,
  },
];

function falsify(ctl) {
  const hitsFautif = findMatches(ctl.fautif, ctl.regex).filter(
    (m) => !(ctl.negShield && ctl.negShield.test(ctl.fautif)),
  );
  const hitsPropre = findMatches(ctl.propre, ctl.regex).filter(
    (m) => !(ctl.negShield && ctl.negShield.test(ctl.propre)),
  );
  const detecteFautif = hitsFautif.length > 0; // DOIT être vrai
  const acceptePropre = hitsPropre.length === 0; // DOIT être vrai
  return {
    detecteFautif,
    acceptePropre,
    ok: detecteFautif && acceptePropre,
    hitsFautif,
    hitsPropre,
  };
}

// --- Collecte réelle des fichiers. -------------------------------------------
function walk(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/*
 * Une ligne est-elle un commentaire ?
 *
 * Le cas difficile est la **ligne de continuation** d'un bloc `/** … *\/` :
 * elle commence par du texte (`« 15 000 FCFA »` y est cité), pas par `*`. Une
 * détection par `^\s*\*` la classerait comme du code, et le contrôle
 * reprocherait au développeur d'avoir écrit un avertissement.
 *
 * On suit donc l'état du bloc : `dansBloc` reste vrai de l'ouverture à la
 * fermeture, quelle que soit la forme de la ligne.
 */
function scanAvecEtatComments(lignes) {
  let dansBloc = false;
  return lignes.map((line) => {
    const estComment =
      dansBloc ||
      /^\s*(\/\/|\/\*|\*)/.test(line) ||
      /\/\*.*\*\/\s*$/.test(line) /* bloc ouvert et refermé sur la ligne */;
    if (line.includes('/*')) dansBloc = true;
    if (dansBloc && line.includes('*/')) dansBloc = false;
    return estComment;
  });
}

function scan(
  dir,
  regex,
  { excludeApiRouteFolder = false, excludeUrlLines = false, negShield, skipComments = false } = {},
) {
  const results = [];
  for (const f of walk(path.join(ROOT, dir), [])) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (excludeApiRouteFolder && rel.startsWith('app/api/payments/pawapay/')) continue;
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    const estComment = scanAvecEtatComments(lines);
    lines.forEach((line, i) => {
      const isComment = estComment[i];
      // Commentaire : hors périmètre de ce contrôle (qui porte sur le texte
      // affiché), sauf si le contrôle demande précisément de les ignorer.
      if (skipComments && isComment) return;
      // Négation : « sans reconduction automatique » est la formulation exigée,
      // pas une promesse. On l'écarte avant de compter.
      if (negShield && negShield.test(line)) return;
      const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
      let m;
      while ((m = re.exec(line)) !== null) {
        if (excludeUrlLines && isComment) continue;
        // Pour pawapay : on retient la ligne si ce n'est PAS uniquement une URL de route.
        if (
          excludeUrlLines &&
          /['"`]\/api\/payments\/pawapay\//.test(line) &&
          !/[^/'"]pawapay[^/'"]/i.test(line.replace(/\/api\/payments\/pawapay\/[^'"`]*/gi, ''))
        ) {
          continue;
        }
        results.push({ file: rel, line: i + 1, text: line.trim().slice(0, 110) });
      }
    });
  }
  return results;
}

let failures = 0;
let partiel = 0;

console.log('=== FALSIFICATION (le contrôle doit échouer sur un cas fautif connu) ===');
for (const ctl of CONTROLS) {
  const f = falsify(ctl);
  const status = f.ok ? 'OK' : 'ECHEC';
  if (!f.ok) failures++;
  console.log(`[${status}] ${ctl.id} — detecte_fautif=${f.detecteFautif} accepte_propre=${f.acceptePropre}`);
  if (!f.ok) {
    console.log(`        fautif="${ctl.fautif}" -> ${JSON.stringify(f.hitsFautif)}`);
    console.log(`        propre="${ctl.propre}" -> ${JSON.stringify(f.hitsPropre)}`);
  }
}

console.log('\n=== MESURE RÉELLE ===');
const real = [];
for (const ctl of CONTROLS) {
  const shield = { negShield: ctl.negShield, skipComments: ctl.skipComments };
  const hits = ctl.id === 'N11-pawapay-affichable'
    ? scan('components', ctl.regex, { excludeUrlLines: true }).concat(
        scan('app/tarifs', ctl.regex, { excludeApiRouteFolder: true, excludeUrlLines: true }),
      )
    : ctl.id.startsWith('N11-passerelles') || ctl.id === 'N9-montants-obsoletes'
      ? scan('app', ctl.regex, { excludeApiRouteFolder: true }).concat(
          scan('components', ctl.regex), scan('lib', ctl.regex),
        )
      // N12 : toute la surface visible de la page tarifs, pas seulement
      // components/plans — une promesse de reconduction peut être écrite dans
      // la page elle-même.
      : ctl.id === 'N12-reconduction-auto'
        ? scan('components', ctl.regex, shield).concat(scan('app', ctl.regex, shield))
        : scan('components/plans', ctl.regex);
  const all = hits;
  real.push({ id: ctl.id, count: all.length, hits: all });
  const st = all.length === 0 ? 'OK' : 'ECHEC';
  if (all.length !== 0) failures++;
  console.log(`[${st}] ${ctl.id} (${ctl.desc}) -> ${all.length} occurrence(s)`);
  all.slice(0, 10).forEach((h) => console.log(`        ${h.file}:${h.line}  ${h.text}`));
}

/*
 * N3 — aucun montant en dur dans une surface qui affiche des prix.
 *
 * Périmètre : la page tarifs ET les composants de plans. Un montant recopié dans
 * le JSX est la faute classique : la config change, la page continue d'afficher
 * l'ancien prix, et personne ne s'en aperçoit avant qu'un client ne paye.
 *
 * Le motif cherche un nombre de 4 chiffres ou plus suivi de « FCFA », ou un
 * nombre à 4 chiffres tout court dans du texte affichable (une période, un
 * volume recopié à la main). Les valeurs techniques (millisecondes, timeouts,
 * codes HTTP) sont hors de ce fichier de toute façon.
 */
const MONTANT_REGEX = /\d[\d\u202f\u00a0  ]{2,}\s?FCFA|\b\d{4,}\b/g;

/*
 * Les commentaires sont ignorés : N3 porte sur ce que l'utilisateur **voit**.
 * Un commentaire qui explique un montant dans une phrase (« ne jamais afficher
 * « 15 000 FCFA / mois » ») est au contraire une protection : sans lui, on
 * finirait par corriger le commentaire au lieu du code. La règle porte sur le
 * texte affiché, donc `skipComments`.
 */
const N3_OPTIONS = { skipComments: true };

/*
 * Falsification N3 : on écrit un montant fautif **dans un fichier réellement
 * scanné**, on exige que le contrôle le voie, puis on efface le fichier.
 * Tester la regex sur une chaîne en mémoire ne prouverait rien — le contrôle
 * pourrait échouer sur le vrai dépôt pour une raison sans rapport (parcours de
 * fichiers, extensions filtrées) tout en passant le témoin.
 */
const FAUX_FICHIER = path.join(ROOT, 'components', 'plans', '.n3-falsification.tsx');
let falsifieN3 = false;
try {
  fs.writeFileSync(FAUX_FICHIER, 'export const x = "3 000 FCFA";\n', 'utf8');
  falsifieN3 = scan('components/plans', MONTANT_REGEX, N3_OPTIONS).length > 0;
} finally {
  fs.rmSync(FAUX_FICHIER, { force: true });
}
console.log(
  `[${falsifieN3 ? 'OK' : 'ECHEC'}] falsification N3 — un montant en dur injecté dans components/plans est détecté`,
);
if (!falsifieN3) failures++;

const n3 = scan('app/tarifs', MONTANT_REGEX, N3_OPTIONS).concat(
  scan('components/plans', MONTANT_REGEX, N3_OPTIONS),
);
console.log(`[${n3.length === 0 ? 'OK' : 'ECHEC'}] N3-montant-en-dur (/tarifs + components/plans) -> ${n3.length}`);
if (n3.length) failures++;
n3.slice(0, 10).forEach((h) => console.log(`        ${h.file}:${h.line}  ${h.text}`));

console.log('\n=== VERDICT ===');
if (failures === 0) {
  console.log('CONFORME — tous les contrôles passent ET sont falsifiables.');
  process.exit(0);
} else {
  console.log(`NON-CONFORME — ${failures} échec(s).`);
  process.exit(1);
}
