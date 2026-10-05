/*
 * Contrôle de la GÉOMÉTRIE des calques texte.
 *
 * ## Ce que ce harnais vérifie
 *
 * Un texte est un calque comme les autres : il vit dans le repère du ratio et
 * porte `x`, `y`, `w`, `h`, `rotation`, `size`. Il doit donc survivre à
 * l'aller-retour **descripteur → canvas → descripteur**, qui est ce que fait
 * l'éditeur à chaque geste : il relit le canvas, l'autosave écrit, le
 * rechargement reconstruit les objets.
 *
 * ## Le défaut que ce harnais a été écrit pour attraper
 *
 * Quand on étire un texte par ses poignées, Fabric change `scaleX` / `scaleY` et
 * **ne touche pas** `fontSize`. Or le descripteur ne connaît que `size` : à la
 * reconstruction, le texte rebâlit à son corps d'origine et **revient à sa
 * taille de départ**.
 *
 * Mesuré avant correction : agrandi ×2 → 50 % de la taille après rechargement ;
 * réduit de moitié → 100 %. Et le stockage était bon : c'est l'affichage qui
 * mentait. C'est la faute classique du « le stockage est bon, donc l'affichage
 * est bon ».
 *
 * ## Ce que le repli doit garantir, et pourquoi c'est mesuré
 *
 * 1. la taille choisie **survive** au rechargement (aller-retour) ;
 * 2. elle **ne dérive pas** d'un cycle à l'autre (idempotence) ;
 * 3. le repli soit **invisible** : même emprise avant et après, sinon le texte
 *    sauterait sous le doigt à chaque émission ;
 * 4. un texte **court** ne soit **pas étiré** — le cas inverse, tout aussi réel.
 *    C'est ce contrôle qui a fait abandonner l'autre piste : appliquer `w` à la
 *    reconstruction marche pour une image, mais étirerait chaque mot sur 864 px.
 *
 * ## Témoins
 *
 * Un contrôle qui ne peut pas échouer ne prouve rien. Trois témoins :
 *   - la mesure **voit**-elle une échelle ? (sinon les sections 4-5 ne prouvent rien)
 *   - un calque **image** porte-t-il bien sa boîte ? (sinon l'échec serait général)
 *   - le repli est-il **neutre** sur un texte non redimensionné ? (sinon on aurait
 *     cassé le cas nominal pour réparer le cas extrême)
 *
 * Lancement : `npm run check:text-geometry`
 */
import type { FabricObject } from 'fabric';
import type { IText } from 'fabric';
import { bakeTextScale, createTextObject } from '../../lib/fabric-text';
import { composeDescriptor, participantTextLayer, participantTextWidth } from '../../lib/participant';
import type { ParticipantStyle } from '../../lib/participant';
import type { PhotoZone } from '../../lib/descriptor';
import { makeImageLayer, makeTextLayer, parseDescriptor, serializeDescriptor } from '../../lib/descriptor';
import type { Descriptor, Ratio, TextLayer } from '../../lib/types';

let passed = 0;
let failed = 0;

function ok(label: string, condition: boolean, detail = ''): void {
  if (condition) passed += 1;
  else failed += 1;
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

function eq(label: string, actual: unknown, expected: unknown): void {
  ok(`${label} (attendu ${String(expected)}, obtenu ${String(actual)})`, actual === expected);
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/**
 * Reproduit le geste réel de l'éditeur : construire, transformer, **replier
 * l'échelle dans le corps**, écrire la boîte relue dans le calque, puis
 * reconstruire et vérifier qu'on retombe dessus.
 */
async function allerRetour(
  layer: TextLayer,
  transformer?: (obj: IText) => void,
): Promise<{ attendu: { w: number; h: number }; obtenu: { w: number; h: number }; echecs: string[] }> {
  const echecs: string[] = [];

  // --- Cycle 1 : le geste de l'utilisateur.
  const obj = (await createTextObject(layer, { interactive: true })) as IText;
  if (transformer) transformer(obj);
  const repli = bakeTextScale(obj);

  const relu: TextLayer = {
    ...layer,
    x: Math.round(obj.left ?? 0),
    y: Math.round(obj.top ?? 0),
    w: repli.width,
    h: repli.height,
    size: repli.fontSize,
    rotation: Math.round(obj.angle ?? 0),
  };

  // --- Cycle 2 : la reconstruction (rechargement de la page).
  const rejoue = (await createTextObject(relu, { interactive: true })) as IText;
  const obtenu = {
    w: Math.round(rejoue.getScaledWidth()),
    h: Math.round(rejoue.getScaledHeight()),
  };

  if (obtenu.w !== relu.w) {
    echecs.push(`largeur ${obtenu.w} au lieu de ${relu.w} (écart ${obtenu.w - relu.w} px)`);
  }
  if (obtenu.h !== relu.h) {
    echecs.push(`hauteur ${obtenu.h} au lieu de ${relu.h} (écart ${obtenu.h - relu.h} px)`);
  }

  return { attendu: { w: relu.w, h: relu.h }, obtenu, echecs };
}

async function main(): Promise<void> {
  const RATIO: Ratio = '1:1';
  const IMG_SRC =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const base = makeTextLayer('Bonjour Ouagadougou', RATIO, { id: 'txt', size: 96 });

  section('1. Temoin de la mesure : la lecture voit-elle une echelle ?');
  // Si la mesure ne voit pas une echelle, les sections 4 et 5 ne prouvent rien.
  const temoin = (await createTextObject(base, { interactive: true })) as IText;
  const avant = temoin.getScaledWidth();
  temoin.scale(2);
  const apres = temoin.getScaledWidth();
  ok(
    'une echelle x2 double bien l emprise relevee',
    Math.abs(apres - avant * 2) < 2,
    `${Math.round(avant)} -> ${Math.round(apres)}`,
  );

  section('2. Temoin : un calque image porte bien sa boite (montage sain)');
  // Si l echec d un texte pouvait s expliquer par un probleme general du
  // montage, ce temoin le dirait.
  const imgLayer = makeImageLayer(IMG_SRC, RATIO, { id: 'img', w: 400, h: 300 });
  ok('le calque image du temoin porte bien w/h', imgLayer.w === 400 && imgLayer.h === 300);

  section('3. Un texte NON redimensionne revient a sa taille');
  const neutre = await allerRetour(base);
  ok('aller-retour a l identique : aucune perte', neutre.echecs.length === 0, neutre.echecs.join(' | '));

  section('4. Un texte AGRANDI x2 revient agrandi (le defaut historique)');
  const agrandi = await allerRetour(base, (obj) => obj.scale(2));
  console.log(`    attendu ${JSON.stringify(agrandi.attendu)} | obtenu ${JSON.stringify(agrandi.obtenu)}`);
  ok(
    'le texte agrandi conserve sa largeur apres rechargement',
    agrandi.echecs.length === 0,
    agrandi.echecs.join(' | '),
  );

  section('5. Un texte REDUIT de moitie revient reduit');
  const reduit = await allerRetour(base, (obj) => obj.scale(0.5));
  console.log(`    attendu ${JSON.stringify(reduit.attendu)} | obtenu ${JSON.stringify(reduit.obtenu)}`);
  ok(
    'le texte reduit conserve sa largeur apres rechargement',
    reduit.echecs.length === 0,
    reduit.echecs.join(' | '),
  );

  section('6. Deux cycles de suite ne derivent pas (idempotence)');
  // Un aller-retour qui converge en un cycle mais continue de bouger au suivant
  // est un defaut different : il ne se voit qu a la troisieme ouverture.
  let couche: TextLayer = base;
  const largeurs: number[] = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const obj = (await createTextObject(couche, { interactive: true })) as IText;
    if (cycle === 0) obj.scale(1.8);
    const repli = bakeTextScale(obj);
    largeurs.push(repli.width);
    couche = {
      ...couche,
      x: Math.round(obj.left ?? 0),
      y: Math.round(obj.top ?? 0),
      w: repli.width,
      h: repli.height,
      size: repli.fontSize,
    };
  }
  console.log(`    largeurs successives : ${largeurs.join(' -> ')}`);
  ok('la largeur se stabilise des le 2e cycle', largeurs[1] === largeurs[2], `${largeurs[1]} vs ${largeurs[2]}`);

  section('6bis. Le repli ne fait pas bouger ce que l utilisateur regarde');
  // Sinon le texte sauterait sous le doigt a chaque emission, et l autosave
  // enregistrerait une taille que l ecran ne montre pas.
  //
  // Tolérance : `getScaledWidth()` inclut l' **allowance de trait** de l'objet
  // (1 px par défaut), qui n'est jamais peinte — `stroke` vaut `null` sur un
  // texte. Après repli, l'échelle vaut 1, donc cette allowance cesse d'être
  // multipliée : l'écart résiduel vaut au plus 1 px × facteur, soit moins de
  // 0,1 % d'une emprise de plusieurs centaines de pixels. Mesuré ici : 2738,5 →
  // 2737. C'est une largeur, pas une position : le texte ne bouge pas.
  const avantRepli = (await createTextObject(base, { interactive: true })) as IText;
  avantRepli.scale(2.5);
  const empriseAvant = avantRepli.getScaledWidth();
  const allowance = avantRepli.strokeWidth ?? 0;
  bakeTextScale(avantRepli);
  const empriseApres = avantRepli.getScaledWidth();
  const tolerance = Math.max(2, allowance * (avantRepli.scaleX ?? 1) + 1);
  ok(
    'l emprise reste dans l allowance de trait non peinte',
    Math.abs(empriseApres - empriseAvant) <= tolerance,
    `${empriseAvant.toFixed(1)} -> ${empriseApres.toFixed(1)} (tolérance ${tolerance.toFixed(2)} px)`,
  );
  ok('l echelle est neutralisee apres repli', Math.abs((avantRepli.scaleX ?? 1) - 1) < 1e-6);
  ok(
    'le corps a ete multiplie par le facteur',
    (avantRepli.fontSize ?? 0) > (base.size ?? 96),
    `${base.size} -> ${avantRepli.fontSize}`,
  );

  section('7. Position et rotation survivent au rechargement');
  const deplace = (await createTextObject(base, { interactive: true })) as IText;
  deplace.set({ left: 123, top: 45, angle: 30 });
  deplace.setCoords();
  const repliDeplace = bakeTextScale(deplace);
  const reluDeplace: TextLayer = {
    ...base,
    x: Math.round(deplace.left ?? 0),
    y: Math.round(deplace.top ?? 0),
    rotation: Math.round(deplace.angle ?? 0),
    w: repliDeplace.width,
    h: repliDeplace.height,
  };
  const rejoueDeplace = (await createTextObject(reluDeplace, { interactive: true })) as IText;
  eq('x', Math.round(rejoueDeplace.left ?? 0), 123);
  eq('y', Math.round(rejoueDeplace.top ?? 0), 45);
  eq('rotation', Math.round(rejoueDeplace.angle ?? 0), 30);

  section('8. Un texte COURT n est pas etire sur la largeur du cadre');
  // Le cas inverse, tout aussi reel : appliquer la boite du calque a la
  // reconstruction etait la piste rejetee, car elle etire chaque mot sur 864 px.
  const court = makeTextLayer('Oui', RATIO, { id: 'court', size: 96, w: 800, h: 120 });
  const objCourt = (await createTextObject(court, { interactive: true })) as IText;
  const largeurNaturelle = objCourt.width ?? 0;
  const largeurRelue = objCourt.getScaledWidth();
  console.log(
    `    largeur naturelle ${Math.round(largeurNaturelle)} | relue ${Math.round(largeurRelue)} | w du calque 800`,
  );
  ok(
    'le texte court garde sa largeur naturelle',
    Math.abs(largeurRelue - largeurNaturelle) <= 2,
    `${Math.round(largeurRelue)} vs ${Math.round(largeurNaturelle)}`,
  );

  section('9. L ancrage est celui du descripteur : coin superieur gauche');
  const ancre = (await createTextObject({ ...base, x: 200, y: 150 }, { interactive: true })) as IText;
  eq('x de l objet', Math.round(ancre.left ?? 0), 200);
  eq('y de l objet', Math.round(ancre.top ?? 0), 150);
  ok('originX = left', ancre.originX === 'left', String(ancre.originX));
  ok('originY = top', ancre.originY === 'top', String(ancre.originY));

  section('10. Un texte VIDE ne produit ni echelle infinie ni disparition');
  // Le texte vide est un etat normal : le participant vient d appuyer sur
  // « Ajouter du texte ». Une division par la largeur naturelle (nulle) donnerait
  // une echelle infinie.
  const vide = makeTextLayer('', RATIO, { id: 'vide', size: 96 });
  const objVide = (await createTextObject(vide, { interactive: true })) as IText;
  const repliVide = bakeTextScale(objVide);
  ok('le corps du texte vide reste positif', repliVide.fontSize > 0, String(repliVide.fontSize));
  ok('l echelle du texte vide reste finie', Number.isFinite(objVide.scaleX ?? NaN), String(objVide.scaleX));
  ok('la largeur du texte vide ne devient pas infinie', Number.isFinite(repliVide.width));

  section('11. Serialisation : la geometrie relue est celle qui decide');
  const desc: Descriptor = {
    version: 1,
    ratio: RATIO,
    background: 'transparent',
    layers: [{ ...base, x: 40, y: 60, rotation: 15 }],
    motion: null,
  };
  const round = parseDescriptor(JSON.parse(serializeDescriptor(desc)));
  const coucheLue = round.layers[0] as TextLayer;
  eq('x relu', coucheLue.x, 40);
  eq('y relu', coucheLue.y, 60);
  eq('rotation relue', coucheLue.rotation, 15);
  eq('w relu', coucheLue.w, base.w);
  eq('size relu', coucheLue.size, base.size);

  section('12. Chemin participant : style → descripteur → rendu, sans perte');
  /*
   * Le participant ne passe pas par l'éditeur : son texte va de
   * `ParticipantStyle` au descripteur de composition, puis au même
   * `createTextObject` que tout le monde. Un redimensionnement fait au pinceau
   * doit donc survivre à cette chaîne — c'est elle qui produit le fichier
   * téléchargé, donc c'est elle qui décide de ce que le participant reçoit.
   */
  const zone: PhotoZone = { x: 40, y: 60, w: 840, h: 840 };
  const styleParticipant: ParticipantStyle = {
    filter: 'none',
    text: {
      content: 'Je participe',
      color: '#FFFFFF',
      align: 'left',
      size: 96,
      bold: false,
      italic: false,
      font: 'Inter',
      opacity: 1,
      x: 120,
      y: 200,
      w: 1220,
      h: 120,
    },
  };

  const compose = await composeDescriptor(
    { version: 1, ratio: '1:1', background: 'transparent', layers: [], motion: null },
    { src: IMG_SRC, naturalWidth: 1, naturalHeight: 1 },
    { zoom: 1, x: 0, y: 0 },
    styleParticipant,
  );

  const calqueParticipant = compose.layers.find((l) => l.type === 'text') as TextLayer | undefined;
  ok('le descripteur du participant contient bien un calque texte', Boolean(calqueParticipant));
  if (!calqueParticipant) {
    console.log('\nECHEC : la section 12 n a pas pu etre mesuree (aucun calque texte composé)');
  }
  eq('le corps du participant est conservé', calqueParticipant.size, styleParticipant.text?.size);
  eq('x du participant conservé', calqueParticipant.x, styleParticipant.text?.x);
  eq('y du participant conservé', calqueParticipant.y, styleParticipant.text?.y);
  eq('la boîte mesurée est conservée', calqueParticipant.w, styleParticipant.text?.w);

  const renduParticipant = (await createTextObject(calqueParticipant, { interactive: false })) as IText;
  /*
   * Ce qui doit survivre, c'est le **corps** : pour un texte, la taille est
   * `size`, et `w` n'en est que l'emprise mesurée (c'est `bakeTextScale` qui
   * replie l'échelle dans le corps à l'émission). On vérifie donc que le corps du
   * descripteur est bien celui du rendu — pas que le rendu réadopte la boîte,
   * qu'il n'a pas à connaître.
   */
  eq('le rendu applique le corps du calque', Math.round(renduParticipant.fontSize ?? 0), calqueParticipant.size);
  ok(
    'le rendu a une echelle neutre (aucune echelle fantome)',
    Math.abs((renduParticipant.scaleX ?? 1) - 1) < 1e-6,
    String(renduParticipant.scaleX),
  );

  // Aller-retour complet : le texte du participant tel qu'il est exporté, puis
  // relu comme le ferait un rechargement. L'emprise doit être identique — sinon
  // le participant verrait son texte changer de taille apres telechargement.
  const exporte = bakeTextScale(renduParticipant);
  eq(
    'aller-retour export : corps inchange',
    exporte.fontSize,
    calqueParticipant.size,
  );
  ok(
    'aller-retour export : largeur stable',
    Math.abs(exporte.width - Math.round(renduParticipant.getScaledWidth())) <= 2,
    `${Math.round(renduParticipant.getScaledWidth())} -> ${exporte.width}`,
  );

  section('13. Temoin : la boite du participant vaut la MESURE, pas le budget');
  /*
   * Le bug symétrique : si `w` restait le budget de largeur de la zone, un texte
   * court serait déclare large — et le descripteur.downloadé mentirait sur sa
   * taille. Ici on vérifie qu'un texte sans `w` mesuré retombe sur le budget,
   * et qu'un texte mesuré garde sa mesure.
   */
  const sansMesure = participantTextLayer(
    { content: 'A', color: '#fff', align: 'left', size: 96, bold: false, italic: false, font: 'Inter', opacity: 1 },
    zone,
    '1:1',
  );
  eq('sans mesure, w retombe sur le budget', sansMesure.w, participantTextWidth(zone));

  const avecMesure = participantTextLayer(
    {
      content: 'A', color: '#fff', align: 'left', size: 96, bold: false, italic: false,
      font: 'Inter', opacity: 1, w: 173, h: 120,
    },
    zone,
    '1:1',
  );
  eq('avec mesure, la mesure gagne', avecMesure.w, 173);

  console.log(
    `\n${failed === 0 ? 'TOUT VERT' : `ECHEC : ${failed} controle(s)`} — ${passed} reussis / ${failed} echoues\n`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
}

void main();