/*
 * Contrôle du parcours participant — filtre, texte, ordre d'empilement.
 *
 * Pourquoi ce harnais existe : le filtre et le texte du participant ne sont pas
 * des réglages d'écran, ce sont des **calques du descripteur**. Deux propriétés
 * en découlent, invisibles à la lecture et coûteuses si elles cassent :
 *
 *   1. l'ordre d'empilement — le texte doit passer au-dessus de la photo et
 *      rester sous le cadre, sinon le participant peut effacer le travail du
 *      créateur, ou son texte devient invisible sans qu'il comprenne pourquoi ;
 *   2. le plan d'animation — `sampleAt()` indexe les mouvements **par position**,
 *      donc insérer deux calques sans réserver deux mouvements neutres décale
 *      toute l'animation des calques suivants.
 *
 * On vérifie donc, en exécutant réellement le code :
 *   — la position des calques du participant dans les deux modes (Cadre, Fond) ;
 *   — la stricte croissance des `z`, qui est ce qui rend l'ordre non ambigu ;
 *   — les mouvements neutres, et la conservation des mouvements du créateur ;
 *   — que les filtres Fabric sont bien construits, et exprimés en fractions ;
 *   — que le filtre survit à l'aller-retour du descripteur, et qu'un filtre
 *     inconnu est abandonné plutôt que remplacé.
 *
 * Lancement : `npm run check:participant`
 */
import {
  DEFAULT_PARTICIPANT_STYLE,
  clampTextPosition,
  composeDescriptor,
  participantTextLayer,
  participantTextSize,
  participantTextWidth,
  type ParticipantPhoto,
  type ParticipantStyle,
} from '../../lib/participant';
import { PHOTO_FILTER_IDS, createPhotoFilters } from '../../lib/photo-filters';
import {
  PARTICIPANT_PHOTO_ID,
  PARTICIPANT_TEXT_ID,
  parseDescriptor,
  serializeDescriptor,
} from '../../lib/descriptor';
import type { Descriptor, ImageLayer } from '../../lib/types';

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

const photo: ParticipantPhoto = {
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
  naturalWidth: 1200,
  naturalHeight: 1600,
};

const placement = { zoom: 1, x: 0, y: 0 };

/** Un cadre à trois calques, avec un plan d'animation repérable. */
function makeFrame(anchor?: string): Descriptor {
  return {
    version: 1,
    ratio: '1:1',
    background: 'transparent',
    layers: [
      {
        id: 'a',
        type: 'shape',
        kind: 'rect',
        fill: '#FFFFFF',
        stroke: 'transparent',
        strokeWidth: 0,
        radius: 0,
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        rotation: 0,
        z: 10,
        opacity: 1,
      },
      {
        id: 'b',
        type: 'image',
        src: 'data:image/png;base64,AAAA',
        x: 0,
        y: 0,
        w: 200,
        h: 200,
        rotation: 0,
        z: 20,
        opacity: 1,
      },
      {
        id: 'c',
        type: 'text',
        text: 'Cadre',
        font: 'Inter',
        size: 48,
        color: '#FFFFFF',
        align: 'center',
        weight: 'normal',
        style: 'normal',
        letterSpacing: 0,
        lineHeight: 1.16,
        curve: 0,
        x: 0,
        y: 0,
        w: 200,
        h: 60,
        rotation: 0,
        z: 30,
        opacity: 1,
      },
    ],
    ...(anchor ? { photo_anchor: anchor } : {}),
    motion: {
      preset: 'auto',
      durationMs: 3000,
      stagger: 0.05,
      // `fadeIn` sert de marqueur : chaque mouvement du créateur est
      // identifiable, et un mouvement neutre vaut 0.
      layers: [
        { fadeIn: 1, floatY: 0, floatX: 0, pulse: 0, rotate: 0, cycles: 1 },
        { fadeIn: 2, floatY: 0, floatX: 0, pulse: 0, rotate: 0, cycles: 1 },
        { fadeIn: 3, floatY: 0, floatX: 0, pulse: 0, rotate: 0, cycles: 1 },
      ],
    },
  };
}

const STYLE_WITH_TEXT: ParticipantStyle = {
  filter: 'sepia',
  text: { content: 'Awa', color: '#FFFFFF', x: 100, y: 200 },
};

const ids = (d: Descriptor): string => d.layers.map((l) => l.id).join(' → ');
const motions = (d: Descriptor): string =>
  (d.motion?.layers ?? []).map((l) => String(l.fadeIn)).join(',');
const strictlyRising = (d: Descriptor): boolean =>
  d.layers.every((l, i) => i === 0 || l.z > d.layers[i - 1].z);

async function main(): Promise<void> {
  /* ---------------- 1. Mode Cadre, sans texte ---------------- */
  console.log('\nMode Cadre — photo seule');
  {
    const frame = makeFrame();
    const composed = composeDescriptor(frame, photo, placement, DEFAULT_PARTICIPANT_STYLE);
    eq('la photo passe sous tous les calques', ids(composed), `${PARTICIPANT_PHOTO_ID} → a → b → c`);
    ok('les z croissent strictement', strictlyRising(composed), composed.layers.map((l) => l.z).join(', '));
    eq('un seul mouvement neutre est réservé', motions(composed), '0,1,2,3');
    ok('le cadre du créateur n’est pas modifié', frame.layers.length === 3);
  }

  /* ---------------- 2. Mode Cadre, avec texte et filtre ---------------- */
  console.log('\nMode Cadre — photo, texte et filtre');
  {
    const composed = composeDescriptor(makeFrame(), photo, placement, STYLE_WITH_TEXT);
    eq(
      'le texte est au-dessus de la photo, sous le cadre',
      ids(composed),
      `${PARTICIPANT_PHOTO_ID} → ${PARTICIPANT_TEXT_ID} → a → b → c`,
    );
    ok('les z croissent strictement', strictlyRising(composed), composed.layers.map((l) => l.z).join(', '));
    eq('le filtre voyage dans le descripteur', (composed.layers[0] as ImageLayer).filter, 'sepia');
    eq('deux mouvements neutres sont réservés', motions(composed), '0,0,1,2,3');
  }

  /* ---------------- 3. Mode Fond (ancre sur « b ») ---------------- */
  console.log('\nMode Fond — les calques se glissent au-dessus de l’ancre');
  {
    const composed = composeDescriptor(makeFrame('b'), photo, placement, STYLE_WITH_TEXT);
    eq(
      'photo et texte juste au-dessus du calque d’ancrage',
      ids(composed),
      `a → b → ${PARTICIPANT_PHOTO_ID} → ${PARTICIPANT_TEXT_ID} → c`,
    );
    ok('les z croissent strictement', strictlyRising(composed), composed.layers.map((l) => l.z).join(', '));
    // Le bloc neutre doit être contigu, sinon les calques suivants héritent du
    // mouvement de la photo.
    eq('mouvements neutres contigus après l’ancre', motions(composed), '1,0,0,2,3');
  }

  /* ---------------- 4. Texte vide ---------------- */
  console.log('\nTexte vide');
  {
    const composed = composeDescriptor(makeFrame(), photo, placement, {
      filter: 'none',
      text: { content: '   ', color: '#000000', x: 0, y: 0 },
    });
    ok(
      'un texte vide n’ajoute aucun calque',
      !composed.layers.some((l) => l.id === PARTICIPANT_TEXT_ID),
      ids(composed),
    );
    eq('un seul mouvement neutre est réservé', motions(composed), '0,1,2,3');
  }

  /* ---------------- 5. Sans photo ---------------- */
  console.log('\nSans photo');
  {
    const frame = makeFrame();
    const composed = composeDescriptor(frame, null, null, STYLE_WITH_TEXT);
    ok('le descripteur est renvoyé tel quel', composed === frame);
  }

  /* ---------------- 6. Aller-retour du descripteur ---------------- */
  console.log('\nAller-retour du descripteur');
  {
    const withFilter = makeFrame();
    (withFilter.layers[1] as ImageLayer).filter = 'grayscale';
    const back = parseDescriptor(JSON.parse(serializeDescriptor(withFilter)));
    eq(
      'le filtre survit à l’aller-retour',
      (back.layers.find((l) => l.id === 'b') as ImageLayer).filter,
      'grayscale',
    );

    const unknown = makeFrame();
    (unknown.layers[1] as ImageLayer).filter = 'nope' as never;
    const dropped = parseDescriptor(JSON.parse(serializeDescriptor(unknown)));
    ok(
      'un filtre inconnu est abandonné, pas remplacé',
      (dropped.layers.find((l) => l.id === 'b') as ImageLayer).filter === undefined,
    );

    const none = makeFrame();
    (none.layers[1] as ImageLayer).filter = 'none';
    ok('« none » n’est pas écrit dans le descripteur', !serializeDescriptor(none).includes('"filter"'));
  }

  /* ---------------- 7. Les filtres Fabric sont réellement construits ---------------- */
  console.log('\nFiltres Fabric');
  {
    const expected: Record<string, string> = {
      grayscale: 'Grayscale',
      sepia: 'Sepia',
      brightness: 'Brightness',
      contrast: 'Contrast',
      blur: 'Blur',
    };

    for (const id of PHOTO_FILTER_IDS) {
      const built = await createPhotoFilters(id);
      if (id === 'none') {
        eq('none → aucun filtre (les pixels d’origine)', built.length, 0);
        continue;
      }
      eq(`${id} → un filtre construit`, built.length, 1);
      eq(`${id} → type Fabric`, built[0].type, expected[id]);
    }

    const [blur] = await createPhotoFilters('blur');
    const amount = (blur as unknown as { blur: number }).blur;
    ok(
      'le flou est une fraction de la dimension, jamais des pixels',
      amount > 0 && amount <= 1,
      `blur = ${amount}`,
    );
  }

  /* ---------------- 8. Bornes du texte ---------------- */
  console.log('\nTexte — bornes et dimensions');
  {
    const frame = { w: 1080, h: 1080 };
    const size = { w: 200, h: 60 };

    const inside = clampTextPosition(size, frame, 400, 400);
    eq('un texte déjà dans le cadre ne bouge pas', `${inside.x},${inside.y}`, '400,400');

    const pushed = clampTextPosition(size, frame, 5000, -5000);
    const centre = { x: pushed.x + size.w / 2, y: pushed.y + size.h / 2 };
    ok(
      'un texte poussé hors du cadre garde son centre dedans',
      centre.x >= 0 && centre.x <= frame.w && centre.y >= 0 && centre.y <= frame.h,
      JSON.stringify(pushed),
    );

    const zone = { x: 0, y: 0, w: 1080, h: 1080 };
    ok('la largeur du texte est un budget positif', participantTextWidth(zone) > 0);
    ok('le corps du texte est positif', participantTextSize('1:1') > 0);

    const layer = participantTextLayer(
      { content: 'Awa', color: '#FFFFFF', x: 10, y: 20 },
      zone,
      '1:1',
    );
    eq('le calque texte porte l’identifiant réservé', layer.id, PARTICIPANT_TEXT_ID);
    eq('le calque texte garde la position demandée', `${layer.x},${layer.y}`, '10,20');
  }

  console.log(
    `\n${failures === 0 ? 'PASS' : 'ÉCHEC'} — ${failures} contrôle${failures > 1 ? 's' : ''} en échec\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
