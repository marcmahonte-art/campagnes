/*
 * Contrôle de l'historique « Annuler / Rétablir » du parcours participant.
 *
 * Ce que ce harnais doit prouver, et qu'on ne peut pas prouver en lisant :
 *
 *  1. un glissement au doigt (des dizaines d'événements) ne crée **qu'une**
 *     entrée, sinon « Annuler » semblerait cassé ;
 *  2. un geste qui ne change **rien** ne crée aucune entrée — c'est le piège de
 *     la comparaison par identité, corrigé par `isSameParticipantState` ;
 *  3. annuler un **changement de photo** ramène bien la photo précédente ;
 *  4. `redo` restaure exactement ce que `undo` avait retiré ;
 *  5. le premier dépôt de photo part d'un historique **vide** (rien à annuler).
 *
 * On reproduit ici l'algorithme de `useHistory` (aucune dépendance React) en
 * important la **vraie** fonction `isSameParticipantState` du projet : si sa
 * logique change, ce contrôle change avec elle.
 */
import {
  isSameParticipantState,
  type ParticipantPhoto,
  type ParticipantState,
} from '../../lib/participant';

/* ------------------------------------------------------------------ */
/* Réplique minimale de useHistory                                     */
/* ------------------------------------------------------------------ */

interface Snapshot<T> {
  past: T[];
  present: T;
  future: T[];
  lastAt: number;
}

function makeHistory<T>(
  initial: T,
  equals: (a: T, b: T) => boolean,
  options: { limit?: number; coalesceMs?: number; now?: () => number } = {},
) {
  const limit = options.limit ?? 40;
  const coalesceMs = options.coalesceMs ?? 900;
  const now = options.now ?? (() => Date.now());

  let snap: Snapshot<T> = { past: [], present: initial, future: [], lastAt: 0 };

  return {
    get value() {
      return snap.present;
    },
    get canUndo() {
      return snap.past.length > 0;
    },
    get canRedo() {
      return snap.future.length > 0;
    },
    /** Nombre d'entrées réellement empilées — l'indicateur qui compte ici. */
    get depth() {
      return snap.past.length;
    },
    set(next: T | ((prev: T) => T), opts?: { coalesce?: boolean }) {
      const value = typeof next === 'function' ? (next as (p: T) => T)(snap.present) : next;
      if (equals(value, snap.present)) return;
      const t = now();
      const coalesce =
        opts?.coalesce === true && snap.past.length > 0 && t - snap.lastAt < coalesceMs;
      snap = {
        past: coalesce ? snap.past : [...snap.past, snap.present].slice(-limit),
        present: value,
        future: [],
        lastAt: t,
      };
    },
    reset(next: T) {
      snap = { past: [], present: next, future: [], lastAt: 0 };
    },
    undo() {
      if (snap.past.length === 0) return;
      snap = {
        past: snap.past.slice(0, -1),
        present: snap.past[snap.past.length - 1],
        future: [snap.present, ...snap.future],
        lastAt: 0,
      };
    },
    redo() {
      if (snap.future.length === 0) return;
      snap = {
        past: [...snap.past, snap.present].slice(-limit),
        present: snap.future[0],
        future: snap.future.slice(1),
        lastAt: 0,
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const PHOTO_A: ParticipantPhoto = { src: 'data:image/png;base64,AAA', naturalWidth: 1200, naturalHeight: 900 };
const PHOTO_B: ParticipantPhoto = { src: 'data:image/png;base64,BBB', naturalWidth: 800, naturalHeight: 800 };

const START: ParticipantState = {
  photo: PHOTO_A,
  placement: { zoom: 1, x: 100, y: 100 },
  style: { filter: 'none', text: null },
};

/* Horloge contrôlée : on décide du temps pour tester le regroupement. */
let clock = 0;
const now = () => clock;

let failures = 0;

function report(label: string, ok: boolean, detail: string): void {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label} — ${detail}`);
}

function main(): void {
  console.log('\n=== 1. Un glissement au doigt = une seule entrée ===');
  {
    const h = makeHistory<ParticipantState>(START, isSameParticipantState, { now });
    clock = 0;

    // 40 événements « object:moving », comme le ferait un vrai glissement.
    for (let i = 1; i <= 40; i += 1) {
      clock += 10; // 10 ms entre deux événements : bien en deçà de 900 ms
      h.set(
        (c) => ({ ...c, placement: { ...c.placement!, x: 100 + i, y: 100 + i } }),
        { coalesce: true },
      );
    }

    report(
      'une seule entrée malgré 40 événements',
      h.depth === 1,
      `${h.depth} entrée(s)`,
    );
    report(
      'le glissement est bien terminé',
      h.value.placement?.x === 140,
      `x = ${h.value.placement?.x}`,
    );

    h.undo();
    report(
      'annuler ramène au point de départ',
      h.value.placement?.x === 100,
      `x = ${h.value.placement?.x}`,
    );
    report(
      'il n’y a plus rien à annuler',
      h.canUndo === false,
      `canUndo = ${h.canUndo}`,
    );
  }

  console.log('\n=== 2. Un geste qui ne change rien ne crée rien ===');
  {
    const h = makeHistory<ParticipantState>(START, isSameParticipantState, { now });
    clock = 0;

    /*
     * C'est LE piège corrigé : `zoomAroundCenter` renvoie toujours un objet
     * NEUF, même quand le zoom ne bouge pas d'un cran. Avec une comparaison par
     * identité, chacun de ces appels empilerait une entrée.
     */
    for (let i = 0; i < 25; i += 1) {
      clock += 10;
      h.set({ photo: h.value.photo, placement: { zoom: 1, x: 100, y: 100 }, style: h.value.style });
    }

    report(
      'aucune entrée pour 25 gestes sans effet',
      h.depth === 0,
      `${h.depth} entrée(s)`,
    );
    report(
      'et donc rien à annuler',
      h.canUndo === false,
      `canUndo = ${h.canUndo}`,
    );
  }

  console.log('\n=== 3. Annuler un changement de photo restaure la précédente ===');
  {
    const h = makeHistory<ParticipantState>(START, isSameParticipantState, { now });
    clock = 0;

    clock += 10;
    h.set((c) => ({
      ...c,
      photo: PHOTO_B,
      placement: { zoom: 1.5, x: 50, y: 50 },
      style: { filter: 'sepia', text: null },
    }));

    report('la photo B est en place', h.value.photo === PHOTO_B, String(h.value.photo?.src.slice(-3)));
    h.undo();
    report('annuler ramène la photo A', h.value.photo === PHOTO_A, String(h.value.photo?.src.slice(-3)));
    report(
      'et son ancien cadrage',
      h.value.placement?.zoom === 1,
      `zoom = ${h.value.placement?.zoom}`,
    );
    h.redo();
    report('rétablir ramène la photo B', h.value.photo === PHOTO_B, String(h.value.photo?.src.slice(-3)));
    report(
      'et son filtre',
      h.value.style.filter === 'sepia',
      h.value.style.filter,
    );
  }

  console.log('\n=== 4. Filtre, texte et placement sont tous annulables ===');
  {
    const h = makeHistory<ParticipantState>(START, isSameParticipantState, { now });
    clock = 0;

    clock += 1000;
    h.set((c) => ({ ...c, style: { ...c.style, filter: 'grayscale' } }));
    clock += 1000;
    h.set((c) => ({
      ...c,
      style: { ...c.style, text: { content: 'Bonjour', color: '#FFFFFF', x: 10, y: 10, align: 'left', size: 24, bold: true, italic: false, font: 'Inter', opacity: 1 } },
    }));
    clock += 1000;
    h.set((c) => ({
      ...c,
      style: { ...c.style, text: { content: 'Bonjour', color: '#FFFFFF', x: 10, y: 10, align: 'left', size: 24, bold: true, italic: false, font: 'Inter', opacity: 1 } as const, filter: 'sepia' as const },
    }));

    report('trois actions distinctes empilées', h.depth === 3, `${h.depth} entrée(s)`);

    h.undo();
    report('annuler 1 : le filtre revient à gris', h.value.style.filter === 'grayscale', h.value.style.filter);
    h.undo();
    report('annuler 2 : le texte disparaît', h.value.style.text === null, String(h.value.style.text));
    h.undo();
    report('annuler 3 : le filtre revient à aucun', h.value.style.filter === 'none', h.value.style.filter);
    report('historique vidé', h.canUndo === false, `canUndo = ${h.canUndo}`);
  }

  console.log('\n=== 5. Le premier dépôt part d’un historique vide ===');
  {
    const h = makeHistory<ParticipantState>(
      { photo: null, placement: null, style: { filter: 'none', text: null } },
      isSameParticipantState,
      { now },
    );

    // Ce que fait `setPhoto(..., reset: true)` au premier dépôt.
    h.reset({ photo: PHOTO_A, placement: { zoom: 1, x: 0, y: 0 }, style: { filter: 'none', text: null } });

    report('rien à annuler après le premier dépôt', h.canUndo === false, `canUndo = ${h.canUndo}`);
    report('la photo est bien posée', h.value.photo === PHOTO_A, 'ok');
  }

  console.log('\n=== 6. La comparaison structurelle est juste ===');
  {
    const a: ParticipantState = { photo: PHOTO_A, placement: { zoom: 1, x: 100, y: 100 }, style: { filter: 'none', text: null } };
    // Objet neuf, valeurs identiques.
    const b: ParticipantState = { photo: PHOTO_A, placement: { zoom: 1, x: 100, y: 100 }, style: { filter: 'none', text: null } };
    report('objets distincts, valeurs égales → égaux', isSameParticipantState(a, b), 'ok');

    // Écart réel de placement.
    const c: ParticipantState = { ...a, placement: { zoom: 1, x: 140, y: 100 } };
    report('un déplacement de 40 unités est vu', !isSameParticipantState(a, c), 'ok');

    // Écart sous le seuil d'un demi-point : du bruit de curseur, pas un geste.
    const d: ParticipantState = { ...a, placement: { zoom: 1, x: 100.2, y: 100 } };
    report('un bruit de 0,2 unité est ignoré', isSameParticipantState(a, d), 'ok');

    // Texte identique en contenu mais position décalée.
    const e: ParticipantState = { ...a, style: { filter: 'none', text: { content: 'X', color: '#FFF', x: 0, y: 0, align: 'left', size: 24, bold: true, italic: false, font: 'Inter', opacity: 1 } } };
    const f: ParticipantState = { ...a, style: { filter: 'none', text: { content: 'X', color: '#FFF', x: 60, y: 0, align: 'left', size: 24, bold: true, italic: false, font: 'Inter', opacity: 1 } } };
    report('un texte déplacé de 60 unités est vu', !isSameParticipantState(e, f), 'ok');
  }

  console.log(`\n${failures === 0 ? 'TOUT EST VERT' : `${failures} ÉCHEC(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
