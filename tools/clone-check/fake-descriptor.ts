/**
 * Faux `descriptor` — de quoi raisonner sans Fabric, sans réseau, sans base.
 *
 * POURQUOI CE FAUX MODULE EST MOTIVÉ (et pas un mock de confort)
 * -------------------------------------------------------------
 * Le vrai `lib/descriptor.ts` est importable et pur : `nextZ`, `makeLayers`,
 * `parseDescriptor`… ne touchent ni le DOM ni le réseau. Ce qui NE l'est pas,
 * c'est l'éditeur : `duplicateSelected` vit dans `components/frame/frame-editor.tsx`,
 * qui importe Fabric.js. Or le binaire natif `canvas` est absent de cet
 * environnement — `import 'fabric'` jette, donc un harnais ne peut pas instancier
 * la vraie scène.
 *
 * On reproduit ici **exactement deux** mécanismes, et rien d'autre :
 *
 *   1. `nextZ(layers)` — recopié À L'IDENTIQUE de `lib/descriptor.ts`, pour que
 *      la règle mesurée soit la vraie. (`lib/descriptor.ts` est testé DIRECTEMENT
 *      dans `check:text` ; le dupliquer ici sert à tester le **chemin du clone**,
 *      pas la fabrique.)
 *   2. `emitFromCanvas(layers)` — la réécriture `z = (index + 1) * 10` depuis
 *      l'ordre du tableau, qui est la règle réelle de `frame-editor.tsx:262`.
 *
 * `cloneViaEditor` reproduit `duplicateSelected` : clone poussé EN FIN de tableau
 * (comme le vrai `[...layers, copy]`), `id` neuf, décalage x/y, `visible`/`locked`
 * remis à `undefined`.
 *
 * Ce module porte donc une **décision de conception à auditer** : si l'éditeur
 * change sa façon d'insérer un clone, ce fichier devient faux. C'est assumé — et
 * le test de falsifiabilité le rend visible, puisque le harnais ÉCHOUE dès que la
 * garde est retirée du faux module.
 */

export interface FakeLayer {
  id: string;
  type?: 'image' | 'text' | 'shape';
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  /**
   * Ordre d'empilement. `number | undefined` — comme le vrai `Layer`, où le `z`
   * peut manquer sur un descripteur relu d'une version antérieure.
   */
  z?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
}

export interface FakeDescriptor {
  ratio: '1:1' | '16:9' | '9:16';
  layers: FakeLayer[];
}

/* ------------------------------------------------------------------ */
/* Mécanisme 1 — la règle d'empilement (recopie de lib/descriptor.ts)  */
/* ------------------------------------------------------------------ */

/** Étape d'échelonnement du `z`. Même constante que `lib/descriptor.ts`. */
export const Z_STEP = 10;

/**
 * Le `z` du prochain calque ajouté : **strictement au-dessus du sommet**.
 *
 * SEULE autorité du « prochain z ». Elle lit le `z` **maximal**, jamais le
 * nombre de calques : après une suppression, `layers.length` retombe et
 * `length * 10 + 10` rend un `z` déjà occupé.
 *
 * ATTENTION — c'est le point que le test de falsifiabilité manipule. Retirer la
 * lecture du `max` pour la remplacer par `length` doit faire ÉCHOUER le harnais.
 */
export function nextZ(layers: FakeLayer[]): number {
  const top = layers.reduce((max, l) => Math.max(max, l.z ?? 0), 0);
  return top + Z_STEP;
}

/* ------------------------------------------------------------------ */
/* Mécanisme 2 — l'émission depuis la scène (recopie de frame-editor)  */
/* ------------------------------------------------------------------ */

/**
 * Miroir de `emitFromCanvas` (`frame-editor.tsx:262`) : le `z` est **réécrit**
 * à chaque émission depuis l'index dans le tableau, jamais depuis le `z` posé
 * à l'insertion.
 *
 * C'est ce qui rend un `z` intermédiaire (ex. `source.z + 1`) inopérant : il ne
 * survit pas au premier geste qui réémet.
 */
export function emitFromCanvas(layers: FakeLayer[]): FakeLayer[] {
  return layers.map((layer, index) => ({ ...layer, z: (index + 1) * Z_STEP }));
}

/* ------------------------------------------------------------------ */
/* Le chemin du clone (miroir de duplicateSelected)                    */
/* ------------------------------------------------------------------ */

let cloneCounter = 0;

/**
 * Miroir du calcul de `duplicateSelected` (`frame-editor.tsx:1145-1170`).
 *
 * `guard` vaut `true` par défaut : on utilise `nextZ`, la règle correcte.
 * Le passer à `false` rejoue le défaut historique (`source.z + 1`) — c'est ce
 * que fait le test de falsifiabilité.
 *
 * Le clone est poussé **en fin de tableau**, exactement comme le vrai
 * `layers: [...layers, copy]`.
 */
export function cloneViaEditor(
  descriptor: FakeDescriptor,
  sourceId: string,
  opts: { guard?: boolean; offset?: number } = {},
): { descriptor: FakeDescriptor; cloneId: string } {
  const { guard = true, offset = 24 } = opts;

  const source = descriptor.layers.find((l) => l.id === sourceId);
  if (!source) throw new Error(`cloneViaEditor : source introuvable (${sourceId})`);

  cloneCounter += 1;
  const cloneId = `clone-${cloneCounter}`;

  const copy: FakeLayer = {
    ...source,
    id: cloneId,
    x: source.x + offset,
    y: source.y + offset,
    // Un clone ne naît ni masqué ni verrouillé.
    visible: undefined,
    locked: undefined,
    // GARDE : `nextZ` lit le sommet réel. Sans garde : `source.z + 1`, le défaut.
    z: guard ? nextZ(descriptor.layers) : (source.z ?? 0) + 1,
  };

  return {
    descriptor: { ...descriptor, layers: [...descriptor.layers, copy] },
    cloneId,
  };
}

/** Remet à zéro le compteur d'identifiants — pour des runs reproductibles. */
export function resetCloneCounter(): void {
  cloneCounter = 0;
}

/* ------------------------------------------------------------------ */
/* Mesures — les invariants que le harnais vérifie                     */
/* ------------------------------------------------------------------ */

/** Ordre d'empilement effectif : `z` croissant, index 0 = fond. */
export function stackOrder(layers: FakeLayer[]): string[] {
  return [...layers].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)).map((l) => l.id);
}

/** Sommet réel (le plus grand `z`), ou `0` sur un cadre vide. */
export function topZ(layers: FakeLayer[]): number {
  return layers.reduce((max, l) => Math.max(max, l.z ?? 0), 0);
}

/** Les `z` qui apparaissent plus d'une fois. Vide = ordre non ambigu. */
export function duplicateZs(layers: FakeLayer[]): number[] {
  const seen = new Map<number, number>();
  for (const l of layers) {
    const z = l.z ?? 0;
    seen.set(z, (seen.get(z) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([z]) => z).sort((a, b) => a - b);
}

/** Index d'un calque dans l'ordre d'empilement (0 = fond). */
export function rankOf(layers: FakeLayer[], id: string): number {
  return stackOrder(layers).indexOf(id);
}
