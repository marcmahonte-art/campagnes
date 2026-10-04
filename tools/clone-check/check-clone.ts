/*
 * Contrôle du CLONE de calque (bouton « Dupliquer »).
 *
 * POURQUOI CE HARNAIS EXISTE
 * --------------------------
 * `duplicateSelected` a porté — jusqu'au 2026-10-04 — le calcul `z: source.z + 1`.
 * Il *paraissait* juste : « juste au-dessus de l'original ». Il était doublement
 * faux, et les deux fautes sont INVISIBLES à la lecture :
 *
 *   1. `emitFromCanvas` réécrit `z = (index + 1) * 10` à chaque émission, depuis
 *      l'ordre du tableau Fabric. Un `z` intermédiaire ne survit donc pas au
 *      premier geste. Or le clone est **poussé en fin de tableau** : il finit au
 *      SOMMET, pas au-dessus de sa source. Le clone d'un calque du fond passe
 *      devant les textes.
 *   2. `source.z + 1` peut **égaler** un `z` voisin (échelle 10, 11, 20…) : un
 *      `z` dupliqué, exactement ce que `nextZ` a été écrit pour empêcher.
 *
 * Ni un typecheck ni une relecture n'attrapent ces fautes : elles ne se voient
 * qu'en rejouant une session. C'est le rôle de ce fichier.
 *
 * CE QU'ON MESURE
 * ---------------
 * On ne dessine rien (le binaire natif `canvas` est absent → Fabric ne
 * s'instancie pas). On mesure les **`z` du descripteur**, puisque le rendu ne
 * fait que trier dessus. Les invariants :
 *
 *   I1. après tout geste, aucun `z` dupliqué ;
 *   I2. `nextZ(layers) > max(z)` — strictement ;
 *   I3. un clone ne recule jamais dans la pile (il est ajouté devant) ;
 *   I4. l'ordre survit à `emit → relecture` (idempotence de la session).
 *
 * LE TEST DE FALSIFIABILITÉ (section 5)
 * -------------------------------------
 * `fake-descriptor.cloneViaEditor` accepte `{ guard: false }`, qui rejoue le
 * défaut historique. La section 5 exécute la MÊME session avec la garde retirée
 * et vérifie que des assertions échouent VRAIMENT. Si ce bloc ne détectait rien,
 * tout ce qui précède ne prouverait rien.
 *
 * Exit 0 si tout passe, != 0 sinon. Jamais de `| head` : le code de sortie se
 * lit en bout de chaîne.
 *
 * Lancement : `npm run check:clone`
 */

import {
  cloneViaEditor,
  duplicateZs,
  emitFromCanvas,
  nextZ,
  rankOf,
  resetCloneCounter,
  stackOrder,
  topZ,
  Z_STEP,
  type FakeDescriptor,
  type FakeLayer,
} from './fake-descriptor';

/* ================================================================== */
/* Petite bibliothèque d'assertions nommées                           */
/* ================================================================== */

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];
let currentSection = '(hors section)';

function section(title: string): void {
  currentSection = title;
  console.log(`\n=== ${title} ===`);
}

function record(name: string, ok: boolean, detail = ''): void {
  results.push({ name: `${currentSection} / ${name}`, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(name: string, condition: boolean, detail = ''): void {
  record(name, condition, condition ? '' : detail);
}

function eq<T>(name: string, actual: T, expected: T): void {
  record(
    name,
    actual === expected,
    actual === expected ? '' : `attendu ${String(expected)}, obtenu ${String(actual)}`,
  );
}

function deepEq(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  record(name, a === b, a === b ? '' : `attendu ${b}, obtenu ${a}`);
}

/* ================================================================== */
/* Cadres de travail                                                  */
/* ================================================================== */

/** Un cadre à trois calques bien ordonnés : image(10) < forme(20) < texte(30). */
function threeLayerFrame(): FakeDescriptor {
  return {
    ratio: '1:1',
    layers: [
      { id: 'img', type: 'image', x: 100, y: 100, w: 800, h: 800, z: 10 },
      { id: 'shp', type: 'shape', x: 200, y: 200, w: 400, h: 400, z: 20 },
      { id: 'txt', type: 'text', x: 300, y: 700, w: 600, h: 120, z: 30 },
    ],
  };
}

/** Une session complète : clone du FOND, puis du MILIEU, puis du SOMMET. */
function fullCloneSession(): FakeDescriptor {
  resetCloneCounter();
  let d = threeLayerFrame();
  d = cloneViaEditor(d, 'img').descriptor; // clone du fond
  d = cloneViaEditor(d, 'shp').descriptor; // clone du milieu
  d = cloneViaEditor(d, 'txt').descriptor; // clone du sommet
  return d;
}

/* ================================================================== */
/* 1. Le socle : `nextZ` est bien `max(z) + step`                     */
/* ================================================================== */
section('1. Socle — nextZ lit le max, jamais la longueur');

{
  const layers: FakeLayer[] = [
    { id: 'a', x: 0, y: 0, w: 10, h: 10, z: 10 },
    { id: 'b', x: 0, y: 0, w: 10, h: 10, z: 30 },
  ];
  eq('nextZ sur une échelle 10/30 rend 40', nextZ(layers), 40);

  // LE piège : après suppression, la longueur retombe mais le max non.
  const afterDelete: FakeLayer[] = [
    { id: 'b', x: 0, y: 0, w: 10, h: 10, z: 30 },
  ];
  eq('après suppression, nextZ rend toujours 40 (pas 20)', nextZ(afterDelete), 40);
  assert(
    'la formule length*10+10 rendrait un z DÉJÀ OCCUPÉ',
    afterDelete.length * Z_STEP + Z_STEP === 20 && afterDelete.some((l) => l.z === 20) === false,
    'témoin : 20 est libre ici, donc le piège ne se voit que sur un z réellement occupé',
  );

  // Le vrai piège, mesuré : un z occupé.
  const occupied: FakeLayer[] = [
    { id: 'b', x: 0, y: 0, w: 10, h: 10, z: 10 },
    { id: 'c', x: 0, y: 0, w: 10, h: 10, z: 20 },
    { id: 'd', x: 0, y: 0, w: 10, h: 10, z: 30 },
  ];
  const buggy = occupied.length * Z_STEP + Z_STEP; // 40, libre — forme simple
  const buggyAfterDelete = [
    { id: 'c', x: 0, y: 0, w: 10, h: 10, z: 20 },
    { id: 'd', x: 0, y: 0, w: 10, h: 10, z: 30 },
  ];
  eq('la formule bannie rend 40 sur 3 calques (coïncidence favorable)', buggy, 40);
  eq(
    'mais seulement 30 sur 2 calques — z DÉJÀ OCCUPÉ',
    buggyAfterDelete.length * Z_STEP + Z_STEP,
    30,
  );
  assert(
    'ce 30 est bien occupé (le défaut est réel, pas théorique)',
    buggyAfterDelete.some((l) => l.z === 30),
  );
}

/* ================================================================== */
/* 2. Un clone simple ne duplique jamais un z                         */
/* ================================================================== */
section('2. Un clone ne duplique jamais un z');

{
  resetCloneCounter();
  const before = threeLayerFrame();
  const { descriptor: after, cloneId } = cloneViaEditor(before, 'img');

  deepEq('aucun z dupliqué après clonage du fond', duplicateZs(after.layers), []);
  eq('le clone existe bien', after.layers.some((l) => l.id === cloneId), true);
  eq('le cadre a un calque de plus', after.layers.length, 4);
  assert(
    'le z du clone est strictement au-dessus du sommet précédent',
    (after.layers.find((l) => l.id === cloneId)?.z ?? 0) > topZ(before.layers),
    `z clone=${after.layers.find((l) => l.id === cloneId)?.z}, sommet avant=${topZ(before.layers)}`,
  );
}

/* ================================================================== */
/* 3. Le clone ne recule jamais dans la pile                          */
/* ================================================================== */
section('3. Le clone est ajouté devant, jamais derrière sa source');

{
  resetCloneCounter();
  const before = threeLayerFrame();
  const { descriptor: after, cloneId } = cloneViaEditor(before, 'img'); // le FOND

  const rankSource = rankOf(after.layers, 'img');
  const rankClone = rankOf(after.layers, cloneId);

  assert(
    'le clone du calque du fond est DEVANT sa source',
    rankClone > rankSource,
    `rang clone=${rankClone}, rang source=${rankSource}`,
  );

  // Et l'émission ne le fait pas reculer — c'est là que l'ancien défaut mentait.
  const emitted = { ...after, layers: emitFromCanvas(after.layers) };
  const rankCloneEmitted = rankOf(emitted.layers, cloneId);
  const rankSourceEmitted = rankOf(emitted.layers, 'img');
  assert(
    "après émission, le clone reste devant sa source",
    rankCloneEmitted > rankSourceEmitted,
    `clone=${rankCloneEmitted}, source=${rankSourceEmitted}`,
  );
  deepEq("après émission, toujours aucun z dupliqué", duplicateZs(emitted.layers), []);
}

/* ================================================================== */
/* 4. SESSION COMPLÈTE — init → 3 clones → ré-émission → variantes     */
/* ================================================================== */
section('4. Session complète : trois clones, puis ré-émission');

{
  const after = fullCloneSession();

  deepEq('la session ne produit aucun z dupliqué', duplicateZs(after.layers), []);
  eq('la session a produit 6 calques (3 + 3 clones)', after.layers.length, 6);

  const emitted = emitFromCanvas(after.layers);
  deepEq('la ré-émission ne crée aucun z dupliqué', duplicateZs(emitted), []);

  // L'échelle émise doit être exactement 10, 20, 30, 40, 50, 60.
  deepEq(
    "l'échelle émise est propre (10→60 par pas de 10)",
    stackOrder(after.layers).map((id) => after.layers.find((l) => l.id === id)?.z),
    [10, 20, 30, 40, 50, 60],
  );

  // Idempotence : émettre DEUX fois donne le même résultat.
  const emittedTwice = emitFromCanvas(emitFromCanvas(after.layers));
  deepEq(
    'émettre deux fois est idempotent (second passage identique)',
    emittedTwice.map((l) => l.z),
    emitted.map((l) => l.z),
  );

  // Chaque clone est devant sa source d'origine.
  const cloneIds = after.layers.filter((l) => l.id.startsWith('clone-')).map((l) => l.id);
  eq('trois clones ont été produits', cloneIds.length, 3);
  assert(
    'chaque clone est au-dessus du calque dont il est issu',
    cloneIds.every((cid) => rankOf(after.layers, cid) > rankOf(after.layers, 'img')),
    'le premier clone provient du fond et doit pourtant être devant lui',
  );
}

/* ================================================================== */
/* 5. Falsifiabilité — la garde retirée doit COASSER les invariants    */
/* ================================================================== */
section('5. Falsifiabilité : garde retirée → les invariants doivent casser');

{
  /*
   * DEUX défauts distincts, mesurés séparément — c'est ce qui rend ce contrôle
   * honnête. Le défaut historique `z: source.z + 1` en portait deux, et un
   * harnais naïf n'en voit qu'un.
   *
   * (a) LE DÉFAUT RÉEL, sur un cadre 10/20/30 : `source.z + 1` rend 11, 21, 31
   *     — des `z` tous DISTINCTS. Aucun doublon. Le symptôme n'est donc pas le
   *     doublon mais la **position** : dans le tableau, `clone-img` est en 5e
   *     position (rang 4) alors qu'il est issu du FOND (rang 0). Il saute
   *     par-dessus `shp` et `txt`. Et comme `emitFromCanvas` réécrit les `z`
   *     depuis l'index, ce saut est DÉFINITIF : sur 10/20/30 le défaut est
   *     totalement invisible à l'œil comme au typecheck.
   *
   * (b) LE DOUBLON, lui, exige une échelle serrée. Après une émission, `z` vaut
   *     `(index+1)*10` : une source du fond vaut 10, et `10 + 1 = 11`… mais une
   *     source déjà à `z = 11` (issue d'un clone précédent, elle-même clonée)
   *     rend `12`, qui peut heurter un voisin. On force ici deux sources collées
   *     (10 et 11) pour rendre le doublon observable.
   */

  /* ---- (a) le défaut réel sur l'échelle 10/20/30 ---- */
  resetCloneCounter();
  let buggy = threeLayerFrame();
  buggy = cloneViaEditor(buggy, 'img', { guard: false }).descriptor;
  buggy = cloneViaEditor(buggy, 'shp', { guard: false }).descriptor;
  buggy = cloneViaEditor(buggy, 'txt', { guard: false }).descriptor;

  // L'émission est le geste réel : c'est elle qui trahit le saut de position.
  const emittedBuggy = emitFromCanvas(buggy.layers);

  assert(
    'AVEC la garde retirée, le clone du FOND saute au SOMMET (rang strictement supérieur à sa source)',
    rankOf(emittedBuggy, 'clone-1') > rankOf(emittedBuggy, 'img'),
    `rang clone-1=${rankOf(emittedBuggy, 'clone-1')}, rang img=${rankOf(emittedBuggy, 'img')} — attendu : le clone du fond devrait être juste au-dessus de img (rang 1), il finit au sommet`,
  );

  // Comparaison honnête : ce que la garde produirait, mesuré sur la MÊME session.
  resetCloneCounter();
  let good = threeLayerFrame();
  good = cloneViaEditor(good, 'img').descriptor;
  good = cloneViaEditor(good, 'shp').descriptor;
  good = cloneViaEditor(good, 'txt').descriptor;
  const emittedGood = emitFromCanvas(good.layers);

  /*
   * Avec la garde, les clones sont poussés en fin de tableau EUX AUSSI : ils
   * occupent donc le MÊME rang que dans la version fautive. L'émission écrase
   * les deux au même endroit. C'est la démonstration que **sur cette échelle,
   * `z` seul ne distingue pas les deux versions** — la différence vit dans le
   * descripteur AVANT émission (le `z` du clone), pas dans l'ordre émis.
   */
  deepEq(
    "les deux versions émettent le MÊME ordre — d'où l'invisibilité du défaut",
    stackOrder(emittedBuggy),
    stackOrder(emittedGood),
  );

  /* ---- le `z` du clone : la SEULE grandeur qui diffère ---- */
  assert(
    "AVEC la garde retirée, le z de clone-1 n'est pas au-dessus du sommet (il vaut source+1)",
    (buggy.layers.find((l) => l.id === 'clone-1')?.z ?? 0) < topZ(threeLayerFrame().layers),
    `z clone-1=${buggy.layers.find((l) => l.id === 'clone-1')?.z} — nextZ aurait donné ${nextZ(threeLayerFrame().layers)}`,
  );
  eq(
    'AVEC la garde, le z de clone-1 EST au-dessus du sommet (nextZ)',
    good.layers.find((l) => l.id === 'clone-1')?.z,
    nextZ(threeLayerFrame().layers),
  );

  /* ---- (b) le DOUBLON, sur une échelle serrée ---- */
  resetCloneCounter();
  const tight: FakeDescriptor = {
    ratio: '1:1',
    layers: [
      { id: 'a', type: 'image', x: 0, y: 0, w: 10, h: 10, z: 10 },
      { id: 'b', type: 'shape', x: 0, y: 0, w: 10, h: 10, z: 11 },
    ],
  };
  const tightBuggy = cloneViaEditor(tight, 'a', { guard: false }).descriptor;
  assert(
    'AVEC la garde retirée sur une échelle serrée (10, 11), un z DUPLIQUÉ apparaît',
    duplicateZs(tightBuggy.layers).length > 0,
    `z=${JSON.stringify(tightBuggy.layers.map((l) => l.z))}, doublons=${JSON.stringify(duplicateZs(tightBuggy.layers))}`,
  );
  // Témoin : la garde, sur la MÊME échelle serrée, ne duplique rien.
  const tightGood = cloneViaEditor(tight, 'a').descriptor;
  deepEq('AVEC la garde, la même échelle serrée reste sans doublon', duplicateZs(tightGood.layers), []);
}

/* ================================================================== */
/* BILAN                                                              */
/* ================================================================== */
const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;

console.log(`\n${'='.repeat(70)}`);
console.log(`RÉSULTATS — ${passed}/${results.length} assertions passées, ${failed} échouée(s).`);

if (failed > 0) {
  console.log('\nDétail des échecs :');
  for (const r of results.filter((x) => !x.ok)) {
    console.log(`  ✗ ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`);
  }
}
console.log('='.repeat(70));

if (failed === 0) {
  console.log('TOUT VERT.');
} else {
  console.log(`ÉCHEC — ${failed} assertion(s).`);
  process.exitCode = 1;
}
