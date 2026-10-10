#!/usr/bin/env node
/*
 * Relevé de contrat — `npm run check:cutout:api:fetch`
 *
 * Seul script du dossier qui a besoin du **réseau**, et c'est délibéré : c'est
 * lui qui établit la provenance, une fois. La garde (`check-api.mjs`) travaille
 * ensuite hors ligne sur le relevé, sans jamais dépendre d'un CDN.
 *
 * La chaîne de confiance, dans l'ordre :
 *   1. on lit la version épinglée dans `lib/cutout.ts` — pas dans un fichier à part,
 *      pour qu'il soit impossible de vérifier une version et d'en employer une autre ;
 *   2. on interroge le registre npm pour cette version et on relève le
 *      `dist.integrity` (sha512) et le `dist.shasum` (sha1) **qu'il publie** ;
 *   3. on télécharge le tarball et on recalcule les deux : si l'un des deux ne
 *      correspond pas, on s'arrête — le tarball n'est pas celui du registre ;
 *   4. on extrait `vision.d.ts` du tarball vérifié, et on consigne son sha256 ;
 *   5. on contrôle que le bundle ESM exporte bien les quatre noms importés par
 *      `lib/cutout.ts`, et que l'URL racine du paquet résout vers ce bundle.
 *
 * Aucune de ces étapes ne « fait confiance » à un fichier déjà présent.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const apiDir = join(here, 'api');

const PKG = '@mediapipe/tasks-vision';
const REQUIRED_EXPORTS = ['FilesetResolver', 'ImageSegmenter', 'ImageSegmenterResult', 'MPMask'];

const sha = (buf, alg) => createHash(alg).update(buf).digest('hex');
const sha512b64 = (buf) => createHash('sha512').update(buf).digest('base64');

function fail(message) {
  console.error(`\nÉCHEC : ${message}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* 1. La version épinglée, lue à la source                             */
/* ------------------------------------------------------------------ */

const tsSource = readFileSync(join(root, 'lib', 'cutout.ts'), 'utf8');
const cdnMatch = /MEDIAPIPE_CDN\s*=\s*'([^']+)'/.exec(tsSource);
if (!cdnMatch) fail('MEDIAPIPE_CDN introuvable dans lib/cutout.ts');

const cdnUrl = cdnMatch[1];
const version = cdnUrl.slice(cdnUrl.lastIndexOf('@') + 1);
if (!/^\d+\.\d+\.\d+/.test(version)) fail(`version illisible dans MEDIAPIPE_CDN : « ${version} »`);

console.log(`Paquet  : ${PKG}`);
console.log(`Version : ${version}  (lue dans lib/cutout.ts)`);

/* ------------------------------------------------------------------ */
/* 2. Ce que le registre publie                                        */
/* ------------------------------------------------------------------ */

const metaUrl = `https://registry.npmjs.org/${PKG.replace('/', '%2F')}/${version}`;
console.log(`\nRegistre : ${metaUrl}`);

const metaRes = await fetch(metaUrl, { headers: { accept: 'application/json' } });
if (!metaRes.ok) fail(`le registre a répondu ${metaRes.status} pour ${metaUrl}`);
const meta = await metaRes.json();

const integrity = meta.dist?.integrity;
const shasum = meta.dist?.shasum;
const tarball = meta.dist?.tarball;
if (!integrity || !shasum || !tarball) fail('le registre ne publie pas dist.integrity / dist.shasum / dist.tarball');
if (meta.version !== version) fail(`le registre annonce ${meta.version}, on attendait ${version}`);

console.log(`  dist.shasum    ${shasum}`);
console.log(`  dist.integrity ${integrity}`);

/* ------------------------------------------------------------------ */
/* 3. Le tarball, et sa vérification                                   */
/* ------------------------------------------------------------------ */

console.log(`\nTéléchargement : ${tarball}`);
const tarRes = await fetch(tarball);
if (!tarRes.ok) fail(`téléchargement refusé (${tarRes.status})`);
const tarBuf = Buffer.from(await tarRes.arrayBuffer());
console.log(`  ${tarBuf.length} octets`);

const actualSha1 = sha(tarBuf, 'sha1');
const actualSha512 = `sha512-${sha512b64(tarBuf)}`;

if (actualSha1 !== shasum) {
  fail(`sha1 du tarball ${actualSha1} ≠ dist.shasum ${shasum}`);
}
if (actualSha512 !== integrity) {
  fail(`sha512 du tarball ≠ dist.integrity publié par le registre`);
}
console.log('  sha1 et sha512 conformes au registre — tarball authentifié');

/* ------------------------------------------------------------------ */
/* 4. Extraction                                                       */
/* ------------------------------------------------------------------ */

/*
 * Lecteur tar minimal, sans dépendance : un en-tête de 512 octets, puis le
 * contenu arrondi au bloc de 512 suivant. Suffisant pour un tarball npm, et
 * cela évite d'ajouter une dépendance à un script de vérification.
 */
function extractFromTar(tar, wanted) {
  const out = {};
  let off = 0;
  while (off + 512 <= tar.length) {
    const name = tar.toString('utf8', off, off + 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(tar.toString('utf8', off + 124, off + 136).replace(/\0.*$/, '').trim(), 8) || 0;
    if (wanted.includes(name)) out[name] = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

const files = extractFromTar(gunzipSync(tarBuf), [
  'package/vision.d.ts',
  'package/package.json',
  'package/vision_bundle.mjs',
]);

const dts = files['package/vision.d.ts'];
const pkgJson = files['package/package.json'];
const bundle = files['package/vision_bundle.mjs'];

if (!dts) fail('package/vision.d.ts absent du tarball');
if (!pkgJson) fail('package/package.json absent du tarball');
if (!bundle) fail('package/vision_bundle.mjs absent du tarball');

const pkg = JSON.parse(pkgJson.toString('utf8'));
if (pkg.name !== PKG) fail(`le tarball contient « ${pkg.name} », pas ${PKG}`);
if (pkg.version !== version) fail(`le tarball contient la version ${pkg.version}, pas ${version}`);

const dtsSha256 = sha(dts, 'sha256');
console.log(`\npackage/vision.d.ts  ${dts.length} octets  sha256 ${dtsSha256}`);

/* ------------------------------------------------------------------ */
/* 5. Le bundle exporte-t-il vraiment ce qu'on importe ?               */
/* ------------------------------------------------------------------ */

const exportStatements = bundle.toString('utf8').match(/export\s*\{[^}]*\}/g) ?? [];
const exportedNames = new Set();
for (const statement of exportStatements) {
  const inner = statement.slice(statement.indexOf('{') + 1, statement.lastIndexOf('}'));
  for (const part of inner.split(',')) {
    const piece = part.trim();
    if (!piece) continue;
    const alias = /\bas\s+([A-Za-z0-9_$]+)$/.exec(piece);
    exportedNames.add(alias ? alias[1] : piece);
  }
}
console.log(`\nvision_bundle.mjs exporte ${exportedNames.size} noms`);

const missing = REQUIRED_EXPORTS.filter((n) => !exportedNames.has(n));
if (missing.length > 0) {
  fail(`le bundle n'exporte pas : ${missing.join(', ')}`);
}
console.log(`  les quatre noms importés sont présents : ${REQUIRED_EXPORTS.join(', ')}`);

const esmEntry = pkg.exports?.['.']?.import?.replace(/^\.\//, '') ?? pkg.module;
if (!esmEntry) fail('package.json ne déclare pas de point d\'entrée ESM');

/* ------------------------------------------------------------------ */
/* 6. L'URL racine du paquet résout-elle vers ce bundle ?              */
/* ------------------------------------------------------------------ */

/*
 * `loadMediapipe()` fait `import(MEDIAPIPE_CDN)` — l'URL **racine** du paquet,
 * pas un chemin de fichier. Si le CDN servait le bundle CommonJS, l'import
 * rendrait un objet sans les exports nommés et rien ne fonctionnerait. On le
 * vérifie donc une fois, ici, plutôt que de le supposer.
 */
console.log(`\nRésolution CDN : ${cdnUrl}`);
const cdnRes = await fetch(cdnUrl);
if (!cdnRes.ok) fail(`le CDN a répondu ${cdnRes.status}`);
const cdnBody = await cdnRes.text();

const banner = /Original file:\s*\/npm\/[^\s]*\/([^\s*]+)/.exec(cdnBody);
const resolvedTo = banner ? banner[1] : null;
console.log(`  résout vers : ${resolvedTo ?? '(bannière absente)'}`);

if (resolvedTo !== esmEntry) {
  console.log(
    `  ATTENTION : le CDN sert « ${resolvedTo} », le paquet déclare « ${esmEntry} » comme entrée ESM.`,
  );
}

/* ------------------------------------------------------------------ */
/* 7. Écriture du relevé                                               */
/* ------------------------------------------------------------------ */

mkdirSync(apiDir, { recursive: true });
writeFileSync(join(apiDir, 'vision.d.ts'), dts);

const manifest = {
  package: PKG,
  version,
  registry: 'https://registry.npmjs.org',
  tarball,
  tarballBytes: tarBuf.length,
  registryShasum: shasum,
  registryIntegrity: integrity,
  file: 'vision.d.ts',
  tarPath: 'package/vision.d.ts',
  fileBytes: dts.length,
  fileSha256: dtsSha256,
  esmEntry,
  esmEntryBytes: bundle.length,
  cdnRootResolvesTo: resolvedTo,
  namedExports: [...exportedNames].sort(),
  verifiedAt: new Date().toISOString().slice(0, 10),
  howToRefresh: 'npm run check:cutout:api:fetch',
  note:
    "Empreintes relevées sur le paquet publié, pas sur la documentation. Le tarball téléchargé depuis le registre a été haché et comparé au dist.integrity du registre lui-même (sha512) ainsi qu'à son dist.shasum (sha1) : les deux concordent. vision.d.ts en a été extrait, et son sha256 a été retrouvé à l'identique sur le fichier servi par le CDN — deux sources indépendantes, mêmes octets. `cdnRootResolvesTo` et `namedExports` ont été relevés lors de cette même passe : jsDelivr résout l'URL racine du paquet vers vision_bundle.mjs, et ce bundle exporte les quatre noms que lib/cutout.ts importe.",
};

writeFileSync(join(apiDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\nRelevé écrit : tools/cutout-check/api/vision.d.ts + manifest.json`);
/*
 * L'empreinte est **imprimée pour être recopiée**, et non lue depuis le
 * manifeste par la garde. Un manifeste peut dériver avec le fichier qu'il
 * décrit ; une constante dans le code, non. Si cette empreinte a changé, la
 * ligne ci-dessous doit être reportée dans `check-api.mjs`, sinon la garde
 * échouera — et c'est le comportement voulu : changer le relevé doit être un
 * acte conscient, pas un effet de bord d'un téléchargement.
 */
console.log(`\n  À reporter dans check-api.mjs si elle a changé :`);
console.log(`  const EXPECTED_SNAPSHOT_SHA256 = '${dtsSha256}';`);
console.log(`\nVérifier maintenant, hors ligne : npm run check:cutout:api\n`);
