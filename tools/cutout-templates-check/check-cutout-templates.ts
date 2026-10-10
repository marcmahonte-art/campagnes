/*
 * Contrôle des modèles détourés — `npm run check:templates:cutout`
 *
 * POURQUOI CE HARNAIS EXISTE
 *
 *   La phase 3 livre trois décors « sujet détouré ». Ils sont le **seul** chemin
 *   d'accès au détourage : aucune interface ne pose `subject: 'cutout'`, donc un
 *   modèle cassé ne se voit pas à l'écran — il se voit chez le participant, une
 *   fois la campagne publiée.
 *
 *   Trois familles de défauts sont silencieuses, et ce sont elles qu'on verrouille :
 *
 *   1. **Le mode qui fuit.** `applyTemplate()` est appelé par l'éditeur, qui
 *      connaît le type de campagne — mais un appelant qui l'ignore ne doit pas
 *      pouvoir poser `subject: 'cutout'` sur un cadre photo. `photoFit()` lit
 *      `isCutout()` **sans regarder le type de campagne** : un cadre photo
 *      porteur du drapeau verrait sa photo « contenue » au lieu de couvrir,
 *      c'est-à-dire entourée de transparent. Le parcours, lui, ne détoure que les
 *      `background_frame` — le drapeau serait donc posé sans être traité.
 *
 *   2. **La composition à un seul plan.** Le sujet s'insère juste au-dessus de la
 *      zone (`participantInsertIndex()`). Si rien n'est **sous** la zone, le
 *      sujet flotte sans arrière-plan ; si rien n'est **au-dessus**, le titre
 *      disparaît derrière lui. La référence montre les trois plans — ce n'est pas
 *      une préférence esthétique, c'est la mécanique de composition.
 *
 *   3. **La photo dans le modèle.** Une vignette publique ne doit jamais pouvoir
 *      contenir la photo d'un participant : elle ne quitte pas son appareil.
 *      On ne fait pas confiance à la discipline — on vérifie qu'**aucun** modèle
 *      ne peut en porter une, et que l'éditeur qui produit les vignettes ne
 *      compose jamais de calque participant.
 *
 * CE QUE CE HARNAIS NE VÉRIFIE PAS
 *
 *   Le rendu. Il lit des descripteurs et des prédicats ; il n'ouvre pas de
 *   navigateur. Qu'un décor soit *beau* ne se vérifie pas ici, et qu'un masque
 *   soit *bon* ne se vérifie nulle part sans appareil (phase 1, point 9).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TEMPLATES, applyTemplate, type FrameTemplate } from '../../lib/templates';
import {
  PARTICIPANT_PHOTO_ID,
  PARTICIPANT_TEXT_ID,
  isCutout,
  parseDescriptor,
  photoZone,
  serializeDescriptor,
  validateDescriptor,
} from '../../lib/descriptor';
import { participantInsertIndex, photoFit } from '../../lib/participant';
import { ratioSpec } from '../../lib/ratios';
import type { Descriptor, Layer, Ratio } from '../../lib/types';

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

function eq(label: string, actual: unknown, expected: unknown): void {
  ok(label, actual === expected, `attendu ${String(expected)}, obtenu ${String(actual)}`);
}

/**
 * La racine du dépôt, trouvée en remontant jusqu'au `package.json`.
 *
 * On ne compte pas les `..` : le harnais est compilé sous
 * `tools/<harnais>/build/tools/<harnais>/`, et un chemin relatif écrit à la main
 * se décale au premier changement de `outDir`. C'est exactement le genre de
 * constante qui reste fausse en silence — le contrôle lirait un fichier
 * introuvable, ou pire, un autre fichier.
 */
function racine(): string {
  let courant = __dirname;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(courant, 'package.json'))) return courant;
    courant = dirname(courant);
  }
  throw new Error('racine du dépôt introuvable depuis ' + __dirname);
}

const RACINE = racine();
const RATIOS: Ratio[] = ['1:1', '16:9', '9:16'];
const NOMBRE_ATTENDU = 3;

/** Un descripteur sans calque : celui d'une campagne neuve, avant tout décor. */
function vide(ratio: Ratio = '1:1'): Descriptor {
  return parseDescriptor({ version: 1, ratio, background: 'transparent', layers: [] });
}

const cutouts = TEMPLATES.filter((tpl) => tpl.descriptor.subject === 'cutout');

/* ------------------------------------------------------------------ */
/* 1. Les trois décors existent, et sont bien des modèles détourés     */
/* ------------------------------------------------------------------ */

console.log('=== 1. Trois décors détourés, et pas un de plus ===');

eq('le catalogue contient exactement trois modèles détourés', cutouts.length, NOMBRE_ATTENDU);

/*
 * Un catalogue vide ferait passer tous les `for` suivants sans rien vérifier.
 * C'est le témoin négatif le moins cher du harnais, et sans lui une régression
 * qui viderait la sélection serait verte.
 */
ok('la sélection n’est pas vide', cutouts.length > 0);

for (const tpl of cutouts) {
  ok(
    `[${tpl.id}] est un « Photo sur fond »`,
    tpl.kind === 'background_frame' && tpl.category === 'background_frame',
    `kind=${tpl.kind}, category=${tpl.category}`,
  );
  ok(`[${tpl.id}] déclare le mode détourage`, tpl.descriptor.subject === 'cutout');
  ok(
    `[${tpl.id}] annonce le détourage dans ses étiquettes`,
    tpl.tags.includes('détourage'),
    'sinon il est introuvable par la recherche de la modale',
  );
}

/* ------------------------------------------------------------------ */
/* 2. Le mode ne fuit pas hors du type de campagne qui le comprend     */
/* ------------------------------------------------------------------ */

console.log('\n=== 2. Le mode ne fuit pas sur un autre type de campagne ===');

const tplCutout = cutouts[0];

/** Un « Photo sur fond » minimal, avec sa zone : le vrai point de départ. */
const bgSeed = parseDescriptor({
  version: 1,
  ratio: '1:1',
  background: 'transparent',
  photo_anchor: 'zone',
  layers: [
    {
      id: 'zone',
      type: 'image',
      src: 'data:image/svg+xml;charset=utf-8,%3Csvg/%3E',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      rotation: 0,
      z: 10,
      opacity: 1,
    },
  ],
});

if (!tplCutout) {
  ok('un modèle détouré est disponible pour la suite', false);
} else {
  const surPhoto = applyTemplate(vide(), tplCutout, false, 'photo_frame');
  eq('cadre photo + kind → aucun mode posé', surPhoto.subject, undefined);

  const sansKind = applyTemplate(vide(), tplCutout, false);
  eq('cadre photo + kind omis → aucun mode posé', sansKind.subject, undefined);

  const surVideo = applyTemplate(vide(), tplCutout, false, 'video_frame');
  eq('cadre vidéo + kind → aucun mode posé', surVideo.subject, undefined);

  const surFond = applyTemplate(bgSeed, tplCutout, false, 'background_frame');
  eq('photo sur fond + kind → le mode est posé', surFond.subject, 'cutout');

  /*
   * Témoin négatif : le même appel **avec** le bon type doit, lui, poser le
   * drapeau. Sans ce témoin, un `applyTemplate()` qui n'appliquerait jamais
   * aucun mode passerait les trois contrôles ci-dessus — et les modèles
   * détourés ne serviraient à rien, sans que rien ne le dise.
   */
  eq('témoin : le bon type pose bien le mode', surFond.subject, 'cutout');

  /*
   * Et la conséquence, mesurée plutôt que supposée : `photoFit()` bascule sur
   * « contenir » dès que le drapeau est là, **quel que soit** le type de
   * campagne. C'est ce qui rend la fuite nuisible, et non simplement inutile.
   */
  eq('avec le drapeau, le dimensionnement passe en « contenir »', photoFit(surFond), 'contain');
  eq('sans le drapeau, la photo couvre', photoFit(surPhoto), 'cover');
}

/* ------------------------------------------------------------------ */
/* 3. La composition tient à trois plans                               */
/* ------------------------------------------------------------------ */

console.log('\n=== 3. Fond, sujet, premier plan : les trois plans ===');

for (const tpl of cutouts) {
  const sorted: Layer[] = [...tpl.descriptor.layers].sort((a, b) => a.z - b.z);
  const insertAt = participantInsertIndex(tpl.descriptor, sorted);

  ok(
    `[${tpl.id}] au moins un calque passe derrière le sujet`,
    insertAt > 0,
    `index d’insertion = ${insertAt} sur ${sorted.length} calques`,
  );
  ok(
    `[${tpl.id}] au moins un calque passe devant le sujet`,
    insertAt < sorted.length,
    `index d’insertion = ${insertAt} sur ${sorted.length} calques`,
  );

  /*
   * Le fond doit être plein cadre : sinon le sujet se dessine sur du
   * transparent, c'est-à-dire exactement le rendu d'un cadre photo — et le
   * modèle n'aurait plus rien d'un « Photo sur fond ».
   */
  const spec = ratioSpec(tpl.descriptor.ratio);
  const pleinCadre = sorted.some(
    (l) => l.x === 0 && l.y === 0 && l.w === spec.width && l.h === spec.height,
  );
  ok(`[${tpl.id}] le décor couvre tout le cadre`, pleinCadre);

  const zone = photoZone(tpl.descriptor);
  const aire = (zone.w * zone.h) / (spec.width * spec.height);
  ok(
    `[${tpl.id}] la zone du sujet laisse respirer le décor`,
    aire <= 0.85,
    `la zone occupe ${Math.round(aire * 100)} % du cadre`,
  );
  ok(
    `[${tpl.id}] la zone du sujet n’est pas minuscule`,
    aire >= 0.25,
    `la zone occupe ${Math.round(aire * 100)} % du cadre`,
  );
  ok(
    `[${tpl.id}] la zone du sujet reste dans le cadre`,
    zone.x >= 0 &&
      zone.y >= 0 &&
      zone.x + zone.w <= spec.width &&
      zone.y + zone.h <= spec.height,
  );
}

/* ------------------------------------------------------------------ */
/* 4. Les invariants du dépôt tiennent sur ces modèles                 */
/* ------------------------------------------------------------------ */

console.log('\n=== 4. Valides, sans avertissement, et stables à l’enregistrement ===');

for (const tpl of cutouts) {
  const relu = parseDescriptor(tpl.descriptor);

  ok(
    `[${tpl.id}] le détourage survit à un aller-retour de lecture`,
    isCutout(relu),
    'sinon le mode serait perdu au premier enregistrement',
  );

  ok(
    `[${tpl.id}] la sérialisation porte le mode`,
    serializeDescriptor(relu).includes('"subject": "cutout"'),
  );

  /*
   * La promesse du dépôt : un cadre relu puis réenregistré revient à l'octet
   * près. Elle vaut aussi pour un modèle, et c'est ce qui garantit qu'appliquer
   * un modèle puis publier ne change rien au visuel.
   */
  eq(
    `[${tpl.id}] relire puis réenregistrer donne le même octet`,
    serializeDescriptor(relu),
    serializeDescriptor(tpl.descriptor),
  );

  const validation = validateDescriptor(relu);
  ok(`[${tpl.id}] valide, sans erreur`, validation.ok, validation.errors.join(' · '));
  ok(
    `[${tpl.id}] sans aucun avertissement`,
    validation.warnings.length === 0,
    validation.warnings.join(' · '),
  );

  const anchor = tpl.descriptor.photo_anchor;
  ok(
    `[${tpl.id}] la zone du sujet désigne un calque qui existe`,
    Boolean(anchor) && tpl.descriptor.layers.some((l) => l.id === anchor),
    `photo_anchor = ${String(anchor)}`,
  );

  // Tous les formats : un décor plein cadre le reste, mais les textes et les
  // formes ne sont pas pleins cadre — c'est eux qui peuvent déborder.
  for (const ratio of RATIOS) {
    const applique = applyTemplate(vide(ratio), tpl, false, 'background_frame');
    const spec = ratioSpec(applique.ratio);
    const deborde = applique.layers.filter(
      (l) => l.x < 0 || l.y < 0 || l.x + l.w > spec.width || l.y + l.h > spec.height,
    );
    eq(`[${tpl.id}] rien ne déborde en ${ratio}`, deborde.length, 0);
  }
}

/* ------------------------------------------------------------------ */
/* 5. Aucune photo de participant ne peut entrer dans un modèle        */
/* ------------------------------------------------------------------ */

console.log('\n=== 5. Un modèle ne peut pas porter une photo de participant ===');

for (const tpl of TEMPLATES) {
  const ids = tpl.descriptor.layers.map((l) => l.id);
  ok(
    `[${tpl.id}] ne contient aucun calque de participant`,
    !ids.includes(PARTICIPANT_PHOTO_ID) && !ids.includes(PARTICIPANT_TEXT_ID),
  );

  const texte = serializeDescriptor(tpl.descriptor);
  ok(
    `[${tpl.id}] ne sérialise aucun identifiant de participant`,
    !texte.includes(PARTICIPANT_PHOTO_ID) && !texte.includes(PARTICIPANT_TEXT_ID),
  );

  /*
   * Le contrôle qui compte vraiment : **aucune source photographique** dans un
   * modèle. Un décor vectoriel (`data:image/svg`) est du dessin ; un PNG ou un
   * JPEG encodé en dur serait une image — et la seule image qu'on puisse
   * vouloir y mettre un jour est celle d'un participant.
   */
  const photographiques = tpl.descriptor.layers.filter(
    (l) => l.type === 'image' && !l.src.startsWith('data:image/svg') && l.src.trim().length > 0,
  );
  eq(`[${tpl.id}] n’embarque aucune source photographique`, photographiques.length, 0);
}

/*
 * Et la raison pour laquelle cette interdiction tient **en pratique** : la
 * vignette publique est exportée depuis le canevas du créateur, qui ne compose
 * jamais de calque participant. `composeDescriptor()` est le seul endroit qui
 * en injecte un ; s'il entrait dans l'éditeur, une vignette pourrait en
 * contenir — et elle serait publiée.
 */
const editeur = readFileSync(join(RACINE, 'components/frame/frame-editor.tsx'), 'utf8');
ok(
  'l’éditeur de cadre ne compose jamais de descripteur participant',
  !editeur.includes('composeDescriptor'),
  'composeDescriptor est le seul producteur du calque « participant-photo »',
);
ok(
  'l’éditeur de cadre ne référence aucun identifiant de participant',
  !editeur.includes(PARTICIPANT_PHOTO_ID) && !editeur.includes(PARTICIPANT_TEXT_ID),
);

/* ------------------------------------------------------------------ */
/* Bilan                                                              */
/* ------------------------------------------------------------------ */

console.log(
  `\n${failed === 0 ? 'TOUT EST VERT' : `${failed} ÉCHEC(S)`} — ${passed} contrôle(s) réussi(s), ${failed} échoué(s)\n`,
);

process.exit(failed === 0 ? 0 : 1);
