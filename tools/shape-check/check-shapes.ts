/*
 * Contrôle de la géométrie des formes.
 *
 * Pourquoi ce harnais existe : Fabric mesure l'emprise d'un objet **contour
 * compris** (`getScaledWidth()` = largeur + épaisseur du trait). Sur une forme,
 * lire cette valeur pour écrire le descripteur ferait grossir le calque à
 * chaque aller-retour éditeur → autosave → reconstruction. Le piège est
 * invisible à l'œil et silencieux : il ne se voit qu'au bout de quelques
 * manipulations, quand la forme a doublé de taille.
 *
 * On vérifie donc, en exécutant réellement Fabric :
 *   — la boîte de chaque forme correspond exactement au descripteur ;
 *   — la géométrie nue est stable sur plusieurs cycles, et la lecture fautive
 *     grossit bien (les deux sont mesurées, pour que le jour où Fabric change
 *     de comportement, ce soit le contrôle qui le dise et pas l'utilisateur) ;
 *   — l'aller-retour complet du descripteur, bornes et tolérance comprises.
 *
 * Lancement : `npm run check:shapes`
 */
import type { FabricObject } from 'fabric';
import { createShapeObject, strokeWidthPx, applyShapePaint } from '../../lib/fabric-shape';
import { SHAPES } from '../../lib/shapes';
import {
  makeShapeLayer,
  makeTextLayer,
  parseDescriptor,
  serializeDescriptor,
  validateDescriptor,
} from '../../lib/descriptor';
import { ratioSpec } from '../../lib/ratios';
import { TEMPLATES, applyTemplate } from '../../lib/templates';
import type { Ratio, ShapeLayer } from '../../lib/types';

let failures = 0;

function check(label: string, actual: number, expected: number, tolerance = 0.51): void {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label} : attendu ${expected}, obtenu ${actual}`);
}

function checkEqual(label: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label} : attendu ${String(expected)}, obtenu ${String(actual)}`);
}

function checkTrue(label: string, value: boolean): void {
  if (!value) failures += 1;
  console.log(`  ${value ? 'ok  ' : 'FAIL'} ${label}`);
}

const RATIO: Ratio = '1:1';
const BOX = { x: 100, y: 200, w: 300, h: 240 };

function layer(kind: ShapeLayer['kind'], extra: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    id: 's1',
    type: 'shape',
    kind,
    fill: '#FF0000',
    stroke: 'transparent',
    strokeWidth: 0,
    radius: kind === 'rounded' ? 0.2 : 0,
    rotation: 0,
    z: 10,
    opacity: 1,
    ...BOX,
    ...extra,
  };
}

async function main(): Promise<void> {
  console.log('\n=== 1. Géométrie — la boîte du descripteur doit être respectée ===');
  for (const spec of SHAPES) {
    const obj: FabricObject = await createShapeObject(layer(spec.value), RATIO);
    console.log(`\n[${spec.value}] (${obj.constructor.name})`);
    check('left', obj.left as number, BOX.x);
    check('top', obj.top as number, BOX.y);
    check('width (géométrie nue)', obj.width as number, BOX.w);
    check('height (géométrie nue)', obj.height as number, BOX.h);
    check('angle', obj.angle as number, 0);

    const points = (obj as unknown as { points?: Array<{ x: number; y: number }> }).points;
    if (points) {
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      check('points x min', Math.min(...xs), 0);
      check('points x max', Math.max(...xs), BOX.w);
      check('points y min', Math.min(...ys), 0);
      check('points y max', Math.max(...ys), BOX.h);
      const expectedPoints =
        spec.value === 'star' ? 10 : spec.value === 'diamond' ? 4 : 3;
      checkEqual('nombre de points', points.length, expectedPoints);
    }
  }

  console.log('\n=== 2. Rotation : `left`/`top` désignent toujours le coin haut-gauche ===');
  for (const spec of SHAPES) {
    const obj = await createShapeObject(layer(spec.value, { rotation: 45 }), RATIO);
    check(`[${spec.value}] left`, obj.left as number, BOX.x);
    check(`[${spec.value}] top`, obj.top as number, BOX.y);
    check(`[${spec.value}] angle`, obj.angle as number, 45);
  }

  console.log('\n=== 3. Contour : épaisseur rapportée au cadre, boîte inchangée ===');
  check('strokeWidthPx(0.025) sur 1080×1080', strokeWidthPx(0.025, '1:1'), 27);
  check('strokeWidthPx(0.025) sur 1920×1080', strokeWidthPx(0.025, '16:9'), 27);
  check('strokeWidthPx(0.06) sur 1080×1920', strokeWidthPx(0.06, '9:16'), 65);
  check('strokeWidthPx(0)', strokeWidthPx(0, '1:1'), 0);

  for (const spec of SHAPES) {
    const plain = layer(spec.value);
    const stroked = layer(spec.value, { stroke: '#000000', strokeWidth: 0.025 });
    const a = await createShapeObject(plain, RATIO);
    const b = await createShapeObject(stroked, RATIO);
    // `width` reste la géométrie : c'est ce que lit l'émission du descripteur.
    check(`[${spec.value}] width nue inchangée par le contour`, b.width as number, a.width as number);
    // `getScaledWidth()` ajoute le contour : c'est précisément ce qu'il ne faut
    // PAS lire pour une forme. On documente l'écart.
    const scaled = b.getScaledWidth();
    const expected = BOX.w + 27;
    check(`[${spec.value}] getScaledWidth() = boîte + contour`, scaled, expected, 1.1);
    checkTrue(
      `[${spec.value}] la géométrie nue (${b.width}) est bien plus petite que getScaledWidth() (${scaled})`,
      (b.width as number) < scaled,
    );
  }

  console.log('\n=== 4. Aller-retour du descripteur ===');
  for (const spec of SHAPES) {
    const original = makeShapeLayer(spec.value, RATIO, {
      x: 42,
      y: 84,
      w: 210,
      h: 210,
      stroke: '#123456',
      strokeWidth: 0.025,
    });
    const json = serializeDescriptor({
      version: 1,
      ratio: RATIO,
      background: 'transparent',
      layers: [original],
      motion: null,
    });
    const back = parseDescriptor(JSON.parse(json));
    const out = back.layers[0] as ShapeLayer;
    console.log(`\n[${spec.value}]`);
    checkEqual('type', out.type, 'shape');
    checkEqual('kind', out.kind, spec.value);
    checkEqual('fill', out.fill, original.fill);
    checkEqual('stroke', out.stroke, '#123456');
    check('strokeWidth', out.strokeWidth, 0.025, 0.0001);
    check('radius', out.radius, original.radius, 0.0001);
    check('x', out.x, 42);
    check('y', out.y, 84);
    check('w', out.w, 210);
    check('h', out.h, 210);
    const validation = validateDescriptor(back);
    checkTrue('descripteur valide', validation.ok);
    checkTrue('aucun avertissement', validation.warnings.length === 0);
  }

  console.log('\n=== 5. Sérialisation minimale (une forme au repos) ===');
  const bare = makeShapeLayer('rect', RATIO);
  const bareJson = JSON.parse(
    serializeDescriptor({
      version: 1,
      ratio: RATIO,
      background: 'transparent',
      layers: [bare],
      motion: null,
    }),
  ).layers[0];
  checkTrue('pas de `stroke` au repos', !('stroke' in bareJson));
  checkTrue('pas de `strokeWidth` au repos', !('strokeWidth' in bareJson));
  checkTrue('pas de `radius` sur un rectangle', !('radius' in bareJson));
  checkTrue('`kind` toujours écrit', 'kind' in bareJson);
  checkTrue('`fill` toujours écrit', 'fill' in bareJson);

  console.log('\n=== 6. Tolérance de lecture ===');
  const broken = parseDescriptor({
    version: 1,
    ratio: '1:1',
    layers: [
      { id: 'a', type: 'shape', kind: 'hexagone', x: 0, y: 0, w: 10, h: 10 },
      { id: 'b', type: 'shape', kind: 'star', x: 0, y: 0, w: 10, h: 10, strokeWidth: 99, radius: 9 },
    ],
  });
  checkEqual('forme inconnue → rectangle', (broken.layers[0] as ShapeLayer).kind, 'rect');
  checkEqual('épaisseur hors bornes ramenée', (broken.layers[1] as ShapeLayer).strokeWidth, 0.15);
  checkEqual('arrondi ignoré sur une étoile', (broken.layers[1] as ShapeLayer).radius, 0);

  console.log('\n=== 7. Zone photo : une forme peut délimiter la fenêtre ===');
  const zone = parseDescriptor({
    version: 1,
    ratio: '1:1',
    background: 'transparent',
    photo_anchor: 's1',
    layers: [layer('circle', { x: 40, y: 60, w: 200, h: 200 })],
  });
  const zoneValidation = validateDescriptor(zone);
  checkTrue('descripteur valide avec une forme en zone photo', zoneValidation.ok);
  checkEqual('un avertissement, pas une erreur', zoneValidation.warnings.length, 1);
  checkTrue(
    'l’avertissement dit que la fenêtre est rectangulaire',
    zoneValidation.warnings[0].includes('emprise rectangulaire'),
  );

  // Un rectangle posé en zone ne doit rien signaler : sa fenêtre lui est fidèle.
  const boxZone = validateDescriptor(
    parseDescriptor({
      version: 1,
      ratio: '1:1',
      background: 'transparent',
      photo_anchor: 's1',
      layers: [layer('rect', { x: 40, y: 60, w: 200, h: 200 })],
    }),
  );
  checkTrue('aucun avertissement pour un rectangle', boxZone.warnings.length === 0);

  console.log('\n=== 8. Stabilité sur cycles émission → reconstruction ===');
  /*
   * Le piège : `getScaledWidth()` ajoute le contour. Si l'émission lisait cette
   * valeur, la boîte du descripteur grossirait à chaque aller-retour. On
   * reproduit ici trois cycles complets pour les deux lectures.
   */
  for (const spec of SHAPES) {
    let good = layer(spec.value, { stroke: '#000000', strokeWidth: 0.025 });
    let bad = layer(spec.value, { stroke: '#000000', strokeWidth: 0.025 });
    const badSizes: number[] = [];

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const a = await createShapeObject(good, RATIO);
      good = {
        ...good,
        w: Math.round((a.width as number) * (a.scaleX as number)),
        h: Math.round((a.height as number) * (a.scaleY as number)),
      };

      const b = await createShapeObject(bad, RATIO);
      badSizes.push(Math.round(b.getScaledWidth()));
      bad = {
        ...bad,
        w: Math.round(b.getScaledWidth()),
        h: Math.round(b.getScaledHeight()),
      };
    }

    check(`[${spec.value}] géométrie nue : largeur stable`, good.w, BOX.w);
    check(`[${spec.value}] géométrie nue : hauteur stable`, good.h, BOX.h);
    checkTrue(
      `[${spec.value}] la lecture fautive grossit bien (${badSizes.join(' → ')})`,
      badSizes[2] > badSizes[0],
    );
  }

  console.log('\n=== 9. `applyShapePaint` — régler sans reconstruire ===');
  const painted = await createShapeObject(layer('rounded'), RATIO);
  applyShapePaint(
    painted,
    layer('rounded', { fill: '#00FF00', stroke: '#0000FF', strokeWidth: 0.06, radius: 0.4 }),
    RATIO,
  );
  checkEqual('fill appliqué', painted.fill, '#00FF00');
  checkEqual('stroke appliqué', painted.stroke, '#0000FF');
  check('strokeWidth appliqué (px)', painted.strokeWidth as number, 65);
  const rx = (painted as unknown as { rx: number }).rx;
  check('arrondi = 0.4 × petite dimension', rx, 96);
  check('géométrie intacte', painted.width as number, BOX.w);

  // Un cercle ne doit jamais recevoir d'arrondi : `Ellipse` porte déjà `rx`,
  // qui est son rayon. Il doit rester intact, et surtout ne pas devenir la
  // valeur d'arrondi (0.4 × 240 = 96).
  const circlePainted = await createShapeObject(layer('circle'), RATIO);
  applyShapePaint(circlePainted, layer('circle', { radius: 0.4 }), RATIO);
  const circleRx = (circlePainted as unknown as { rx: number }).rx;
  check('rayon du cercle intact', circleRx, BOX.w / 2);
  checkTrue('le rayon du cercle n’a pas pris la valeur d’arrondi', Math.abs(circleRx - 96) > 1);

  console.log('\n=== 10. Visibilité et verrou — l aller-retour complet ===');
  /*
   * Ces deux réglages sont les plus facile à perdre en silence : ils ne se
   * relisent pas sur l'objet Fabric comme la géométrie, mais sur le descripteur.
   * Un champ oublié ici se traduit par « mon calque masqué est réapparu après
   * que j'aie déplacé une autre forme » — le pire genre de bug, parce qu'il n'a
   * rien à voir avec l'action que l'utilisateur vient de faire.
   */
  const flagged = parseDescriptor({
    version: 1,
    ratio: '1:1',
    background: 'transparent',
    layers: [
      layer('star', { id: 'hidden-one', visible: false }),
      layer('rounded', { id: 'locked-one', locked: true, radius: 0.3 }),
      layer('rect', { id: 'plain-one' }),
    ],
  });
  checkEqual('un calque masqué se relit masqué', flagged.layers[0].visible, false);
  checkEqual('un calque verrouillé se relit verrouillé', flagged.layers[1].locked, true);
  checkEqual('un calque ordinaire ne naît pas visible:false', flagged.layers[2].visible, undefined);
  checkEqual('un calque ordinaire ne naît pas verrouillé', flagged.layers[2].locked, undefined);

  // Aller-retour par la sérialisation : c'est ce que l'autosave écrit en base.
  const roundTripped = parseDescriptor(JSON.parse(serializeDescriptor(flagged)));
  checkEqual('le masque survit à la sérialisation', roundTripped.layers[0].visible, false);
  checkEqual('le verrou survit à la sérialisation', roundTripped.layers[1].locked, true);
  // Un calque ordinaire ne doit pas porter de drapeau : seul le calque masqué
  // porte `visible`, seul le calque verrouillé porte `locked`.
  const plain = parseDescriptor({
    version: 1,
    ratio: '1:1',
    background: 'transparent',
    layers: [layer('rect', { id: 'plain-only' })],
  });
  const plainJson = serializeDescriptor(plain);
  checkTrue('un calque ordinaire ne sérialise aucun drapeau', !plainJson.includes('visible'));
  checkTrue('un calque ordinaire ne sérialise aucun verrou', !plainJson.includes('locked'));

  /*
   * `createShapeObject` ne connaît pas la visibilité : c'est l'appelant qui la
   * pose sur l'objet. On vérifie donc la géométrie, qui doit rester juste pour
   * un calque masqué — un calque invisible qu'on ne peut pas reprendre se
   * retrouve à la mauvaise place dès qu'on le réaffiche.
   */
  const hiddenObject = await createShapeObject(flagged.layers[0] as ShapeLayer, RATIO);
  check('la forme masquée garde sa largeur', hiddenObject.width as number, BOX.w);
  check('la forme masquée garde sa position', hiddenObject.left as number, BOX.x);

  console.log('\n=== 11. Un modèle ne change pas le format de la campagne ===');
  const verticalCampaign = parseDescriptor({
    version: 1,
    ratio: '9:16',
    background: 'transparent',
    layers: [makeTextLayer('Mon message', '1:1')],
  });
  const squareTemplate = TEMPLATES.find((tpl) => tpl.ratio === '1:1');
  const applied = applyTemplate(verticalCampaign, squareTemplate!, true);

  checkEqual('le ratio de la campagne est conservé', applied.ratio, '9:16');
  checkEqual('le décor de la campagne est conservé', applied.background, 'transparent');
  checkTrue(
    'le texte du créateur est reconduit',
    applied.layers.some((l) => l.type === 'text' && l.text === 'Mon message'),
  );

  /*
   * Tout doit tenir dans le cadre. C'est LA vérification qui compte pour un
   * modèle mis à l'échelle : un titre à 9:16 reconduit en 1:1 déborde
   * immédiatement, et le créateur ne verrait qu'un texte coupé en deux.
   */
  const spec = ratioSpec(applied.ratio);
  const overflowing = applied.layers.filter(
    (l) => l.x < 0 || l.y < 0 || l.x + l.w > spec.width || l.y + l.h > spec.height,
  );
  checkEqual(
    `aucun calque ne déborde du cadre ${spec.width}×${spec.height}`,
    overflowing.length,
    0,
  );

  // Tous les modèles, sur tous les formats : la garantie doit être générale.
  let allFit = true;
  for (const tpl of TEMPLATES) {
    for (const ratio of ['1:1', '16:9', '9:16'] as Ratio[]) {
      const campaign = parseDescriptor({
        version: 1,
        ratio,
        background: 'transparent',
        layers: [],
      });
      const result = applyTemplate(campaign, tpl, false);
      const s = ratioSpec(result.ratio);
      const bad = result.layers.some(
        (l) => l.x < 0 || l.y < 0 || l.x + l.w > s.width || l.y + l.h > s.height,
      );
      if (bad) {
        allFit = false;
        console.log(`       ${tpl.id} (${tpl.ratio} → ${ratio}) déborde`);
      }
    }
  }
  checkTrue('tous les modèles tiennent dans tous les formats', allFit);

  // Un modèle fourni doit être valide avant d'être proposé à l'utilisateur.
  let allValid = true;
  for (const tpl of TEMPLATES) {
    const result = validateDescriptor(parseDescriptor(tpl.descriptor));
    if (!result.ok || result.warnings.length > 0) {
      allValid = false;
      console.log(`       ${tpl.id} : ${result.errors.join(', ')} ${result.warnings.join(', ')}`);
    }
  }
  checkTrue('tous les modèles sont valides, sans avertissement', allValid);

  // La zone photo d'un modèle doit exister, sinon le cadre reste en mode Fond
  // sur une zone absente : le participant ne verrait pas sa photo.
  let anchorsResolve = true;
  for (const tpl of TEMPLATES) {
    const anchor = tpl.descriptor.photo_anchor;
    if (anchor && !tpl.descriptor.layers.some((l) => l.id === anchor)) anchorsResolve = false;
  }
  checkTrue('la zone photo de chaque modèle désigne un calque existant', anchorsResolve);

  console.log(`\n${failures === 0 ? 'TOUT EST VERT' : `${failures} ÉCHEC(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
