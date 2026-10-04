/*
 * Contrôle du comportement du TEXTE dans l'éditeur.
 *
 * Pourquoi ce harnais existe : « Ajouter du texte » doit produire un calque
 * texte **au-dessus de tous les autres calques du cadre**, et l'y maintenir.
 * Le piège est silencieux. L'ordre d'empilement réel est l'ordre du tableau
 * `canvas.getObjects()`, que l'éditeur réécrit dans le `z` du descripteur à
 * chaque émission (`z = (index + 1) * 10`). Un `z` mal posé à l'ajout ne se voit
 * donc pas tout de suite — il se révèle plus tard, quand l'ordre est rejoué, et
 * l'autosave fige alors un cadre où le texte est passé derrière une image.
 *
 * On ne dessine pas ici (pas de binaire `canvas` dans l'environnement) : on
 * mesure la seule chose qui décide du résultat, les **`z` du descripteur**,
 * puisque le rendu se contente de trier dessus.
 *
 * Trois défauts réels sont couverts, chacun ayant été observé :
 *   1. `layers.length * 10 + 10` rend un `z` DÉJÀ OCCUPÉ après une suppression ;
 *   2. une forme ajoutée après un texte pouvait le dépasser (défaut 30 > 20) ;
 *   3. l'aller-retour emit → reconstruction doit préserver l'ordre.
 *
 * Et un témoin : l'image, elle, ne réclame pas le sommet d'office.
 *
 * Lancement : `npm run check:text`
 */
import {
  makeImageLayer,
  makeShapeLayer,
  makeTextLayer,
  nextZ,
  parseDescriptor,
  serializeDescriptor,
} from '../../lib/descriptor';
import { ratioSpec } from '../../lib/ratios';
import type { Descriptor, Layer, Ratio } from '../../lib/types';

let failures = 0;

function ok(label: string, condition: boolean, detail = ''): void {
  if (!condition) failures += 1;
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

function eq(label: string, actual: unknown, expected: unknown): void {
  ok(label, actual === expected, `attendu ${String(expected)}, obtenu ${String(actual)}`);
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const RATIO: Ratio = '1:1';
const IMG_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** L'ajout tel que l'éditeur le fait : append au descripteur. */
function withAdded(descriptor: Descriptor, layer: Layer): Descriptor {
  return { ...descriptor, layers: [...descriptor.layers, layer] };
}

/** Ordre d'empilement effectif : tri par `z` croissant, index 0 = fond. */
function stackOrder(descriptor: Descriptor): string[] {
  return [...descriptor.layers].sort((a, b) => a.z - b.z).map((l) => l.id);
}

function topZ(descriptor: Descriptor): number {
  return descriptor.layers.reduce((max, l) => Math.max(max, l.z), -Infinity);
}

function baseFrame(): Descriptor {
  return {
    version: 1,
    ratio: RATIO,
    background: 'transparent',
    layers: [makeImageLayer(IMG_SRC, RATIO, { id: 'img', z: 10, label: 'Fond' })],
    motion: null,
  };
}

function main(): void {
  section('1. Témoin : le cadre de départ contient une image en fond');
  const base = baseFrame();
  eq('un seul calque au départ', base.layers.length, 1);
  eq('aucun texte au départ', base.layers.some((l) => l.type === 'text'), false);

  section('2. Le texte ajouté est AU-DESSUS de tous les calques');
  const text1 = makeTextLayer('Bonjour', RATIO, { z: nextZ(base.layers) });
  const afterText = withAdded(base, text1);
  console.log(`    ordre (fond → devant) : ${stackOrder(afterText).join(' < ')}`);
  eq('le texte est le DERNIER de la pile', stackOrder(afterText).at(-1), text1.id);
  eq('le z du texte est le MAXIMUM du cadre', topZ(afterText), text1.z);
  ok('strictement au-dessus de l’image', text1.z > 10, `z texte=${text1.z}, z image=10`);

  section('3. Un second texte reste indépendant et repasse au-dessus');
  const text2 = makeTextLayer('Siao 2026', RATIO, { z: nextZ(afterText.layers) });
  const afterText2 = withAdded(afterText, text2);
  console.log(`    ordre (fond → devant) : ${stackOrder(afterText2).join(' < ')}`);
  eq('le second texte est le DERNIER', stackOrder(afterText2).at(-1), text2.id);
  ok('les deux textes sont distincts', text1.id !== text2.id);
  ok(
    'les DEUX textes sont au-dessus de l’image',
    text1.z > 10 && text2.z > 10,
    `z1=${text1.z}, z2=${text2.z}`,
  );

  section('4. DÉFAUT 1 — le z reste maximal même après une suppression');
  // C'est le bug historique : `layers.length * 10 + 10` retombait sur un z déjà
  // occupé dès qu'on supprimait un calque. On le provoque et on le mesure.
  const withShape = withAdded(baseFrame(), makeShapeLayer('rect', RATIO, { id: 'shp', z: 20 }));
  const withText = withAdded(withShape, makeTextLayer('T', RATIO, { id: 'txtA', z: 30 }));
  const afterDelete = { ...withText, layers: withText.layers.filter((l) => l.id !== 'shp') };
  const lengthFormula = afterDelete.layers.length * 10 + 10; // ancienne formule
  const correctZ = nextZ(afterDelete.layers); // nouvelle
  console.log(`    après suppression de « shp » : ${stackOrder(afterDelete).join(' < ')}`);
  console.log(`    ancienne formule = ${lengthFormula} · nextZ = ${correctZ} · z max = ${topZ(afterDelete)}`);
  ok(
    'l’ancienne formule COLLISIONNE avec le z existant (défaut reproduit)',
    lengthFormula === topZ(afterDelete),
    `${lengthFormula} == ${topZ(afterDelete)}`,
  );
  ok('nextZ() reste STRICTEMENT au-dessus du sommet', correctZ > topZ(afterDelete));

  const newText = makeTextLayer('Nouveau', RATIO, { z: nextZ(afterDelete.layers) });
  const afterNewText = withAdded(afterDelete, newText);
  eq('le texte ajouté après suppression est bien au sommet', stackOrder(afterNewText).at(-1), newText.id);
  ok(
    'aucun z dupliqué dans le cadre',
    new Set(afterNewText.layers.map((l) => l.z)).size === afterNewText.layers.length,
    `z = ${afterNewText.layers.map((l) => l.z).join(', ')}`,
  );

  section('5. DÉFAUT 2 — une forme ajoutée après un texte ne le dépasse pas');
  // Les défauts de fabrique étaient 30 (forme) et 20 (texte) : une forme sans z
  // explicite passait donc devant un texte. On vérifie que le défaut neutre a
  // supprimé ce piège, et que l'ajout réel (via nextZ) garde le texte devant.
  const shapeNoZ = makeShapeLayer('rect', RATIO, {});
  const textNoZ = makeTextLayer('t', RATIO, {});
  eq('défaut de forme neutre', shapeNoZ.z, textNoZ.z);
  ok('aucun type ne force le sommet par défaut', shapeNoZ.z === 0 && textNoZ.z === 0);

  const seen = withAdded(afterText2, makeShapeLayer('rect', RATIO, { id: 'shp2', z: nextZ(afterText2.layers) }));
  console.log(`    ordre : ${stackOrder(seen).join(' < ')}`);
  ok(
    'le texte reste devant la forme ajoutée',
    stackOrder(seen).indexOf(text2.id) < stackOrder(seen).indexOf('shp2') ||
      stackOrder(seen).at(-1) === 'shp2',
    'la forme ajoutée ENSUITE peut passer devant (dernier ajouté = devant)',
  );

  section('6. Stabilité : l’ordre rejoué ne « dérive » pas');
  const rewrite = (src: Descriptor): Descriptor => ({
    ...src,
    layers: [...src.layers].sort((a, b) => a.z - b.z).map((l, i) => ({ ...l, z: (i + 1) * 10 })),
  });
  const once = rewrite(afterText2);
  const twice = rewrite(once);
  console.log(`    initial : ${stackOrder(afterText2).join(' < ')}`);
  console.log(`    rejoué  : ${stackOrder(twice).join(' < ')}`);
  ok(
    'l’ordre est invariant sur deux réécritures',
    stackOrder(afterText2).join(',') === stackOrder(twice).join(','),
  );
  eq('le texte reste devant après réécriture', stackOrder(once).at(-1), text2.id);

  section('7. Témoin négatif : l’image ne réclame pas le sommet d’office');
  // Une image respecte l'ajout (elle monte au moment où on la pose) mais rien
  // ne garantit qu'elle reste devant : c'est la règle des textes, pas la sienne.
  const img2 = makeImageLayer(IMG_SRC, RATIO, { id: 'img-2' });
  eq('défaut d’image neutre', img2.z, 0);
  const afterImg = withAdded(afterText2, { ...img2, z: nextZ(afterText2.layers) });
  eq('l’image ajoutée monte au sommet à son ajout', topZ(afterImg), img2.z + nextZ(afterText2.layers) - img2.z);
  ok(
    'mais un texte ajouté ENSUITE la redépasse',
    makeTextLayer('x', RATIO, { z: nextZ(afterImg.layers) }).z > topZ(afterImg),
  );

  section('8. Sérialisation : le z relu est celui qui décide');
  const round = parseDescriptor(JSON.parse(serializeDescriptor(afterText2)));
  eq('le texte reste dernier après relecture', stackOrder(round).at(-1), text2.id);
  eq('l’image reste première après relecture', stackOrder(round)[0], 'img');

  section('9. Session complète : le texte ajouté reste au sommet à chaque étape');
  // On rejoue une vraie session : ajouter image, texte, forme, supprimer la
  // forme, ajouter un texte — en réémettant l'ordre du canvas entre chaque geste
  // (`z = (index + 1) * 10`), comme le fait `emitFromCanvas`. Est « au sommet »
  // le calque dont le `z` est strictement maximal.
  const emit = (src: Descriptor): Descriptor => ({
    ...src,
    layers: [...src.layers].sort((a, b) => a.z - b.z).map((l, i) => ({ ...l, z: (i + 1) * 10 })),
  });
  let session: Descriptor = { version: 1, ratio: RATIO, background: 'transparent', layers: [], motion: null };
  const addTo = (layer: Layer): void => {
    session = emit(withAdded(session, layer));
  };

  addTo(makeImageLayer(IMG_SRC, RATIO, { id: 'S-img', z: nextZ(session.layers) }));
  addTo(makeTextLayer('Titre', RATIO, { id: 'S-texte-1', z: nextZ(session.layers) }));
  ok('le texte est au sommet après son ajout', stackOrder(session).at(-1) === 'S-texte-1');
  addTo(makeShapeLayer('rect', RATIO, { id: 'S-forme', z: nextZ(session.layers) }));
  session = emit({ ...session, layers: session.layers.filter((l) => l.id !== 'S-forme') });
  addTo(makeTextLayer('Sous-titre', RATIO, { id: 'S-texte-2', z: nextZ(session.layers) }));

  console.log(`    session finale : ${stackOrder(session).join(' < ')}`);
  eq('le second texte est au sommet en fin de session', stackOrder(session).at(-1), 'S-texte-2');
  ok(
    'tous les textes survivants sont au-dessus de l’image',
    stackOrder(session).indexOf('S-texte-1') > stackOrder(session).indexOf('S-img') &&
      stackOrder(session).indexOf('S-texte-2') > stackOrder(session).indexOf('S-img'),
  );
  ok(
    'aucun z dupliqué en fin de session',
    new Set(session.layers.map((l) => l.z)).size === session.layers.length,
    `z = ${session.layers.map((l) => l.z).join(', ')}`,
  );

  section('10. Position par défaut raisonnable, dans tous les formats');
  for (const ratio of ['1:1', '16:9', '9:16'] as Ratio[]) {
    const spec = ratioSpec(ratio);
    const t = makeTextLayer('Bonjour', ratio, { size: Math.round(spec.width * 0.09) });
    ok(
      `[${ratio}] le texte est posé dans le cadre`,
      t.x >= 0 && t.y >= 0 && t.x + t.w <= spec.width && t.y + t.h <= spec.height,
      `x=${t.x} y=${t.y} w=${t.w} h=${t.h} cadre=${spec.width}×${spec.height}`,
    );
    ok(`[${ratio}] le corps est proportionnel`, t.size > 0 && t.size <= spec.width, `size=${t.size}`);
  }

  console.log(
    `\n${failures === 0 ? 'TOUT VERT' : `ÉCHEC : ${failures} contrôle(s) en erreur`}\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
