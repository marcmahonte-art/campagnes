/*
 * Contrôle du RENDU — ordre des plans et détourage, par lecture de pixels.
 *
 * Le harnais `check:stack` vérifie l'ordre **logique**. Celui-ci vérifie l'étape
 * suivante : ce que Fabric dessine réellement, en passant par le **vrai** chemin
 * d'export (`lib/video-export.exportPng`). C'est la seule preuve qui vaut pour
 * la promesse du produit — « l'aperçu ne peut pas mentir sur le fichier ».
 *
 * Ce qu'il prouve, en lisant les pixels :
 *
 *   1. **Les trois plans.** Un fond opaque rouge, la zone photo, un élément de
 *      premier plan vert. Le sujet doit apparaître **devant** le fond et
 *      **derrière** l'élément — c'est tout l'intérêt du mode Fond, et c'était
 *      exactement ce que l'aperçu empilait à l'envers ;
 *   2. **La découpe du mode Fond classique.** Le sujet déborde de la zone : hors
 *      de la zone, on doit voir le fond, pas le sujet. C'est la non-régression
 *      des cadres déjà publiés ;
 *   3. **L'absence de découpe en détourage.** Au zoom 2, le sujet déborde
 *      largement : il doit rester visible **entier**. Le même point de mesure
 *      donne la couleur opposée selon le mode — les deux assertions se
 *      départagent, aucune ne peut passer par accident ;
 *   4. **Le canal alpha comme masque.** Dans une partie transparente du sujet,
 *      c'est le fond qui apparaît — pas de rectangle bleu.
 *   5. **La parité aperçu / export.** La pile est reconstruite telle que la scène
 *      participant la construit, avec les **mêmes** fabriques, et comparée pixel
 *      à pixel au rendu de `exportPng`. Avec un témoin négatif : l'ancien ordre
 *      (« le média d'abord ») doit, lui, **différer** — sans quoi la
 *      comparaison ne distinguerait rien.
 *
 * Ce que ce harnais ne couvre pas : le **comportement** de la scène dans un
 * navigateur (glissement, événements, DOM autour du canvas). Il prouve le rendu.
 * Le fait que la scène utilise bien `participantInsertIndex()` et
 * `clipsParticipantPhoto()` — les mêmes fonctions que l'export — est vérifié par
 * `check:stack` et par lecture du composant.
 *
 * Lancement : `npm run check:stack-render`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setFabricRuntime } from '../../lib/fabric-runtime';
import { setAssetResolver } from '../../lib/render/assets';
import { exportPng } from '../../lib/video-export';
import { createImageObject } from '../../lib/fabric-image';
import { createShapeObject } from '../../lib/fabric-shape';
import { createTextObject } from '../../lib/fabric-text';
import {
  DEFAULT_PARTICIPANT_STYLE,
  clampPlacement,
  composeDescriptor,
  initialPlacement,
  participantInsertIndex,
  photoFit,
  photoLayer,
  zoomAroundCenter,
  type ParticipantPhoto,
  type PhotoPlacement,
} from '../../lib/participant';
import {
  clipsParticipantPhoto,
  parseDescriptor,
  photoZone,
  type PhotoZone,
} from '../../lib/descriptor';
import { TEMPLATES } from '../../lib/templates';
import type { Descriptor, Layer } from '../../lib/types';

let failures = 0;

function ok(label: string, condition: boolean, detail = ''): void {
  if (!condition) failures += 1;
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** Racine des images de test : hors du dépôt, pour ne rien y laisser. */
const TMP = join(tmpdir(), 'campagnes-stack-render');

/** node-canvas refuse le schéma `c:` : tout chemin de fichier passe par `file://`. */
function fileUrl(path: string): string {
  return `file:///${path.replace(/\\/g, '/')}`;
}

/** Le fond opaque, le sujet, le premier plan — des couleurs franches, lisibles. */
const FOND = '#ff0000';
const SUJET = '#0000ff';
const DEVANT = '#00ff00';

/** Cadre 1:1 et zone photo au centre. */
const W = 1080;
const H = 1080;
const zone: PhotoZone = { x: 190, y: 190, w: 700, h: 700 };

/** Points de mesure, nommés par ce qu'ils prouvent. */
const P_SUJET = { x: 540, y: 540 }; // dans la zone, sous le premier plan
const P_DEVANT = { x: 700, y: 700 }; // dans la zone ET sous l'élément de premier plan
const P_FOND = { x: 100, y: 100 }; // hors zone, hors premier plan
const P_HORS_ZONE = { x: 540, y: 100 }; // le sujet y déborde : hors zone, au-dessus
const P_DEBORD = { x: 150, y: 540 }; // hors zone, à gauche — mais sous le sujet détouré
const P_ALPHA = { x: 150, y: 150 }; // dans l'emprise du sujet, mais transparent

/**
 * Les images de test.
 *
 * `sujet-plein` est un aplat bleu : c'est le cas du mode Fond classique.
 * `sujet-detoure` est un disque bleu sur fond **transparent** — les coins sont
 * vides, et c'est précisément ce qui permet de prouver que c'est le canal alpha
 * qui masque, et non un rectangle.
 */
function writeFixtures(): void {
  mkdirSync(TMP, { recursive: true });
  const { createCanvas } = require('canvas');

  const plein = createCanvas(400, 600);
  const pc = plein.getContext('2d');
  pc.fillStyle = SUJET;
  pc.fillRect(0, 0, 400, 600);
  writeFileSync(join(TMP, 'sujet-plein.png'), plein.toBuffer('image/png'));

  const detoure = createCanvas(400, 600);
  const dc = detoure.getContext('2d');
  dc.fillStyle = SUJET;
  dc.beginPath();
  dc.arc(200, 300, 190, 0, Math.PI * 2);
  dc.fill();
  writeFileSync(join(TMP, 'sujet-detoure.png'), detoure.toBuffer('image/png'));
}

/*
 * Écrites au chargement du module, pas dans `main()` : les constantes de photo
 * ci-dessous pointent sur ces fichiers, et elles sont construites avant que
 * `main()` ne s'exécute.
 */
writeFixtures();

/**
 * Le sujet du mode Fond classique : plein, portrait 400×600.
 *
 * Les fixtures sont écrites sur le disque **avant** ces constantes : `layer.src`
 * doit être une URL chargeable, et `createImageObject()` appelle
 * `FabricImage.fromURL()` directement — il ne passe pas par le résolveur
 * d'assets, qui ne sert qu'au logo du badge.
 */
const photoPlein: ParticipantPhoto = {
  src: fileUrl(join(TMP, 'sujet-plein.png')),
  naturalWidth: 400,
  naturalHeight: 600,
};

/** Le sujet du détourage : un disque, coins transparents, mêmes dimensions. */
const photoDetoure: ParticipantPhoto = {
  src: fileUrl(join(TMP, 'sujet-detoure.png')),
  naturalWidth: 400,
  naturalHeight: 600,
};

/**
 * Un cadre en mode Fond, sur trois plans.
 *
 * Le fond est **opaque** — c'est le cas qui échouait : posée tout en bas, la
 * photo disparaissait derrière lui dans l'aperçu.
 */
function fondFrame(subject?: 'cutout'): Descriptor {
  const layers: Layer[] = [
    {
      id: 'fond',
      type: 'shape',
      kind: 'rect',
      fill: FOND,
      stroke: 'transparent',
      strokeWidth: 0,
      radius: 0,
      x: 0,
      y: 0,
      w: W,
      h: H,
      rotation: 0,
      z: 10,
      opacity: 1,
    },
    {
      id: 'zone-photo',
      type: 'image',
      src:
        'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'),
      x: zone.x,
      y: zone.y,
      w: zone.w,
      h: zone.h,
      rotation: 0,
      z: 20,
      opacity: 1,
    },
    {
      id: 'devant',
      type: 'shape',
      kind: 'rect',
      fill: DEVANT,
      stroke: 'transparent',
      strokeWidth: 0,
      radius: 0,
      x: 600,
      y: 600,
      w: 400,
      h: 400,
      rotation: 0,
      z: 30,
      opacity: 1,
    },
    {
      id: 'titre',
      type: 'text',
      text: 'MOON RABBIT',
      font: 'Inter',
      size: 64,
      color: '#ffffff',
      align: 'left',
      weight: 'bold',
      style: 'normal',
      letterSpacing: 0,
      lineHeight: 1.16,
      curve: 0,
      x: 60,
      y: 940,
      w: 600,
      h: 90,
      rotation: 0,
      z: 40,
      opacity: 1,
    },
  ];

  return {
    version: 1,
    ratio: '1:1',
    background: 'transparent',
    photo_anchor: 'zone-photo',
    ...(subject ? { subject } : {}),
    layers,
    motion: null,
  };
}

/* ------------------------------------------------------------------ */
/* Lecture des pixels                                                  */
/* ------------------------------------------------------------------ */

interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const { loadImage, createCanvas } = require('canvas');

async function rasterOf(dataUrl: string): Promise<Raster> {
  const image = await loadImage(dataUrl);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return { data: ctx.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height };
}

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function sample(raster: Raster, x: number, y: number): [number, number, number, number] {
  const i = (y * raster.width + x) * 4;
  return [raster.data[i], raster.data[i + 1], raster.data[i + 2], raster.data[i + 3]];
}

/** Tolérance : l'antialiasing et l'arrondi des bords produisent des valeurs intermédiaires. */
const TOL = 12;

function isColour(rgba: number[], hex: string, tol = TOL): boolean {
  const [r, g, b] = rgb(hex);
  return Math.abs(rgba[0] - r) <= tol && Math.abs(rgba[1] - g) <= tol && Math.abs(rgba[2] - b) <= tol;
}

function describe(rgba: number[]): string {
  return `rgb(${rgba[0]},${rgba[1]},${rgba[2]}) a=${rgba[3]}`;
}

/** Compare deux rendus et compte les pixels divergents. */
function countDiffering(a: Raster, b: Raster, tol = 8): number {
  if (a.width !== b.width || a.height !== b.height) return -1;
  let differing = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > tol ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > tol ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > tol ||
      Math.abs(a.data[i + 3] - b.data[i + 3]) > tol
    ) {
      differing += 1;
    }
  }
  return differing;
}

/* ------------------------------------------------------------------ */
/* Le rendu de l'aperçu, rejoué                                        */
/* ------------------------------------------------------------------ */

/**
 * Reconstruit la pile **telle que la scène participant la construit** :
 * les calques sous la zone, le média du participant, les calques au-dessus,
 * puis son texte — en appelant les mêmes fabriques.
 *
 * C'est le point du contrôle : si la scène empilait autrement que l'export, la
 * comparaison pixel à pixel le montrerait. `legacy` rejoue l'ancien ordre
 * (« le média d'abord ») pour servir de témoin négatif.
 */
async function renderPreview(
  frame: Descriptor,
  photo: ParticipantPhoto,
  placement: PhotoPlacement,
  legacy = false,
): Promise<string> {
  const fabric = require('fabric/node');
  const canvas = new fabric.StaticCanvas(undefined, {
    width: W,
    height: H,
    backgroundColor: 'transparent',
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  });

  const z = photoZone(frame);
  const fit = photoFit(frame);
  const sorted = [...frame.layers].sort((a, b) => a.z - b.z);
  const at = legacy ? 0 : participantInsertIndex(frame, sorted);
  const ordered: (Layer | null)[] = [...sorted.slice(0, at), null, ...sorted.slice(at)];

  for (const layer of ordered) {
    if (layer === null) {
      const media = photoLayer(
        photo,
        z,
        clampPlacement(photo, z, placement, fit),
        0,
        'none',
        fit,
      );
      const object = await createImageObject(media, {
        interactive: true,
        clip: clipsParticipantPhoto(frame) ? z : null,
      });
      canvas.add(object);
      continue;
    }

    if (layer.type === 'shape') {
      const object = await createShapeObject(layer, frame.ratio);
      object.set({ visible: layer.visible !== false } as never);
      canvas.add(object);
    } else if (layer.type === 'text') {
      canvas.add(await createTextObject(layer, { visible: layer.visible !== false }));
    } else {
      if (!layer.src) continue;
      canvas.add(await createImageObject(layer, { visible: layer.visible !== false }));
    }
  }

  canvas.renderAll();
  return canvas.toDataURL({ format: 'png' });
}

/* ------------------------------------------------------------------ */
/* Contrôles                                                           */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log('\nRendu — ordre des plans et détourage (lecture de pixels)\n');

  const watchdog = setTimeout(() => {
    console.error('TIMEOUT — le harnais ne s’est pas terminé');
    process.exit(9);
  }, 180_000);

  setFabricRuntime(require('fabric/node'));
  /*
   * Le résolveur d'assets ne sert qu'au logo du badge. On le pose quand même,
   * avec la même règle que le serveur : `/logo-dark.png` devient un `file://`
   * vers `public/`. Sans lui, un rendu avec badge échouerait silencieusement
   * sur son logo.
   */
  setAssetResolver((src: string) => {
    if (!src.startsWith('/')) return src;
    return fileUrl(join(process.cwd(), 'public', src));
  });

  /* ---------------- 0. Témoin de mesure ---------------- */
  {
    const canvas = createCanvas(64, 64);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = FOND;
    ctx.fillRect(0, 0, 64, 64);
    const raster: Raster = {
      data: ctx.getImageData(0, 0, 64, 64).data,
      width: 64,
      height: 64,
    };
    let peints = 0;
    for (let i = 0; i < raster.data.length; i += 4) {
      if (isColour([raster.data[i], raster.data[i + 1], raster.data[i + 2]], FOND)) peints += 1;
    }
    ok(
      'témoin : la méthode de mesure lit bien 100 % d’un aplat',
      peints === 64 * 64,
      `${peints}/${64 * 64} pixels`,
    );
  }

  /* ---------------- 1. Mode Fond classique ---------------- */
  const frame = fondFrame();
  const placementClassique = initialPlacement(photoPlein, zone, 'cover');
  const composedClassique = composeDescriptor(
    frame,
    photoPlein,
    placementClassique,
    DEFAULT_PARTICIPANT_STYLE,
  );
  const rasterClassique = await rasterOf(await exportPng({ descriptor: composedClassique, plan: 'creator' }));

  {
    const sujet = sample(rasterClassique, P_SUJET.x, P_SUJET.y);
    ok('le sujet apparaît DEVANT le fond opaque', isColour(sujet, SUJET), describe(sujet));

    const devant = sample(rasterClassique, P_DEVANT.x, P_DEVANT.y);
    ok('l’élément de premier plan passe DEVANT le sujet', isColour(devant, DEVANT), describe(devant));

    const fond = sample(rasterClassique, P_FOND.x, P_FOND.y);
    ok('le fond reste visible hors de la zone', isColour(fond, FOND), describe(fond));

    const hors = sample(rasterClassique, P_HORS_ZONE.x, P_HORS_ZONE.y);
    ok(
      'le sujet déborde de la zone mais y est découpé (non-régression)',
      isColour(hors, FOND),
      describe(hors),
    );
  }

  /* ---------------- 2. Détourage ---------------- */
  const frameCut = fondFrame('cutout');
  const fit = photoFit(frameCut);
  const placementCut = zoomAroundCenter(
    photoDetoure,
    zone,
    initialPlacement(photoDetoure, zone, fit),
    2,
    fit,
  );
  const composedCut = composeDescriptor(
    frameCut,
    photoDetoure,
    placementCut,
    DEFAULT_PARTICIPANT_STYLE,
  );
  const rasterCut = await rasterOf(await exportPng({ descriptor: composedCut, plan: 'creator' }));

  {
    const sujet = sample(rasterCut, P_SUJET.x, P_SUJET.y);
    ok('détourage : le sujet apparaît toujours devant le fond', isColour(sujet, SUJET), describe(sujet));

    const devant = sample(rasterCut, P_DEVANT.x, P_DEVANT.y);
    ok('détourage : l’élément de premier plan reste devant', isColour(devant, DEVANT), describe(devant));

    /*
     * Le point décisif. Au zoom 2, le sujet déborde largement de la zone. En
     * mode classique le même genre de point est découpé ; ici il doit rester
     * bleu, sinon le détourage tronquerait la silhouette.
     */
    const debord = sample(rasterCut, P_DEBORD.x, P_DEBORD.y);
    ok(
      'détourage : le sujet n’est PAS tronqué par la zone',
      isColour(debord, SUJET),
      describe(debord),
    );

    const alpha = sample(rasterCut, P_ALPHA.x, P_ALPHA.y);
    ok(
      'détourage : c’est le canal alpha qui masque, pas un rectangle',
      isColour(alpha, FOND),
      describe(alpha),
    );
  }

  /* ---------------- 3. Les deux modes se départagent ---------------- */
  {
    const classique = sample(rasterClassique, P_HORS_ZONE.x, P_HORS_ZONE.y);
    const detoure = sample(rasterCut, P_HORS_ZONE.x, P_HORS_ZONE.y);
    ok(
      'le même point hors zone donne un résultat opposé selon le mode',
      isColour(classique, FOND) && isColour(detoure, SUJET),
      `classique ${describe(classique)} / détourage ${describe(detoure)}`,
    );
  }

  /* ---------------- 4. Parité aperçu / export ---------------- */
  {
    const apercu = await rasterOf(await renderPreview(frame, photoPlein, placementClassique));
    const ecart = countDiffering(apercu, rasterClassique);
    ok(
      'mode Fond : l’aperçu et l’export rendent la même image, au pixel près',
      ecart === 0,
      ecart < 0 ? 'dimensions différentes' : `${ecart} pixel(s) divergent(s) sur ${W * H}`,
    );

    const apercuCut = await rasterOf(
      await renderPreview(frameCut, photoDetoure, placementCut),
    );
    const ecartCut = countDiffering(apercuCut, rasterCut);
    ok(
      'détourage : l’aperçu et l’export rendent la même image, au pixel près',
      ecartCut === 0,
      ecartCut < 0 ? 'dimensions différentes' : `${ecartCut} pixel(s) divergent(s) sur ${W * H}`,
    );
  }

  /* ---------------- 4bis. Les décors réellement livrés ---------------- */
  /*
   * La parité ci-dessus porte sur une **fixture** : trois rectangles de couleur
   * franche et une zone au centre. Ces trois-là sont les décors que le créateur
   * applique vraiment — un fond vectoriel, des formes, des textes, et une zone
   * qui n'est plus au centre.
   *
   * La différence n'est pas cosmétique : un décor livré pourrait rendre
   * autrement dans l'aperçu que dans le fichier (un calque vectoriel que l'un
   * des deux chemins ne sait pas charger, une zone décalée que l'un des deux
   * arrondit) et la fixture resterait verte.
   */
  for (const tpl of TEMPLATES.filter((t) => t.descriptor.subject === 'cutout')) {
    const frame = parseDescriptor(tpl.descriptor);
    const fit = photoFit(frame);
    const placement = initialPlacement(photoDetoure, photoZone(frame), fit);
    const composed = composeDescriptor(frame, photoDetoure, placement, DEFAULT_PARTICIPANT_STYLE);

    const exporte = await rasterOf(await exportPng({ descriptor: composed, plan: 'creator' }));
    const apercu = await rasterOf(await renderPreview(frame, photoDetoure, placement));
    const ecart = countDiffering(apercu, exporte);
    ok(
      `${tpl.id} : l’aperçu et l’export rendent la même image, au pixel près`,
      ecart === 0,
      ecart < 0 ? 'dimensions différentes' : `${ecart} pixel(s) divergent(s) sur ${W * H}`,
    );

    /*
     * Et la parité ne suffirait pas si les deux chemins oubliaient le décor de
     * la même façon : deux images vides sont identiques. On vérifie donc que le
     * fond vectoriel est **réellement peint**, sur toute la surface. Sans ce
     * contrôle, un `data:image/svg+xml` que Fabric ne saurait pas décoder
     * passerait pour un succès.
     */
    let opaques = 0;
    for (let i = 3; i < exporte.data.length; i += 4) {
      if (exporte.data[i] > 250) opaques += 1;
    }
    const part = opaques / (W * H);
    ok(
      `${tpl.id} : le décor vectoriel est réellement peint`,
      part > 0.9,
      `${Math.round(part * 100)} % du cadre est opaque`,
    );
  }

  /* ---------------- 5. Témoin négatif ---------------- */
  {
    const legacy = await rasterOf(await renderPreview(frame, photoPlein, placementClassique, true));
    const ecart = countDiffering(legacy, rasterClassique);
    ok(
      'témoin : l’ancien ordre (« le média d’abord ») diverge bien de l’export',
      ecart > 1000,
      `${ecart} pixel(s) divergent(s)`,
    );

    const sujetLegacy = sample(legacy, P_SUJET.x, P_SUJET.y);
    ok(
      'témoin : dans l’ancien ordre, le sujet était caché par le fond opaque',
      isColour(sujetLegacy, FOND),
      describe(sujetLegacy),
    );
  }

  clearTimeout(watchdog);
  console.log(
    failures === 0
      ? '\nPASS — 0 contrôle en échec\n'
      : `\nFAIL — ${failures} contrôle(s) en échec\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
