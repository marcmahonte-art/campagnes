/**
 * Contrôle du CONTRAT DES LIENS DE DISTRIBUTION.
 *
 * RÈGLES MÉTIERS VÉRIFIÉES
 *   1. Le quota d'un lien de distribution est **indépendant** de celui de la
 *      campagne. Un lien compte les téléchargements d'une diffusion précise —
 *      un client, un événement — il ne prolonge ni ne recopie le quota global.
 *
 *   2. Un lien est **persistant**. Il vit en base, pas dans l'état du
 *      composant : un rechargement doit rendre le même lien, avec le même
 *      quota, les mêmes usages et le même statut. L'écran doit donc *relire*
 *      les liens, pas seulement les retenir après une création.
 *
 *   3. Les deux adresses sont **différenciées** : `/c/:slug` est l'adresse
 *      publique, `/d/:token` est le lien privé. Les désigner deux fois sous
 *      deux noms différents fait chercher à l'utilisateur un second lien qui
 *      n'existe pas.
 *
 * POURQUOI UN CONTRÔLE ET PAS UN COMMENTAIRE
 *   L'invariant du point 1 est écrit noir sur blanc dans
 *   `lib/backend/types.ts`, et l'écran l'a pourtant enfreint :
 *   `generatePrivateLink()` passait `campaign.participants_granted` à la RPC.
 *   Le résultat était plausible — un quota du même ordre de grandeur — donc le
 *   défaut ne se voyait pas. Le point 2 a le même défaut : un lien qui
 *   disparaît au rechargement ressemble à un lien qui n'a jamais existé, alors
 *   qu'il continue d'ouvrir la campagne. Ce sont des erreurs silencieuses, donc
 *   exactement celles qu'un contrôle doit attraper.
 *
 * Usage : npm run check:distribution:contract
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

let passed = 0;
let failed = 0;

function ok(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  ok     ${label}`);
  } else {
    failed++;
    console.log(`  ECHEC  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Racine du projet.
 *
 * Ce module est compilé dans `tools/distribution-check/build/tools/…` : un
 * nombre fixe de `..` se cale sur l'arborescence de sortie et casse dès que le
 * chemin change. On remonte donc jusqu'au `package.json`, qui, lui, ne bouge
 * pas. (Le `..` × 3 d'origine pointait sur `tools/distribution-check` — le
 * contrôle échouait sur un `ENOENT` avant même d'avoir lu quoi que ce soit.)
 */
function findRoot(): string {
  let dir = __dirname;
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Aucun package.json au-dessus de ${__dirname}`);
    }
    dir = parent;
  }
  return dir;
}

const ROOT = findRoot();

/** Lit un fichier du projet, en échouant proprement s'il a bougé. */
function read(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

/**
 * Retire les commentaires.
 *
 * Un libellé n'existe que s'il est **rendu** : dire « ce titre était
 * "Lien de participation" » dans une explication ne l'affiche à personne.
 * Tester le source cru ferait échouer le contrôle sur la justification
 * d'une correction — exactement l'inverse de ce qu'on veut mesurer.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/* ------------------------------------------------------------------ */
/* 1. Le contrat du backend                                            */
/* ------------------------------------------------------------------ */

console.log('=== 1. Contrat `createDistributionLink` ===');

const types = read('lib/backend/types.ts');

ok(
  'le contrat documente la séparation des deux quotas',
  /distinct/i.test(types) && /participants_granted/.test(types),
  'la note d’invariant a-t-elle été supprimée ?',
);
ok(
  'le quota est un paramètre explicite, non optionnel',
  /createDistributionLink\(\s*campaignId:\s*string,\s*quota:\s*number,/.test(types),
);

/* ------------------------------------------------------------------ */
/* 2. La lecture qui rend un lien persistant                           */
/* ------------------------------------------------------------------ */

console.log('\n=== 2. Persistance — lecture des liens existants ===');

ok(
  'le contrat expose la lecture des liens de la campagne',
  /listDistributionLinks\(\s*campaignId:\s*string\):\s*Promise<Result<DistributionLink\[\]>>/.test(
    types,
  ),
  'sans cette lecture, un lien ne survit pas à un rechargement',
);

const supabase = read('lib/backend/supabase.ts');
const local = read('lib/backend/local.ts');
const service = read('lib/distribution-service.ts');

ok(
  'l’implémentation Supabase implémente cette lecture',
  /async listDistributionLinks\(/.test(supabase),
);
ok(
  'l’implémentation locale l’implémente aussi (même contrat)',
  /async listDistributionLinks\(/.test(local),
);
ok(
  'le service délègue sans reconstruire la requête',
  /listDistributionLinks\(campaignId:\s*string\)/.test(service) &&
    /backend\.listDistributionLinks\(/.test(service),
);

/* ------------------------------------------------------------------ */
/* 3. Source du quota dans l’éditeur de campagne                       */
/* ------------------------------------------------------------------ */

console.log('\n=== 3. Source du quota dans l’éditeur de campagne ===');

const editor = read('app/(creator)/campaigns/[id]/page.tsx');
/** Le même source, sans commentaires : ce qui est réellement rendu. */
const ui = stripComments(editor);

// La RPC est appelée via le service. On isole l'appel pour lire son argument.
const callMatch = editor.match(/distributionService\.createDistributionLink\(\s*([^)]*)\)/);
const callArgs = callMatch ? callMatch[1] : '';

ok(
  'l’appel à la RPC existe',
  callMatch !== null,
  'generatePrivateLink() a-t-elle été retirée ?',
);
ok(
  'l’appel NE passe PAS `participants_granted` en quota',
  !/participants_granted/.test(callArgs),
  callArgs ? `arguments lus : ${callArgs.replace(/\s+/g, ' ').trim()}` : '',
);
ok(
  'l’appel transmet une valeur saisie indépendante',
  /quota/.test(callArgs),
  callArgs ? `arguments lus : ${callArgs.replace(/\s+/g, ' ').trim()}` : '',
);

/* ------------------------------------------------------------------ */
/* 4. Garde de saisie                                                  */
/* ------------------------------------------------------------------ */

console.log('\n=== 4. Garde de saisie du quota ===');

ok(
  'un quota non numérique ou nul est refusé avant l’appel',
  /Number\.parseInt\(privateQuota/.test(editor) && /quota\s*<=\s*0/.test(editor),
);
ok(
  'la valeur proposée est 1000, pas une valeur détournée de la campagne',
  /useState\('1000'\)/.test(editor) && /privateQuota, setPrivateQuota/.test(editor),
);
ok(
  'le champ porte le libellé métier « Nombre d’utilisations »',
  /Nombre d[’']utilisations/.test(ui),
);

/* ------------------------------------------------------------------ */
/* 5. Le lien est relu depuis la base, pas retenu en mémoire           */
/* ------------------------------------------------------------------ */

console.log('\n=== 5. Persistance affichée à l’écran ===');

ok(
  'l’écran recharge les liens à l’ouverture',
  /distributionService\.listDistributionLinks\(/.test(editor),
);
ok(
  'l’écran les stocke dans une liste, pas dans un jeton local',
  /useState<DistributionLink\[\]>\(\[\]\)/.test(editor),
);
ok(
  'la création relit la liste au lieu de conserver le jeton renvoyé',
  /createDistributionLink[\s\S]{0,400}?refreshPrivateLinks\(/.test(editor),
);
ok(
  'l’ancienne promesse « ce jeton ne s’affichera plus au rechargement » a disparu',
  !/ne s[’']affichera plus au rechargement/.test(ui),
  'l’écran affirmait un défaut qu’il devait corriger',
);
ok(
  'chaque lien affiche son quota et ses usages',
  /quotaUsed/.test(editor) && /quotaTotal/.test(editor),
);
ok(
  'chaque lien affiche son expiration, quand il y en a une',
  /expiresAt/.test(editor) && /Expire le/.test(ui),
);
ok(
  'un lien mort est signalé plutôt que proposé à l’ouverture',
  /Lien expiré/.test(ui) && /disabled=\{!usable\}/.test(editor),
);

/* ------------------------------------------------------------------ */
/* 6. Terminologie : deux liens, deux noms                             */
/* ------------------------------------------------------------------ */

console.log('\n=== 6. Différenciation des deux liens ===');

ok(
  'le doublon « Lien de participation » a disparu de l’écran',
  !/Lien de participation/.test(ui),
);
ok(
  'le bloc privé s’appelle « Lien privé de distribution »',
  /Lien privé de distribution/.test(ui),
);
ok(
  'l’adresse publique reste nommée « Adresse publique »',
  /Adresse publique/.test(ui),
);
ok(
  'les URLs passent par les helpers partagés, pas par des chaînes recopiées',
  /publicCampaignUrl\(/.test(editor) && /privateDistributionUrl\(/.test(editor),
  '§15 : une seule source par URL',
);
ok(
  'aucun bouton « Régénérer » sans fonction derrière',
  !/Régénér/i.test(ui),
  '§9 : le texte doit refléter un comportement réel',
);

/* ------------------------------------------------------------------ */
/* 7. Aucun nouveau système parallèle                                  */
/* ------------------------------------------------------------------ */

console.log('\n=== 7. Réutilisation du système existant ===');

ok(
  'la route /d/[token] est toujours la seule route privée',
  existsSync(join(ROOT, 'app/d/[token]/page.tsx')),
);

/** Les migrations du projet, triées par numéro. */
const migrationFiles = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort();

ok(
  'la migration 0009 (création, résolution, RLS) est toujours là',
  migrationFiles.includes('0009_distribution_activation.sql') &&
    migrationFiles.includes('0008_distribution_links.sql'),
);

// Un système parallèle, c'est une seconde définition de la même fonction dans
// une autre migration. On regarde donc partout, pas seulement dans 0009.
const redefining = migrationFiles.filter((name) =>
  /create or replace function public\.create_distribution_link\s*\(/.test(
    readFileSync(join(ROOT, 'supabase/migrations', name), 'utf8'),
  ),
);
ok(
  'aucune autre migration ne redéfinit `create_distribution_link`',
  redefining.length === 1 && redefining[0] === '0009_distribution_activation.sql',
  redefining.length ? `définie dans : ${redefining.join(', ')}` : 'plus aucune définition',
);

/* ------------------------------------------------------------------ */
/* 8. Les deux routes : résolution du jeton, parcours non dupliqué      */
/* ------------------------------------------------------------------ */

console.log('\n=== 8. Routes /c/:slug et /d/:token ===');

const publicRoute = read('app/c/[slug]/participant-campaign.tsx');
const privateRoute = read('app/d/[token]/page.tsx');

ok(
  '§1 — la route publique charge la campagne par son slug',
  /getPublicCampaign\(/.test(publicRoute),
);
ok(
  '§4 — la route privée charge la campagne par la résolution du jeton',
  /getPrivateCampaign\(/.test(privateRoute),
);
ok(
  '§14 — les deux routes rendent le MÊME parcours participant',
  /ParticipantJourney/.test(publicRoute) && /ParticipantJourney/.test(privateRoute),
  'deux parcours parallèles seraient deux comportements divergents',
);
ok(
  '§13 — la route privée tait le partage : le jeton ne doit jamais se diffuser',
  /sharing=\{false\}/.test(privateRoute),
  'partager depuis /d/:token publierait le secret d’accès',
);

console.log(`\n=== ${passed} réussis / ${failed} échoués ===`);
process.exit(failed === 0 ? 0 : 1);
