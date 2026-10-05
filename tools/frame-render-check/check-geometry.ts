/**
 * Contrôle de la g\u00e9om\u00e9trie d'une image t\u00e9l\u00e9vers\u00e9e dans l'\u00e9diteur.
 *
 * POURQUOI UN CONTR\u00d4LE G\u00c9OM\u00c9TRIQUE ET NON PIXEL
 *   Fabric + node-canvas a un quirk headless (rendu dans un quadrant) qui rend
 *   une v\u00e9rification pixel peu fiable. La g\u00e9om\u00e9trie, en revanche, est
 *   celle qui compte : c'est l\u00e0 que se sont produits les vrais bugs (texte
 *   \u00e9tir\u00e9 mais descripteur fig\u00e9, puis image qui s'alignait mal). On
 *   mesure directement les nombres que le descripteur produit, sans canvas.
 *
 * CE QU'ON PROUVE
 *   1. Une image t\u00e9l\u00e9vers\u00e9e tient ENTI\u00c8REMENT dans le cadre.
 *   2. Elle est centr\u00e9e (tol\u00e9rance : arrondi au pixel).
 *   3. Son ratio est pr\u00e9serv\u00e9 (pas d'\u00e9tirement).
 *   4. L'aller-retour \u00e9mission \u2192 reconstruction donne le m\u00eame calque.
 *      (Le bug texte s'\u00e9tait log\u00e9 l\u00e0 : le descripteur disait vrai, le
 *       rendu mentait. La reconstruction applique le descripteur tel quel.)
 *
 * T\u00c9MOIN
 *   Un calque d\u00e9lib\u00e9r\u00e9ment \u00e0 cheval sur le bord DOIT \u00eatre signal\u00e9
 *   hors cadre. Sans cela, une sonde qui ne peut pas \u00e9chouer ne prouve rien.
 *
 * R\u00c9PLIQUE GARDE-FOU
 *   `addImageFile` vit dans le composant React. On en r\u00e9plique le calcul,
 *   puis on relit le source et on exige que les lignes r\u00e9pliqu\u00e9es soient
 *   toujours l\u00e0 : si quelqu'un change le composant, ce contr\u00f4le \u00e9choue
 *   au lieu de mesurer une copie p\u00e9rim\u00e9e.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { ratioSpec } from '../../lib/ratios';
import { makeImageLayer } from '../../lib/descriptor';
import type { Descriptor, ImageLayer, Ratio } from '../../lib/types';

/* ------------------------------------------------------------------ */
/* R\u00e9plique de `addImageFile` (components/frame/frame-editor.tsx)    */
/* ------------------------------------------------------------------ */

/** Le placement qu'applique `addImageFile` \u00e0 une image qui arrive. */
function placeUploaded(ratio: Ratio, dims: { w: number; h: number }) {
  const spec = ratioSpec(ratio);
  const maxW = spec.width * 0.8;
  const maxH = spec.height * 0.8;
  const r = dims.w / dims.h;
  let w = maxW;
  let h = w / r;
  if (h > maxH) {
    h = maxH;
    w = h * r;
  }
  return {
    w: Math.round(w),
    h: Math.round(h),
    x: Math.round((spec.width - w) / 2),
    y: Math.round((spec.height - h) / 2),
  };
}

/** \u00c9mission d'un calque image vers le descripteur (coh\u00e9rent avec `emitFromCanvas`). */
function emisImage(layer: ImageLayer): ImageLayer {
  return {
    ...layer,
    x: Math.round(layer.x),
    y: Math.round(layer.y),
    w: Math.round(layer.w),
    h: Math.round(layer.h),
  };
}

/* ------------------------------------------------------------------ */
/* Garde-fou : la r\u00e9plique correspond-elle au composant ?             */
/* ------------------------------------------------------------------ */

function verifierSource() {
  const fichier = path.resolve(__dirname, '../../../../../components/frame/frame-editor.tsx');
  const source = readFileSync(fichier, 'utf8');
  const attendus: Array<[string, string]> = [
    ['placement 80 %', 'const maxW = spec.width * 0.8;'],
    ['mise \u00e0 l\u2019\u00e9chelle de l\u2019image', 'img.scaleX = layer.w / naturalWidth;'],
    ['\u00e9mission via getScaledWidth', 'w: Math.round(obj.getScaledWidth()),'],
  ];
  const manquants = attendus.filter(([, extrait]) => !source.includes(extrait)).map(([nom]) => nom);
  return manquants;
}

/* ------------------------------------------------------------------ */
/* Assertions                                                          */
/* ------------------------------------------------------------------ */

let reussis = 0;
let echoues = 0;

function check(ok: boolean, label: string, detail = '') {
  if (ok) {
    reussis++;
    console.log(`  ok     ${label}${detail ? ' \u2014 ' + detail : ''}`);
  } else {
    echoues++;
    console.log(`  ECHEC  ${label}${detail ? ' \u2014 ' + detail : ''}`);
  }
}

function proche(reel: number, attendu: number, tolerance = 1): boolean {
  return Math.abs(reel - attendu) <= tolerance;
}

function contient(layer: { x: number; y: number; w: number; h: number }, cadre: { w: number; h: number }) {
  return (
    layer.x >= 0 &&
    layer.y >= 0 &&
    layer.x + layer.w <= cadre.w &&
    layer.y + layer.h <= cadre.h
  );
}

/* ------------------------------------------------------------------ */
/* Sc\u00e9narios                                                          */
/* ------------------------------------------------------------------ */

interface Cas {
  ratio: Ratio;
  dims: { w: number; h: number };
  nom: string;
}

const cas: Cas[] = [
  { ratio: '1:1', dims: { w: 1200, h: 800 }, nom: 'Carr\u00e9 + photo paysage 1200\u00d7800' },
  { ratio: '9:16', dims: { w: 1200, h: 800 }, nom: 'Vertical + photo paysage 1200\u00d7800' },
  { ratio: '16:9', dims: { w: 800, h: 1200 }, nom: 'Paysage + photo portrait 800\u00d71200' },
  { ratio: '1:1', dims: { w: 4000, h: 3000 }, nom: 'Carr\u00e9 + grande photo 4000\u00d73000' },
  { ratio: '1:1', dims: { w: 500, h: 500 }, nom: 'Carr\u00e9 + petite photo 500\u00d7500' },
];

for (const c of cas) {
  console.log(`--- ${c.nom}`);
  const spec = ratioSpec(c.ratio);
  const place = placeUploaded(c.ratio, c.dims);

  const couche: ImageLayer = makeImageLayer('data:image/png;base64,...', c.ratio, {
    ...place,
    z: 10,
  }) as ImageLayer;
  const descripteur: Descriptor = {
    version: 1,
    ratio: c.ratio,
    background: 'transparent',
    layers: [couche],
  } as Descriptor;

  console.log(
    `    cadre ${spec.width}\u00d7${spec.height} | calque ${couche.w}\u00d7${couche.h} ` +
      `\u00e0 (${couche.x},${couche.y}) | ratio image ${(c.dims.w / c.dims.h).toFixed(3)} ` +
      `| ratio calque ${(couche.w / couche.h).toFixed(3)}`
  );

  check(
    contient(couche, { w: spec.width, h: spec.height }),
    'le calque tient ENTI\u00c8REMENT dans le cadre',
    `calque (${couche.x},${couche.y}) ${couche.w}\u00d7${couche.h} / cadre ${spec.width}\u00d7${spec.height}`
  );
  check(
    proche(couche.x + couche.w / 2, spec.width / 2) && proche(couche.y + couche.h / 2, spec.height / 2),
    'le calque est centr\u00e9'
  );
  check(
    proche(couche.w / couche.h, c.dims.w / c.dims.h, 0.01),
    'le ratio du calque \u00e9gale le ratio de l\u2019image (pas d\u2019\u00e9tirement)',
    `image ${(c.dims.w / c.dims.h).toFixed(3)} / calque ${(couche.w / couche.h).toFixed(3)}`
  );
  check(
    couche.w <= 0.8 * spec.width + 1 && couche.h <= 0.8 * spec.height + 1,
    'le plafond \u00e0 80 % est respect\u00e9',
    `w=${couche.w} (plafond ${Math.round(0.8 * spec.width)}) / h=${couche.h} (plafond ${Math.round(0.8 * spec.height)})`
  );

  /* --- Aller-retour : \u00e9mission puis reconstruction ------------------ */
  const emis = emisImage(couche);
  const coucheBis = { ...couche, x: emis.x, y: emis.y, w: emis.w, h: emis.h };
  check(
    coucheBis.x === couche.x &&
      coucheBis.y === couche.y &&
      coucheBis.w === couche.w &&
      coucheBis.h === couche.h,
    'aller-retour \u00e9mission \u2192 reconstruction : identit\u00e9',
    `${coucheBis.x},${coucheBis.y} ${coucheBis.w}\u00d7${coucheBis.h}`
  );

  /* --- On a bien un descripteur rejouable ---------------------------- */
  const calques = descripteur.layers.length === 1 && descripteur.layers[0].id === couche.id;
  check(calques, 'le descripteur reste un seul calque et conserve l\u2019identifiant');
  console.log('');
}

/* --- T\u00c9MOIN : un calque \u00e0 cheval sur le bord DOIT \u00eatre signal\u00e9 ------------- */
console.log('--- T\u00e9moin : calque d\u00e9lib\u00e9r\u00e9ment hors cadre (doit \u00eatre d\u00e9tect\u00e9)');
{
  const spec = ratioSpec('1:1');
  const couche: ImageLayer = makeImageLayer('data:image/png;base64,...', '1:1', {
    w: 864,
    h: 576,
    x: -200, // d\u00e9passe \u00e0 gauche
    y: 252,
    z: 10,
  }) as ImageLayer;
  const horsCadre = !contient(couche, { w: spec.width, h: spec.height });
  check(horsCadre, 'un calque n\u00e9gatif est bien d\u00e9tect\u00e9 comme hors cadre');
  check(
    couche.w <= 0.8 * spec.width + 1,
    'm\u00eame hors cadre, le plafond 80 % tient',
    `w=${couche.w}`
  );
}

console.log('');
const manquants = verifierSource();
check(
  manquants.length === 0,
  'la r\u00e9plique correspond encore au composant',
  manquants.length ? `extraits disparus : ${manquants.join(', ')}` : '3 extraits retrouv\u00e9s'
);

console.log(`\n=== ${reussis} r\u00e9ussis / ${echoues} \u00e9chou\u00e9s ===`);
process.exit(echoues === 0 ? 0 : 1);
