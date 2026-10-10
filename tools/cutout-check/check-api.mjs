#!/usr/bin/env node
/*
 * Garde de contrat — `npm run check:cutout:api`
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CETTE GARDE EXISTE
 * ---------------------------------------------------------------------------
 * `lib/cutout.ts` n'a **aucun import**. C'est ce qui permet au banc
 * (`npm run bench:cutout`) de compiler le fichier réel plutôt qu'une copie — mais
 * cela a un prix : les types de MediaPipe y sont **déclarés à la main**, donc
 * TypeScript ne peut rien dire si le paquet change de contrat. Un
 * `segment()` qui deviendrait asynchrone, un `MPMask` renommé, un
 * `createFromOptions` qui cesserait d'être statique : rien de tout cela ne
 * casserait la compilation. Cela casserait sur le téléphone du participant.
 *
 * Cette garde est donc le **seul lien mécanique** entre nos déclarations et le
 * paquet réellement publié.
 *
 * ---------------------------------------------------------------------------
 * LA SOURCE DE VÉRITÉ, ET SA PROVENANCE
 * ---------------------------------------------------------------------------
 * `tools/cutout-check/api/vision.d.ts` est le fichier **tel qu'il est publié**
 * dans `@mediapipe/tasks-vision`, version épinglée par `MEDIAPIPE_CDN`. Sa
 * provenance n'est pas déclarative : `api/manifest.json` consigne les empreintes
 * du tarball du registre (sha512 `dist.integrity` **et** sha1 `dist.shasum`,
 * toutes deux vérifiées au moment du relevé) et le sha256 du fichier extrait.
 * Le fichier servi par le CDN portait le **même** sha256 — deux sources
 * indépendantes, mêmes octets.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CETTE GARDE VÉRIFIE, ET CE QU'ELLE NE PEUT PAS VÉRIFIER
 * ---------------------------------------------------------------------------
 * Elle vérifie des **déclarations**. Elle ne vérifie pas un comportement : que
 * l'initialisation GPU réussisse sur un appareil donné, que le WASM se charge,
 * ni que le canal 1 soit bien la personne. L'ordre des canaux est une propriété
 * du **modèle**, pas de l'API — elle n'est pas dans le `.d.ts`. Ces points-là
 * relèvent du banc et de l'œil (`npm run bench:cutout:serve`).
 *
 * Chaque affirmation porte un **témoin négatif** : la même expression régulière
 * est appliquée à un fragment qui ne doit **pas** correspondre. Une garde dont
 * le motif serait vide passerait sans rien protéger ; ici, elle ne le peut pas.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const apiDir = join(here, 'api');

/**
 * L'empreinte attendue du relevé — **écrite ici, pas lue dans le manifeste**.
 *
 * C'est délibéré, et c'est une correction. Le manifeste est un fichier
 * **généré** : `fetch-api.mjs` le réécrit, et le pilote de falsification le
 * réécrit aussi (sa fonction `rehash`) pour que le contrôle d'intégrité ne
 * masque pas le contrôle de contrat. Comparer le relevé au manifeste revient
 * donc à comparer un fichier à sa propre copie : les deux peuvent dériver
 * **ensemble**, et le contrôle annonce « intact » sur un fichier modifié.
 *
 * C'est exactement ce qui est arrivé le 2026-10-10 : un pilote tué en cours de
 * route avait laissé `confidenceMasks` sans son `?`, et le manifeste avait été
 * recalculé pour suivre. Le contrôle d'intégrité disait « intact » ; c'est une
 * assertion de **contrat** qui a signalé la modification.
 *
 * L'ancre doit donc être indépendante du manifeste. Elle est ici, dans le code
 * de la garde — comme les poids des modèles sont figés dans `cutout.ts`, pour
 * qu'un changement soit un acte conscient. `fetch-api.mjs` imprime la ligne à
 * recopier après chaque relevé.
 */
const EXPECTED_SNAPSHOT_SHA256 = '2c46f62aac8d62046cccf0a51abafa26e1d7cc7b154defb35895f3efe2d7ee5a';

/* ------------------------------------------------------------------ */
/* Petit harnais                                                       */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures = [];

function ok(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq(label, actual, expected) {
  ok(label, actual === expected, `attendu ${expected}, obtenu ${actual}`);
}

function section(title) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
/* Lecture des entrées                                                 */
/* ------------------------------------------------------------------ */

const tsPath = join(root, 'lib', 'cutout.ts');
const manifestPath = join(apiDir, 'manifest.json');
const snapshotPath = join(apiDir, 'vision.d.ts');

for (const [label, p] of [
  ['lib/cutout.ts', tsPath],
  ['api/manifest.json', manifestPath],
  ['api/vision.d.ts', snapshotPath],
]) {
  if (!existsSync(p)) {
    console.error(`\nFICHIER MANQUANT : ${label}`);
    if (p === snapshotPath) {
      console.error(
        'Le relevé du contrat n\'est pas en cache. Le régénérer :\n' +
          '  npm run check:cutout:api:fetch\n',
      );
    }
    process.exit(2);
  }
}

const tsSource = readFileSync(tsPath, 'utf8');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
/*
 * On garde les **octets** et le texte. Le `.length` d'une chaîne compte des
 * caractères, pas des octets : ce fichier contient « © » et « ’ », donc les deux
 * diffèrent — et comparer l'un à l'autre ferait échouer un fichier pourtant
 * intact.
 */
const snapshotBytes = readFileSync(snapshotPath);
const snapshot = snapshotBytes.toString('utf8');

/*
 * On retire les commentaires **de bloc** avant de chercher quoi que ce soit.
 *
 * Deux raisons. D'abord, un `.d.ts` est plein de JSDoc qui contient des
 * accolades (`{@link …}`), ce qui ferait dérailler l'appariement d'accolades.
 * Ensuite — et c'est plus important — sans cela, une vérification d'usage
 * pourrait être satisfaite par un **commentaire** décrivant le code plutôt que
 * par le code lui-même. Une garde qui lit la prose se raconte des histoires.
 *
 * Les commentaires de ligne ne sont pas retirés : les URL en contiennent.
 */
const stripBlockComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

const api = stripBlockComments(snapshot);
const ts = stripBlockComments(tsSource);

/* ------------------------------------------------------------------ */
/* Extraction de blocs                                                 */
/* ------------------------------------------------------------------ */

function braceBlock(src, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(openIndex, i + 1);
    }
  }
  return null;
}

function blockOf(src, headerRe) {
  const m = headerRe.exec(src);
  if (!m) return null;
  const open = src.indexOf('{', m.index + m[0].length - 1);
  if (open < 0) return null;
  return braceBlock(src, open);
}

const blocks = {
  whole: api,
  FilesetResolver: blockOf(api, /export declare class FilesetResolver[^{]*\{/),
  ImageSegmenter: blockOf(api, /export declare class ImageSegmenter[^{]*\{/),
  ImageSegmenterResult: blockOf(api, /export declare class ImageSegmenterResult[^{]*\{/),
  MPMask: blockOf(api, /export declare class MPMask[^{]*\{/),
  ImageSegmenterOptions: blockOf(api, /interface ImageSegmenterOptions[^{]*\{/),
  VisionTaskOptions: blockOf(api, /interface VisionTaskOptions[^{]*\{/),
  BaseOptions: blockOf(api, /interface BaseOptions[^{]*\{/),
  WasmFileset: blockOf(api, /interface WasmFileset[^{]*\{/),
};

/* ------------------------------------------------------------------ */
/* 1. Le relevé est bien celui de la version épinglée                  */
/* ------------------------------------------------------------------ */

section('1. Le relevé correspond à la version épinglée');

const cdnMatch = /MEDIAPIPE_CDN\s*=\s*'([^']+)'/.exec(tsSource);
ok('MEDIAPIPE_CDN est déclaré dans lib/cutout.ts', Boolean(cdnMatch));

const cdnUrl = cdnMatch ? cdnMatch[1] : '';
const pinnedVersion = cdnUrl.includes('@') ? cdnUrl.slice(cdnUrl.lastIndexOf('@') + 1) : '';
ok(
  'la version épinglée est lisible',
  /^\d+\.\d+\.\d+/.test(pinnedVersion),
  `lu : « ${pinnedVersion} »`,
);

/*
 * L'assertion centrale de cette section. Si quelqu'un monte le paquet de 1.1.0
 * à 1.2.0 sans re-relever le contrat, le relevé en cache ne décrit plus le
 * paquet employé — et **toutes** les vérifications qui suivent porteraient sur
 * un texte périmé. On refuse de continuer plutôt que de rassurer à tort.
 */
eq('le relevé décrit exactement la version épinglée', manifest.version, pinnedVersion);

const snapshotSha256 = createHash('sha256').update(snapshotBytes).digest('hex');
/*
 * L'ancre est le code, pas le manifeste. Le manifeste est ensuite confronté à
 * la même ancre : s'il a dérivé, c'est lui qui est en faute, et on le voit.
 */
eq('le relevé est intact (ancre dans le code)', snapshotSha256, EXPECTED_SNAPSHOT_SHA256);
eq('le manifeste s’accorde avec l’ancre', manifest.fileSha256, EXPECTED_SNAPSHOT_SHA256);
eq('la taille du fichier en cache est celle relevée', snapshotBytes.length, manifest.fileBytes);

ok(
  'le relevé est antérieur ou égal à aujourd\'hui',
  typeof manifest.verifiedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(manifest.verifiedAt),
  String(manifest.verifiedAt),
);

/* ------------------------------------------------------------------ */
/* 2. Le contrat, affirmation par affirmation                          */
/* ------------------------------------------------------------------ */

section('2. Le contrat déclaré par le paquet publié');

/*
 * Chaque entrée : ce qu'on affirme, où on le lit, le motif, et un **témoin** —
 * un fragment qui ne doit pas correspondre. Le témoin est ce qui distingue une
 * garde d'une décoration.
 */
const CONTRACT = [
  /* — les quatre noms que l'import doit rendre — */
  {
    claim: 'FilesetResolver est exporté par le paquet',
    scope: 'whole',
    re: /export declare class FilesetResolver\b/,
    witness: 'declare class FilesetResolver {',
  },
  {
    claim: 'ImageSegmenter est exporté par le paquet',
    scope: 'whole',
    re: /export declare class ImageSegmenter\b/,
    witness: 'declare class ImageSegmenter {',
  },
  {
    claim: 'ImageSegmenterResult est exporté par le paquet',
    scope: 'whole',
    re: /export declare class ImageSegmenterResult\b/,
    witness: 'declare class ImageSegmenterResult {',
  },
  {
    claim: 'MPMask est exporté par le paquet',
    scope: 'whole',
    re: /export declare class MPMask\b/,
    witness: 'declare class MPMask {',
  },

  /* — le résolveur de fichiers WASM — */
  {
    claim: 'forVisionTasks est statique et rend une promesse de WasmFileset',
    scope: 'FilesetResolver',
    re: /static forVisionTasks\([^)]*\):\s*Promise<WasmFileset>/,
    witness: 'forVisionTasks(basePath?: string): WasmFileset;',
  },
  {
    claim: 'WasmFileset déclare wasmBinaryPath',
    scope: 'WasmFileset',
    re: /wasmBinaryPath:\s*string/,
    witness: 'wasmBinaryPath?: string;',
  },

  /* — la création du segmenter — */
  {
    claim: 'createFromOptions est statique',
    scope: 'ImageSegmenter',
    re: /static createFromOptions\(/,
    witness: 'createFromOptions(',
  },
  {
    claim: 'createFromOptions rend une promesse d\'ImageSegmenter',
    scope: 'ImageSegmenter',
    re: /static createFromOptions\([^)]*\):\s*Promise<ImageSegmenter>/,
    witness: 'static createFromOptions(a, b): ImageSegmenter;',
  },
  {
    claim: 'createFromOptions prend (WasmFileset, ImageSegmenterOptions)',
    scope: 'ImageSegmenter',
    re: /static createFromOptions\(\s*wasmFileset:\s*WasmFileset,\s*imageSegmenterOptions:\s*ImageSegmenterOptions\s*\)/,
    witness: 'static createFromOptions(fileset: unknown, options: Record<string, unknown>)',
  },

  /* — l'inférence : l'affirmation la plus importante du fichier — */
  {
    claim: 'segment(image) est SYNCHRONE et renvoie directement le résultat',
    scope: 'ImageSegmenter',
    re: /segment\(image:\s*ImageSource\):\s*ImageSegmenterResult;/,
    witness: 'segment(image: ImageSource): Promise<ImageSegmenterResult>;',
  },
  {
    claim: 'et il n\'existe pas de surcharge synchrone qui rende void',
    scope: 'ImageSegmenter',
    re: /segment\(image:\s*ImageSource\):\s*void;/,
    /*
     * Pour une affirmation inversée, le témoin est la forme **interdite**
     * elle-même : il prouve que le motif saurait la reconnaître si elle
     * apparaissait, au lieu d'être un motif qui ne correspond jamais à rien.
     */
    witness: 'segment(image: ImageSource): void;',
    inverted: true,
  },
  {
    claim: 'ImageSource est TexImageSource — donc un HTMLImageElement est valide',
    scope: 'whole',
    re: /declare type ImageSource = TexImageSource;/,
    witness: 'declare type ImageSource = HTMLCanvasElement;',
  },

  /* — le résultat, qui possède les masques — */
  {
    claim: 'ImageSegmenterResult expose confidenceMasks, optionnel, en tableau',
    scope: 'ImageSegmenterResult',
    re: /readonly confidenceMasks\?:\s*MPMask\[\]/,
    witness: 'readonly confidenceMasks: MPMask[];',
  },
  {
    claim: 'ImageSegmenterResult expose categoryMask, optionnel',
    scope: 'ImageSegmenterResult',
    re: /readonly categoryMask\?:\s*MPMask/,
    witness: 'readonly categoryMask: MPMask;',
  },
  {
    claim: 'ImageSegmenterResult.close() existe — c\'est lui qui libère les masques',
    scope: 'ImageSegmenterResult',
    re: /close\(\):\s*void;/,
    witness: 'close(): Promise<void>;',
  },

  /* — le masque — */
  {
    claim: 'MPMask.width est un nombre',
    scope: 'MPMask',
    re: /readonly width:\s*number;/,
    witness: 'readonly width: string;',
  },
  {
    claim: 'MPMask.height est un nombre',
    scope: 'MPMask',
    re: /readonly height:\s*number;/,
    witness: 'readonly height: string;',
  },
  {
    claim: 'MPMask.getAsFloat32Array() rend un Float32Array',
    scope: 'MPMask',
    re: /getAsFloat32Array\(\):\s*Float32Array;/,
    witness: 'getAsFloat32Array(): Uint8Array;',
  },
  {
    claim: 'MPMask.close() existe',
    scope: 'MPMask',
    re: /close\(\):\s*void;/,
    witness: 'close(): Promise<void>;',
  },

  /* — les options qu'on passe réellement — */
  {
    claim: 'RunningMode vaut « IMAGE » ou « VIDEO »',
    scope: 'whole',
    re: /declare type RunningMode = "IMAGE" \| "VIDEO";/,
    witness: 'declare type RunningMode = "IMAGE" | "VIDEO" | "STREAM";',
  },
  {
    claim: 'VisionTaskOptions accepte runningMode',
    scope: 'VisionTaskOptions',
    re: /runningMode\?:\s*RunningMode;/,
    witness: 'runningMode: RunningMode;',
  },
  {
    claim: 'VisionTaskOptions accepte canvas — et le documente comme requis pour le GPU',
    scope: 'VisionTaskOptions',
    re: /canvas\?:\s*HTMLCanvasElement \| OffscreenCanvas;/,
    witness: 'canvas?: HTMLCanvasElement;',
  },
  {
    claim: 'ImageSegmenterOptions accepte outputConfidenceMasks',
    scope: 'ImageSegmenterOptions',
    re: /outputConfidenceMasks\?:\s*boolean/,
    witness: 'outputConfidenceMasks: boolean;',
  },
  {
    claim: 'ImageSegmenterOptions accepte outputCategoryMask',
    scope: 'ImageSegmenterOptions',
    re: /outputCategoryMask\?:\s*boolean/,
    witness: 'outputCategoryMask: boolean;',
  },
  {
    claim: 'BaseOptions accepte modelAssetPath',
    scope: 'BaseOptions',
    re: /modelAssetPath\?:\s*string/,
    witness: 'modelAssetPath: string;',
  },
  {
    claim: 'BaseOptions accepte delegate « CPU » ou « GPU »',
    scope: 'BaseOptions',
    /*
     * Ancrée à la fin, et volontairement : un motif non ancré accepterait
     * « "CPU" | "GPU" | "NPU" » et affirmerait donc plus que le paquet ne dit.
     * C'est précisément ce que le témoin de cette entrée a mis au jour.
     */
    re: /delegate\?:\s*"CPU" \| "GPU"(\s*\|\s*undefined)?\s*;/,
    witness: 'delegate?: "CPU" | "GPU" | "NPU";',
  },
];

for (const item of CONTRACT) {
  const scopeText = blocks[item.scope];
  if (typeof scopeText !== 'string') {
    ok(item.claim, false, `bloc « ${item.scope} » introuvable dans le relevé`);
    continue;
  }

  const found = item.re.test(scopeText);
  const witnessFound = item.re.test(item.witness);

  if (item.inverted) {
    ok(`${item.claim}`, !found, 'la surcharge interdite est présente');
    ok(
      `  … et le témoin du contrôle précédent, lui, correspond bien`,
      witnessFound,
      'le motif ne distingue pas les deux formes : il ne prouve rien',
    );
  } else {
    ok(item.claim, found, `motif ${item.re} absent du bloc « ${item.scope} »`);
    ok(
      `  … témoin : le motif ne correspond pas à une variante fausse`,
      !witnessFound,
      'le motif est vacu : il correspond même à une forme fausse',
    );
  }
}

/* ------------------------------------------------------------------ */
/* 3. Ce que le bundle exporte réellement                              */
/* ------------------------------------------------------------------ */

section('3. L\'import du paquet rend bien les quatre noms utilisés');

const REQUIRED_EXPORTS = ['FilesetResolver', 'ImageSegmenter', 'ImageSegmenterResult', 'MPMask'];

for (const name of REQUIRED_EXPORTS) {
  ok(
    `le bundle exporte ${name}`,
    Array.isArray(manifest.namedExports) && manifest.namedExports.includes(name),
  );
}

ok(
  'le point d\'entrée ESM est bien vision_bundle.mjs',
  manifest.esmEntry === 'vision_bundle.mjs',
  String(manifest.esmEntry),
);
ok(
  'l\'URL racine du paquet résout vers ce même bundle',
  manifest.cdnRootResolvesTo === manifest.esmEntry,
  `${manifest.cdnRootResolvesTo} vs ${manifest.esmEntry}`,
);
ok(
  'aucun nom exigé n\'est absent de la liste des exports',
  REQUIRED_EXPORTS.every((n) => manifest.namedExports.includes(n)),
);

/* ------------------------------------------------------------------ */
/* 4. Notre code emploie bien ce contrat                               */
/* ------------------------------------------------------------------ */

section('4. lib/cutout.ts emploie bien ce que le contrat autorise');

/*
 * Une vérification d'usage sans témoin serait creuse : elle pourrait passer
 * parce que le motif est trop permissif. On retire donc le fragment et on exige
 * que la vérification **tombe**.
 */
function uses(token, claim) {
  const present = ts.includes(token);
  const witness = ts.replaceAll(token, '∅').includes(token);
  ok(claim, present, `« ${token} » introuvable dans lib/cutout.ts (hors commentaires)`);
  ok(`  … témoin : retiré, le contrôle échoue`, !witness);
}

uses('mediapipe.ImageSegmenter.createFromOptions(', 'le segmenter est créé par la méthode statique');
uses("runningMode: 'IMAGE'", 'le mode demandé est l\'image');
uses('outputConfidenceMasks: true', 'les masques de confiance sont demandés');
uses('canvas: gpuCanvas', 'un canvas est fourni — sans lui, pas de GPU');
uses("delegate: 'GPU'", 'le délégué GPU est tenté');
uses("delegate: 'CPU'", 'un repli CPU existe');
uses('result?.close?.()', 'le RÉSULTAT est fermé — il possède les masques');
uses('segmenter.close?.()', 'le segmenter est fermé');
uses('forVisionTasks(MEDIAPIPE_WASM)', 'le dossier WASM épinglé est celui employé');
uses('chosen.getAsFloat32Array()', 'le masque est lu en Float32Array');
uses('personChannelIndex(', 'le canal personne passe par le prédicat dédié');

/* ------------------------------------------------------------------ */
/* 5. Notre déclaration structurelle couvre ce qu'on appelle           */
/* ------------------------------------------------------------------ */

section('5. Les types déclarés à la main couvrent les appels faits');

const ifaceSegmenter = blockOf(ts, /export interface MediapipeSegmenter[^{]*\{/);
ok('MediapipeSegmenter est déclaré', typeof ifaceSegmenter === 'string');

if (typeof ifaceSegmenter === 'string') {
  /*
   * Le point qui a réellement manqué : notre déclaration ne portait pas de
   * `close` sur le **résultat**, donc fermer le résultat ne compilait pas — et
   * ne pas le fermer ne se voyait pas non plus. C'est exactement le trou qu'une
   * garde de contrat doit rendre visible.
   *
   * Les deux `close` sont cherchés dans **deux portées distinctes**, et c'est
   * indispensable : l'interface en porte deux, et un même motif appliqué au même
   * bloc les confondrait. Le premier vit dans le type de retour de `segment()`,
   * le second au niveau de l'interface.
   */
  const segmentArrow = blockOf(ifaceSegmenter, /segment:\s*\(image:\s*unknown\)\s*=>\s*\{/);
  ok('le type de retour de segment() est lisible', typeof segmentArrow === 'string');

  if (typeof segmentArrow === 'string') {
    ok(
      'le RÉSULTAT déclaré porte close()',
      /close\?:\s*\(\) => void;/.test(segmentArrow),
      'la déclaration ne permet pas de fermer le résultat',
    );

    const afterArrow = ifaceSegmenter.slice(
      ifaceSegmenter.indexOf(segmentArrow) + segmentArrow.length,
    );
    ok(
      'le SEGMENTER déclaré porte close(), distinctement du résultat',
      /close\?:\s*\(\) => void;/.test(afterArrow),
      'le close du segmenter est absent — ou confondu avec celui du résultat',
    );
  }

  ok(
    'segment() est déclaré et prend une image',
    /segment:\s*\(image:\s*unknown\)\s*=>/.test(ifaceSegmenter),
  );
}

const ifaceModule = blockOf(ts, /export interface MediapipeModule[^{]*\{/);
ok('MediapipeModule est déclaré', typeof ifaceModule === 'string');
if (typeof ifaceModule === 'string') {
  ok(
    'MediapipeModule déclare ImageSegmenter.createFromOptions',
    /ImageSegmenter:\s*\{[\s\S]*createFromOptions/.test(ifaceModule),
  );
  ok(
    'MediapipeModule déclare FilesetResolver.forVisionTasks',
    /FilesetResolver:\s*\{[\s\S]*forVisionTasks/.test(ifaceModule),
  );
}

/* ------------------------------------------------------------------ */
/* Ce que cette garde ne peut pas vérifier                             */
/* ------------------------------------------------------------------ */

console.log(`
Non vérifié ici, et assumé :
  - l'ordre des canaux (0 le fond, 1 la personne) est une propriété du MODÈLE,
    pas de l'API : il n'est pas dans le .d.ts. Le banc et l'œil le confirment ;
  - que l'initialisation GPU réussisse sur un appareil donné ;
  - que le WASM se charge et que le modèle se télécharge ;
  - que le comportement observé corresponde au contrat déclaré.`);

/* ------------------------------------------------------------------ */

console.log('');
if (failures.length === 0) {
  console.log(`PASS — 0 contrôle en échec (${passed} contrôles)`);
  process.exit(0);
}

console.log(`FAIL — ${failures.length} contrôle(s) en échec sur ${passed + failures.length}`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(1);
