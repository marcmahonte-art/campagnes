/*
 * Contrôle de l'ordre des plans — mode Fond classique et détourage.
 *
 * Pourquoi ce harnais existe : le mode Fond n'a qu'**une** propriété qui compte
 * vraiment, et c'est l'ordre des plans. Ce qui est sous la zone photo doit
 * rester derrière le sujet, ce qui est au-dessus doit passer devant. Deux
 * conséquences, et les deux ont été prises en défaut :
 *
 *   1. **L'aperçu empilait à l'envers.** La scène posait le média du
 *      participant tout en bas, puis tous les calques du créateur par-dessus.
 *      Sur `badge-participant`, dont le fond est un aplat opaque, le participant
 *      ne voyait donc **pas sa propre photo** dans l'aperçu — alors que le
 *      fichier téléchargé la plaçait correctement au-dessus du décor. Le seul
 *      écran où le participant peut vérifier ce qu'il va obtenir mentait ;
 *   2. **Le détourage n'était pas distinguable du fond classique.** Un sujet
 *      détouré recevait la découpe rectangulaire de la zone — il aurait été
 *      tronqué net — et un dimensionnement « couvrir », qui l'aurait amputé.
 *
 * Ce que l'on vérifie, en exécutant réellement le code :
 *   — que le point d'insertion des calques du participant est **unique**, et que
 *     la scène comme l'export lisent le même ;
 *   — que l'ordre construit par la scène est, terme à terme, celui que l'export
 *     rend — c'est la propriété qui interdit à l'aperçu de mentir ;
 *   — qu'un témoin négatif (l'ancienne règle « le média d'abord ») **ne**
 *     reproduit **pas** cet ordre : sans lui, le contrôle ne distinguerait rien ;
 *   — que « couvrir » et « contenir » sont bien deux ajustements distincts, et
 *     que le défaut reste « couvrir » — la non-régression des cadres publiés ;
 *   — qu'un cadre d'avant le détourage se relit et se réenregistre **à l'octet
 *     près**, et qu'un mode de sujet inconnu est abandonné plutôt que remplacé.
 *
 * Ce harnais ne teste **pas** le rendu : il n'y a pas de canvas natif ici. Il
 * vérifie l'ordre **logique**, qui est ce que Fabric reçoit. La preuve visuelle
 * finale demande un navigateur (voir `fabric-render-pixel-verification`).
 *
 * Lancement : `npm run check:stack`
 */
import {
  DEFAULT_PARTICIPANT_STYLE,
  composeDescriptor,
  containSize,
  coverSize,
  defaultParticipantText,
  initialPlacement,
  participantInsertIndex,
  photoFit,
  photoLayer,
  photoSize,
  type ParticipantPhoto,
  type ParticipantStyle,
} from '../../lib/participant';
import {
  PARTICIPANT_PHOTO_ID,
  PARTICIPANT_TEXT_ID,
  clipsParticipantPhoto,
  isCutout,
  parseDescriptor,
  serializeDescriptor,
  type PhotoZone,
} from '../../lib/descriptor';
import type { Descriptor, Layer, SubjectMode } from '../../lib/types';

let failures = 0;

function ok(label: string, condition: boolean, detail = ''): void {
  if (!condition) failures += 1;
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

function eq(label: string, actual: unknown, expected: unknown): void {
  ok(label, actual === expected, `attendu ${String(expected)}, obtenu ${String(actual)}`);
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** Un SVG 1×1 transparent : le calque de zone n'imprime rien, il matérialise. */
const TRANSPARENT =
  'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221%22%20height%3D%221%22%3E%3C%2Fsvg%3E';

/** La zone photo : un carré au centre d'un cadre 1080×1080. */
const zone: PhotoZone = { x: 190, y: 190, w: 700, h: 700 };

/** Une photo **portrait** dans une zone **carrée** : c'est le cas qui sépare couvrir de contenir. */
const photo: ParticipantPhoto = {
  src: 'data:image/png;base64,iVBORw0KGgo=',
  naturalWidth: 800,
  naturalHeight: 1000,
};

const ANCHOR = 'zone-photo';

/**
 * Un cadre en mode Fond calqué sur `badge-participant` : un **fond opaque**
 * (c'est lui qui cachait la photo dans l'aperçu), la zone photo, puis un élément
 * de premier plan qui doit passer **devant** le sujet.
 */
function fondFrame(subject?: SubjectMode): Descriptor {
  const layers: Layer[] = [
    {
      id: 'fond',
      type: 'shape',
      kind: 'rect',
      fill: '#111827',
      stroke: 'transparent',
      strokeWidth: 0,
      radius: 0,
      x: 0,
      y: 0,
      w: 1080,
      h: 1080,
      rotation: 0,
      z: 10,
      opacity: 1,
    },
    {
      id: ANCHOR,
      type: 'image',
      src: TRANSPARENT,
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
      kind: 'circle',
      fill: '#FFD93D',
      stroke: 'transparent',
      strokeWidth: 0,
      radius: 0,
      x: 40,
      y: 40,
      w: 200,
      h: 200,
      rotation: 0,
      z: 30,
      opacity: 1,
    },
  ];

  return {
    version: 1,
    ratio: '1:1',
    background: 'transparent',
    photo_anchor: ANCHOR,
    ...(subject ? { subject } : {}),
    layers,
    motion: null,
  };
}

/** Un cadre en mode Cadre : aucune ancre, la photo passe sous tout le visuel. */
function cadreFrame(): Descriptor {
  const frame = fondFrame();
  return { ...frame, photo_anchor: undefined, layers: frame.layers.filter((l) => l.id !== ANCHOR) };
}

const styleWithText: ParticipantStyle = {
  filter: 'none',
  text: { ...defaultParticipantText(zone, '1:1'), content: 'MOON RABBIT' },
};

const ids = (d: Descriptor): string => d.layers.map((l) => l.id).join(' > ');

/**
 * L'ordre que la **scène** construit, rejoué à l'identique :
 * les calques sous la zone, le média du participant, les calques au-dessus,
 * puis son texte au sommet.
 *
 * On ne peut pas monter la scène ici (elle a besoin de Fabric et d'un canvas
 * natif) : on rejoue donc sa construction, en lisant les **mêmes** fonctions
 * qu'elle — `participantInsertIndex()` en particulier. C'est ce qui rend le
 * contrôle significatif : si la scène et l'export cessaient de s'accorder, la
 * divergence passerait par cette fonction et l'assertion tomberait.
 */
function previewOrder(frame: Descriptor, withText: boolean): string {
  const sorted = [...frame.layers].sort((a, b) => a.z - b.z);
  const at = participantInsertIndex(frame, sorted);
  const order = [
    ...sorted.slice(0, at).map((l) => l.id),
    PARTICIPANT_PHOTO_ID,
    ...sorted.slice(at).map((l) => l.id),
  ];
  if (withText) order.push(PARTICIPANT_TEXT_ID);
  return order.join(' > ');
}

/**
 * TÉMOIN NÉGATIF — l'**ancienne** règle de la scène, recopiée volontairement :
 * « le média du participant d'abord, puis tous les calques du créateur ».
 *
 * Elle est conservée ici pour être **mesurée**, pas pour être utilisée. Sans
 * elle, rien ne prouve que les assertions ci-dessus distinguent quoi que ce
 * soit : elles passeraient aussi bien sur un code qui empile à l'envers.
 */
function legacyPreviewOrder(frame: Descriptor): string {
  const sorted = [...frame.layers].sort((a, b) => a.z - b.z);
  return [PARTICIPANT_PHOTO_ID, ...sorted.map((l) => l.id)].join(' > ');
}

/* ------------------------------------------------------------------ */
/* Contrôles                                                           */
/* ------------------------------------------------------------------ */

function main(): void {
  console.log('\nOrdre des plans — mode Fond classique et détourage\n');

  const frame = fondFrame();
  const sorted = [...frame.layers].sort((a, b) => a.z - b.z);
  const placement = initialPlacement(photo, zone);

  /* ---------------- 1. Un point d'insertion, un seul ---------------- */
  {
    const at = participantInsertIndex(frame, sorted);
    eq('la photo s’insère juste au-dessus de la zone', at, 2);

    const composed = composeDescriptor(frame, photo, placement, DEFAULT_PARTICIPANT_STYLE);
    eq(
      'l’export place la photo au-dessus de la zone, pas au-dessus du premier plan',
      ids(composed),
      'fond > zone-photo > participant-photo > devant',
    );
    eq(
      'la scène et l’export lisent le même point d’insertion',
      composed.layers.findIndex((l) => l.id === PARTICIPANT_PHOTO_ID),
      at,
    );
  }

  /* ---------------- 2. L'aperçu suit l'export ---------------- */
  {
    const composed = composeDescriptor(frame, photo, placement, DEFAULT_PARTICIPANT_STYLE);
    eq(
      'sans texte : la scène empile exactement comme l’export',
      previewOrder(frame, false),
      ids(composed),
    );

    const composedText = composeDescriptor(frame, photo, placement, styleWithText);
    eq(
      'avec texte : la scène empile exactement comme l’export',
      previewOrder(frame, true),
      ids(composedText),
    );
    eq(
      'le texte du participant reste au sommet',
      composedText.layers[composedText.layers.length - 1].id,
      PARTICIPANT_TEXT_ID,
    );
  }

  /* ---------------- 3. Témoin négatif ---------------- */
  {
    const composed = composeDescriptor(frame, photo, placement, DEFAULT_PARTICIPANT_STYLE);
    const legacy = legacyPreviewOrder(frame);
    ok(
      'témoin : l’ancien ordre de l’aperçu différait bien de l’export',
      legacy !== ids(composed),
      legacy,
    );
    ok(
      'témoin : dans l’ancien ordre, la photo passait sous le fond opaque',
      legacy.indexOf(PARTICIPANT_PHOTO_ID) < legacy.indexOf('fond'),
      legacy,
    );
  }

  /* ---------------- 4. Mode Cadre : rien ne change ---------------- */
  {
    const cadre = cadreFrame();
    const composed = composeDescriptor(cadre, photo, placement, DEFAULT_PARTICIPANT_STYLE);
    eq(
      'mode Cadre : la photo reste sous tous les calques du visuel',
      ids(composed),
      'participant-photo > fond > devant',
    );
    eq('mode Cadre : la scène suit le même ordre', previewOrder(cadre, false), ids(composed));
  }

  /* ---------------- 5. Le détourage est un mode distinct ---------------- */
  {
    ok('un cadre sans drapeau n’est pas détouré', !isCutout(fondFrame()));
    ok('un cadre marqué est détouré', isCutout(fondFrame('cutout')));

    ok('mode Fond classique : la photo est découpée à la zone', clipsParticipantPhoto(fondFrame()));
    ok('détourage : plus aucune découpe rectangulaire', !clipsParticipantPhoto(fondFrame('cutout')));
    ok('mode Cadre : jamais de découpe', !clipsParticipantPhoto(cadreFrame()));

    eq('mode Fond classique : ajustement « couvrir »', photoFit(fondFrame()), 'cover');
    eq('détourage : ajustement « contenir »', photoFit(fondFrame('cutout')), 'contain');
  }

  /* ---------------- 6. Couvrir et contenir sont bien deux choses ---------------- */
  {
    const cover = coverSize(photo, zone);
    const contain = containSize(photo, zone);

    eq('couvrir remplit la zone en largeur', cover.w, 700);
    eq('couvrir dépasse en hauteur — la photo déborde', cover.h, 875);
    eq('contenir tient entièrement en hauteur', contain.h, 700);
    eq('contenir laisse des marges sur la largeur', contain.w, 560);

    ok(
      'contenir : le sujet ne dépasse jamais de la zone',
      contain.w <= zone.w && contain.h <= zone.h,
      `${contain.w}×${contain.h} dans ${zone.w}×${zone.h}`,
    );
    ok(
      'contenir : l’ajustement est serré, sans espace perdu',
      contain.w === zone.w || contain.h === zone.h,
      `${contain.w}×${contain.h}`,
    );
    ok('témoin : couvrir, lui, dépasse bien', cover.h > zone.h, `${cover.w}×${cover.h}`);
    ok('couvrir et contenir ne donnent pas le même résultat', cover.w !== contain.w);
  }

  /* ---------------- 7. Le calque du participant suit l'ajustement ---------------- */
  {
    const coverLayer = photoLayer(photo, zone, initialPlacement(photo, zone), 0, 'none');
    const cutLayer = photoLayer(
      photo,
      zone,
      initialPlacement(photo, zone, 'contain'),
      0,
      'none',
      'contain',
    );

    eq('sans ajustement précisé, le calque couvre comme avant', `${coverLayer.w}×${coverLayer.h}`, '700×875');
    ok(
      'en détourage, le calque du sujet tient entier dans la zone',
      cutLayer.w <= zone.w && cutLayer.h <= zone.h,
      `${cutLayer.w}×${cutLayer.h}`,
    );
  }

  /* ---------------- 8. Non-régression du défaut ---------------- */
  {
    eq('photoSize sans ajustement est la couverture d’origine', photoSize(photo, zone, 1).h, 875);
    eq('photoSize sans ajustement reste linéaire en zoom', photoSize(photo, zone, 2).h, 1750);
    eq('photoSize en détourage, au zoom 2, double le sujet', photoSize(photo, zone, 2, 'contain').h, 1400);
  }

  /* ---------------- 9. Sérialisation : les cadres publiés ne bougent pas ---------------- */
  {
    const legacy = serializeDescriptor(fondFrame());
    ok('un cadre classique ne sérialise aucun mode de sujet', !legacy.includes('"subject"'));

    const cut = serializeDescriptor(fondFrame('cutout'));
    ok('un cadre détouré sérialise son mode', cut.includes('"subject": "cutout"'));

    const back = parseDescriptor(JSON.parse(cut));
    eq('le mode survit à l’aller-retour', back.subject, 'cutout');

    const backLegacy = parseDescriptor(JSON.parse(legacy));
    eq('un cadre d’avant le détourage se relit sans mode', backLegacy.subject, undefined);
    const roundTrip = serializeDescriptor(backLegacy);
    ok(
      'un cadre d’avant le détourage se réenregistre à l’octet près',
      roundTrip === legacy,
      `${legacy.length} octets relus, ${roundTrip.length} réécrits`,
    );

    const weird = parseDescriptor({ ...fondFrame(), subject: 'magie' });
    eq('un mode de sujet inconnu est abandonné, jamais remplacé', weird.subject, undefined);
  }

  /* ---------------- 10. Pas de dérive ---------------- */
  {
    const first = composeDescriptor(frame, photo, placement, styleWithText);
    const second = composeDescriptor(frame, photo, placement, styleWithText);
    eq('deux compositions identiques rendent le même ordre', ids(second), ids(first));

    const emitted = parseDescriptor(JSON.parse(serializeDescriptor(first)));
    eq(
      'l’aller-retour de sérialisation préserve l’ordre des plans',
      ids(emitted),
      ids(first),
    );
  }

  console.log(
    failures === 0
      ? '\nPASS — 0 contrôle en échec\n'
      : `\nFAIL — ${failures} contrôle(s) en échec\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
