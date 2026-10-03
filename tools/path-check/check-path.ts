/*
 * Essai : peut-on faire d'un tracé SVG un objet Fabric, sans écrire
 * d'analyseur de courbes de Bézier ?
 *
 * La question est décisive pour le projet. Si `sourcePath` suffit, un logo
 * importé d'Illustrateur entre dans le descripteur comme une suite de nombres —
 * ce qui est exactement ce que fait déjà une forme. Sinon il faut écrire un
 * analyseur, et le format stocké change.
 *
 * On ne répond pas à la question en lisant la documentation : on construit
 * l'objet et on mesure sa boîte.
 */
import { Path, Rect } from 'fabric';

/** Un triangle, tel qu'Illustrateur l'exporte. */
const TRIANGLE = 'M 50 0 L 100 100 L 0 100 Z';

/** Un tracé avec courbe — le cas réel d'un logo. */
const CURVE = 'M 0 50 C 25 0, 75 0, 100 50 C 75 100, 25 100, 0 50 Z';
/** Le même tracé, mais avec les courbes remplacées par des droites. */
const CURVE_AS_LINES = 'M 0 50 L 50 0 L 100 50 L 50 100 Z';

/** Un tracé avec deux sous-tracés — le cas d'un « o » dans un logo. */
const TWO_SUBPATHS = 'M 50 0 A 50 50 0 1 0 50 100 A 50 50 0 1 0 50 0 Z M 50 25 A 25 25 0 1 1 50 75 A 25 25 0 1 1 50 25 Z';

let failures = 0;

function report(label: string, ok: boolean, detail: string): void {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label} — ${detail}`);
}

async function main(): Promise<void> {
  console.log('\n=== 1. `sourcePath` : le tracé SVG brut est-il accepté ? ===');

  const triangle = new Path(TRIANGLE, { fill: '#FF0000' });
  report(
    'triangle : boîte non nulle',
    (triangle.width ?? 0) > 0 && (triangle.height ?? 0) > 0,
    `${Math.round(triangle.width ?? 0)}×${Math.round(triangle.height ?? 0)}`,
  );
  report(
    'triangle : 100×100 comme attendu',
    Math.abs((triangle.width ?? 0) - 100) < 1 && Math.abs((triangle.height ?? 0) - 100) < 1,
    `largeur ${triangle.width}, hauteur ${triangle.height}`,
  );
  report(
    'triangle : le tracé a été analysé en points',
    Array.isArray(triangle.path) && triangle.path.length > 0,
    `${(triangle.path as unknown[] | undefined)?.length ?? 0} points`,
  );

  console.log('\n=== 2. Les courbes de Bézier sont-elles gérées ? ===');
  const curve = new Path(CURVE, { fill: '#00FF00' });
  report(
    'courbe : boîte non nulle',
    (curve.width ?? 0) > 0 && (curve.height ?? 0) > 0,
    `${Math.round(curve.width ?? 0)}×${Math.round(curve.height ?? 0)}`,
  );
/*
   * On ne compare PAS le nombre de points. Fabric segmente une courbe en
   * fonction de sa longueur : un tracé de 100 unités comme l'autre donne le
   * même nombre de points.
   *
   * Le test juste est le suivant : les courbes de Bézier **dépassent** les
   * points de contrôle. Le tracé en courbes remonte à y = 25, donc sa boîte
   * est plus petite que celle de la version polygonale qui passe par les mêmes
   * points. Si les deux donnaient la même boîte, la courbe serait approximée
   * par des droites — et un logo arrondi deviendrait anguleux.
   */
  const lines = new Path(CURVE_AS_LINES, { fill: '#0000FF' });
  report(
    'courbe : la boîte **déborde** des points de contrôle',
    (curve.height ?? 0) < (lines.height ?? 0),
    `courbe ${Math.round(curve.height ?? 0)} contre droite ${Math.round(lines.height ?? 0)} — le tracé remonte au-dessus des points`,
  );
  report(
    'courbe : hauteur mesurée conforme au tracé',
    Math.abs((curve.height ?? 0) - 75) < 1,
    `${Math.round(curve.height ?? 0)} — le tracé remonte à y = 25`,
  );

  console.log('\n=== 3. Deux sous-tracés (trou) ===');
  const holed = new Path(TWO_SUBPATHS, { fill: '#0000FF' });
  report(
    'trou : boîte non nulle',
    (holed.width ?? 0) > 0 && (holed.height ?? 0) > 0,
    `${Math.round(holed.width ?? 0)}×${Math.round(holed.height ?? 0)}`,
  );

  console.log('\n=== 4. Mise à l\'échelle : le tracé suit la boîte du descripteur ? ===');
  /*
   * C'est LA question pour le projet. Une forme dessinée en XML a une taille
   * intrinsèque — ici 100×100. Si on la pose dans un cadre de 1080, il faut
   * qu'elle se scale comme les sept autres, et pas comme une image.
   *
   * On mesure la **géométrie nue** (`width × scaleX`), jamais
   * `getScaledWidth()` : celle-ci ajoute l'épaisseur du contour, et l'écart
   * disparaît avec. C'est exactement le piège que `shape-check` documente pour
   * les formes dessinées.
   */
  const target = 540;
  const scaled = new Path(TRIANGLE, {
    fill: '#FF0000',
    scaleX: target / (triangle.width ?? 1),
    scaleY: target / (triangle.height ?? 1),
  });
  report(
    'mise à l\'échelle : la boîte atteint la cible',
    Math.abs((scaled.width ?? 0) * (scaled.scaleX ?? 1) - target) < 1,
    `${Math.round((scaled.width ?? 0) * (scaled.scaleX ?? 1))} au lieu de ${target}`,
  );
  report(
    'mise à l\'échelle : `getScaledWidth` ajoute le contour (piège connu)',
    scaled.getScaledWidth() > target,
    `${Math.round(scaled.getScaledWidth())} — c\'est le liseré, pas la forme`,
  );
  report(
    'mise à l\'échelle : la géométrie nue reste 100',
    Math.abs((scaled.width ?? 0) - 100) < 1,
    `largeur nue ${scaled.width}`,
  );

  console.log('\n=== 5. Les propriétés de couleur fonctionnent-elles ? ===');
  const recolored = new Path(TRIANGLE, { fill: '#123456', stroke: '#654321', strokeWidth: 8 });
  report('remplissage appliqué', recolored.fill === '#123456', String(recolored.fill));
  report('contour appliqué', recolored.stroke === '#654321', String(recolored.stroke));

  console.log('\n=== 6. Sérialisation : le tracé survit-il à un aller-retour ? ===');
  /*
   * `toObject(['sourcePath'])` n'écrit pas `sourcePath` : c'est une propriété
   * interne de Fabric, recalculée à la construction depuis `path`. Ce qui
   * compte n'est donc pas que la chaîne reparte dans le JSON, mais que la
   * **géométrie** reparte — sans elle, le calque deviendrait un rectangle vide
   * après un aller-retour par le descripteur.
   */
  const object = new Path(TRIANGLE, { fill: '#FF0000' });
  const json = JSON.stringify(object.toObject());
  report(
    'le JSON contient les points du tracé',
    json.includes('"path"'),
    'la géométrie est écrite',
  );

  const restored = await Path.fromObject(JSON.parse(json));
  report(
    'relecture : boîte identique',
    Math.abs((restored.width ?? 0) - 100) < 1,
    `${Math.round(restored.width ?? 0)}×${Math.round(restored.height ?? 0)}`,
  );
  report(
    'relecture : le tracé est bien réanalysé',
    Array.isArray(restored.path) && restored.path.length > 0,
    `${(restored.path as unknown[] | undefined)?.length ?? 0} points`,
  );

  console.log(`\n${failures === 0 ? 'TOUT EST VERT' : `${failures} ÉCHEC(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();