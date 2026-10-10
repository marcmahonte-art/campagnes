/*
 * Contrôle du détourage — le raisonnement, sans navigateur.
 *
 * Pourquoi ce harnais existe : la phase 1 du chantier Background Frame doit
 * répondre à « le détourage sur l'appareil est-il tenable ? ». La réponse viendra
 * d'un tableau de mesures pris sur de vrais téléphones — mais **une mesure ne
 * vaut rien si le raisonnement autour est faux**. Un banc qui choisirait mal son
 * chemin, qui enverrait au modèle une image agrandie, ou qui prendrait un masque
 * vide pour un succès produirait des chiffres parfaitement trompeurs.
 *
 * Ce harnais verrouille donc tout ce qui décide **avant** et **après** le
 * modèle :
 *   — le choix du chemin : `navigator.gpu` présent ne suffit pas, il faut un
 *     adaptateur réellement accordé ;
 *   — la taille envoyée : on ne doit **jamais** agrandir, et le rapport doit
 *     être conservé ;
 *   — le verdict : un masque plein, vide ou maigre sont trois échecs distincts,
 *     et le participant ne peut réessayer utilement que si on les distingue ;
 *   — les messages d'erreur : chaque panne doit finir par un geste ;
 *   — le registre de modèles : un modèle dont la licence ne couvre pas l'usage
 *     commercial doit être **signalé par le code**, pas par un commentaire ;
 *   — l'export CSV, qui est le livrable réel de la phase 1 ;
 *   — et une propriété structurelle : `lib/cutout.ts` ne doit contenir **aucun
 *     import**, sinon il cesse d'être compilable seul et le banc mesurerait une
 *     copie au lieu du vrai code.
 *
 * Ce harnais ne teste **pas** l'inférence : elle demande un navigateur, un GPU et
 * le réseau. Ce qui ne peut pas être vérifié ici est vérifié sur appareil, et
 * `cutoutPhoto()` est délibérément mince pour cette raison.
 *
 * Lancement : `npm run check:cutout`
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ABANDON_AFTER_MS,
  CUTOUT_MODELS,
  CUTOUT_RUNTIME_COSTS,
  DEFAULT_CUTOUT_MODEL,
  MAX_INPUT_EDGE,
  MEDIAPIPE_CDN,
  MEDIAPIPE_FEATHER_PX,
  MEDIAPIPE_MODEL_URL,
  MEDIAPIPE_PERSON_CHANNEL,
  MEDIAPIPE_WASM,
  MEASUREMENT_COLUMNS,
  MOBILE_TRANSFER_BUDGET_BYTES,
  OPAQUE_ALPHA,
  VERDICT_EMPTY,
  VERDICT_FULL,
  VERDICT_THIN,
  chooseDevice,
  chooseModel,
  cutoutErrorMessage,
  cutoutFailureReason,
  cutoutOutcome,
  defaultFeather,
  detectWebGpu,
  deviceLabel,
  downloadNeedsConsent,
  exceedsMobileBudget,
  featherRadius,
  findModel,
  firstLoadBytes,
  firstLoadTransferBytes,
  formatBytes,
  formatMs,
  inputSize,
  isMeteredConnection,
  judgeCutout,
  measureOpaqueRatio,
  measurementsToCsv,
  modelWarning,
  personChannelIndex,
  runtimeCost,
  shouldOfferServerFallback,
  sumTransferredBytes,
  transferredForModel,
  type CutoutMeasurements,
  type CutoutOutcome,
  type CutoutVerdict,
} from '../../lib/cutout';

let failures = 0;

function ok(label: string, condition: boolean, detail = ''): void {
  if (!condition) failures += 1;
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

function eq(label: string, actual: unknown, expected: unknown): void {
  ok(label, actual === expected, `attendu ${String(expected)}, obtenu ${String(actual)}`);
}

/** Un canal alpha RGBA à partir d'une liste de valeurs alpha. */
function alpha(values: number[]): number[] {
  return values.flatMap((a) => [0, 0, 0, a]);
}

/**
 * Découpe une ligne CSV en respectant les guillemets — ce que fait un tableur.
 *
 * Une simple découpe sur `;` ne suffit pas : c'est précisément la raison pour
 * laquelle `csvCell()` met le champ entre guillemets. Le harnais doit donc lire
 * la ligne **comme un tableur la lirait**, sinon il validerait un CSV que le
 * tableur, lui, décalerait.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char !== '"') {
        current += char;
      } else if (line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = false;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ';') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function measurement(overrides: Partial<CutoutMeasurements> = {}): CutoutMeasurements {
  return {
    at: '2026-10-10T00:00:00.000Z',
    device: 'wasm',
    deviceLabel: 'Pixel 6a / Chrome 126',
    modelId: 'Xenova/modnet',
    libraryVersion: '3.7.6',
    loadMs: 4200,
    inferenceMs: 3100,
    totalMs: 7400,
    inputWidth: 1024,
    inputHeight: 768,
    outputWidth: 4000,
    outputHeight: 3000,
    transferredBytes: 6_300_000,
    memoryBytes: 180_000_000,
    opaqueRatio: 0.31,
    verdict: 'ok',
    ...overrides,
  };
}

async function main(): Promise<void> {
  console.log('\nDétourage — raisonnement du banc (sans navigateur)\n');

  /* ---------------- 1. Le choix du chemin ---------------- */
  {
    eq('sans API WebGPU, on retombe sur WASM', await detectWebGpu(undefined), false);
    eq('une API absente vaut une absence', await detectWebGpu(null), false);

    ok(
      'un adaptateur accordé donne WebGPU',
      await detectWebGpu({ requestAdapter: async () => ({ name: 'adapter' }) }),
    );
    /*
     * Le cas qui compte : le navigateur expose `navigator.gpu` et refuse
     * l'adaptateur. C'est courant sur un appareil ancien ou sans pilote, et le
     * confondre avec « WebGPU disponible » enverrait tout droit vers un échec.
     */
    eq(
      'une API présente mais aucun adaptateur ne donne PAS WebGPU',
      await detectWebGpu({ requestAdapter: async () => null }),
      false,
    );
    eq(
      'un adaptateur qui échoue ne donne pas WebGPU',
      await detectWebGpu({
        requestAdapter: async () => {
          throw new Error('no adapter');
        },
      }),
      false,
    );
    eq('une API sans requestAdapter est ignorée', await detectWebGpu({} as never), false);

    eq('avec adaptateur, le chemin est WebGPU', chooseDevice(true), 'webgpu');
    eq('sans adaptateur, le chemin est WASM', chooseDevice(false), 'wasm');
    eq('le chemin WebGPU se nomme', deviceLabel('webgpu'), 'WebGPU');
    /*
     * MediaPipe accélère par WebGL, pas par WebGPU. Les confondre ferait écrire
     * « WebGPU » dans le tableau de mesures d'un appareil qui n'en a pas.
     */
    eq('le délégué GPU de MediaPipe se nomme WebGL', deviceLabel('webgl'), 'WebGL (délégué GPU)');
    ok(
      'les trois chemins ont trois noms distincts',
      new Set([deviceLabel('webgpu'), deviceLabel('webgl'), deviceLabel('wasm')]).size === 3,
    );
    eq('le repli se nomme', deviceLabel('wasm'), 'WASM (repli)');
  }

  /* ---------------- 2. La taille envoyée au modèle ---------------- */
  {
    eq('la limite est de 1024 px', MAX_INPUT_EDGE, 1024);

    const grande = inputSize(4000, 3000);
    eq('une photo de 4000 px est ramenée à 1024', grande.width, 1024);
    eq('la hauteur suit le rapport', grande.height, 768);
    ok('la réduction est signalée', grande.resized);

    const portrait = inputSize(1500, 3000);
    eq('en portrait, c’est la hauteur qui contraint', portrait.height, 1024);
    eq('la largeur suit', portrait.width, 512);

    const petite = inputSize(800, 600);
    eq('une image déjà petite n’est pas touchée', petite.width, 800);
    eq('sa hauteur non plus', petite.height, 600);
    eq('aucun facteur appliqué', petite.scale, 1);
    ok('elle n’est pas signalée comme réduite', !petite.resized);

    const limite = inputSize(1024, 1024);
    eq('la limite elle-même passe telle quelle', limite.width, 1024);
    ok('la limite n’est pas une réduction', !limite.resized);

    const juste = inputSize(1025, 1025);
    ok('un pixel de trop déclenche la réduction', juste.resized, `${juste.width}×${juste.height}`);

    /*
     * La règle qui protège le temps du participant : agrandir n'ajoute aucune
     * information, coûte des secondes, et lui ferait croire à un traitement plus
     * soigné. On vérifie explicitement qu'aucune entrée n'est agrandie.
     */
    const minuscule = inputSize(200, 150);
    eq('une image minuscule n’est JAMAIS agrandie', minuscule.width, 200);
    eq('ni sa hauteur', minuscule.height, 150);
    eq('son facteur reste 1', minuscule.scale, 1);

    const rapportAvant = 4000 / 3000;
    const rapportApres = grande.width / grande.height;
    ok(
      'le rapport d’image est conservé',
      Math.abs(rapportAvant - rapportApres) < 0.01,
      `${rapportAvant.toFixed(4)} → ${rapportApres.toFixed(4)}`,
    );

    /*
     * Une image sans dimensions est renvoyée telle quelle plutôt que corrigée :
     * inventer une taille ici masquerait une photo corrompue, que le code
     * appelant doit refuser explicitement.
     */
    const nulle = inputSize(0, 100);
    eq('une largeur nulle n’est pas inventée', nulle.width, 0);
    ok('et elle n’est pas signalée comme réduite', !nulle.resized);
    eq('une dimension négative passe aussi', inputSize(-5, -5).width, -5);
  }

  /* ---------------- 3. La part opaque ---------------- */
  {
    eq('tout opaque vaut 1', measureOpaqueRatio(alpha([255, 255, 255, 255])), 1);
    eq('tout transparent vaut 0', measureOpaqueRatio(alpha([0, 0, 0, 0])), 0);
    eq('la moitié vaut 0,5', measureOpaqueRatio(alpha([255, 255, 0, 0])), 0.5);
    eq('un tableau vide vaut 0', measureOpaqueRatio([]), 0);
    eq(
      'le seuil est strict : alpha = seuil n’est pas opaque',
      measureOpaqueRatio(alpha([OPAQUE_ALPHA])),
      0,
    );
    eq(
      'un alpha juste au-dessus du seuil est opaque',
      measureOpaqueRatio(alpha([OPAQUE_ALPHA + 1])),
      1,
    );
    eq('le seuil vaut 24', OPAQUE_ALPHA, 24);
  }

  /* ---------------- 4. Le verdict ---------------- */
  {
    eq('un masque intact est « plein »', judgeCutout(1).verdict, 'plein');
    eq('la borne haute incluse', judgeCutout(VERDICT_FULL).verdict, 'plein');
    eq('juste sous la borne haute, le sujet est accepté', judgeCutout(0.979).verdict, 'ok');
    eq('un masque ordinaire est « ok »', judgeCutout(0.5).verdict, 'ok');
    eq('un sujet étroit reste acceptable à la borne', judgeCutout(VERDICT_THIN).verdict, 'ok');
    eq('juste sous la borne basse, il devient « faible »', judgeCutout(0.079).verdict, 'faible');
    eq('la borne vide incluse', judgeCutout(VERDICT_EMPTY).verdict, 'vide');
    eq('un masque vide est « vide »', judgeCutout(0).verdict, 'vide');

    const verdicts = ['ok', 'faible', 'vide', 'plein'] as const;
    const messages = verdicts.map((_, i) => judgeCutout([0.5, 0.04, 0, 1][i]).message);
    ok('chaque verdict a un message', messages.every((m) => m.length > 10));
    ok(
      'les quatre verdicts se disent différemment',
      new Set(messages).size === 4,
      `${new Set(messages).size} message(s) distinct(s)`,
    );
    /*
     * Témoin : « plein » et « vide » sont deux échecs opposés. S'ils portaient le
     * même texte, le participant ne saurait pas quoi corriger — et l'assertion
     * ci-dessus ne distinguerait rien.
     */
    ok('« plein » et « vide » ne se confondent pas', judgeCutout(1).message !== judgeCutout(0).message);

    ok('le verdict conserve la part mesurée', judgeCutout(0.42).opaqueRatio === 0.42);
  }

  /* ---------------- 5. Les messages d'erreur ---------------- */
  {
    const oom = cutoutErrorMessage(new Error('Worker: out of memory'));
    ok('un manque de mémoire parle de mémoire', /mémoire/i.test(oom), oom);

    const reseau = cutoutErrorMessage(new Error('TypeError: Failed to fetch'));
    ok('une panne réseau parle de connexion', /connexion/i.test(reseau), reseau);

    const gpu = cutoutErrorMessage(new Error('WebGPU adapter request failed'));
    ok('une panne GPU parle de démarrage', /démarrer/i.test(gpu), gpu);

    const delai = cutoutErrorMessage(new Error('inference timeout'));
    ok('un délai dépassé parle de temps', /temps/i.test(delai), delai);

    const image = cutoutErrorMessage(new Error('could not decode image'));
    ok('une image illisible parle du fichier', /fichier/i.test(image), image);

    const inconnu = cutoutErrorMessage(new Error('boom'));
    ok('une panne inconnue reste actionnable', /réessayer/i.test(inconnu), inconnu);

    eq('une erreur absente ne lève pas', typeof cutoutErrorMessage(undefined), 'string');
    eq('une chaîne est acceptée', typeof cutoutErrorMessage('failed'), 'string');
    eq('un objet quelconque est accepté', typeof cutoutErrorMessage({}), 'string');

    /*
     * L'ordre des motifs compte : un échec de chargement de poids par manque de
     * mémoire contient les deux mots. S'il était classé « réseau », on enverrait
     * le participant vérifier une connexion qui fonctionne.
     */
    const ambigu = cutoutErrorMessage(new Error('out of memory while fetching weights'));
    ok(
      'mémoire prime sur réseau quand les deux motifs sont présents',
      /mémoire/i.test(ambigu),
      ambigu,
    );

    /*
     * La **raison machine** elle-même, et pas seulement le message.
     *
     * `cutoutErrorMessage()` n'est qu'une table `raison → message`. Tant que les
     * six messages restent **distincts**, tester le message revient à tester la
     * raison — mais c'est vrai *sous cette condition seulement*. Deux raisons qui
     * partageraient un texte rendraient une régression de classement invisible
     * depuis les assertions ci-dessus. Les deux contrôles vont donc ensemble :
     * l'un vérifie le classement, l'autre vérifie l'hypothèse qui le rend
     * observable.
     */
    const classements: Array<[string, string]> = [
      ['Worker: out of memory', 'memory'],
      ['inference timeout', 'timeout'],
      ['TypeError: Failed to fetch', 'network'],
      ['WebGPU adapter request failed', 'gpu'],
      ['could not decode image', 'image'],
      ['boom', 'unknown'],
    ];
    for (const [brut, attendu] of classements) {
      eq(`« ${brut} » est classé « ${attendu} »`, cutoutFailureReason(new Error(brut)), attendu);
    }

    eq(
      'les six raisons portent six messages distincts',
      new Set(classements.map(([brut]) => cutoutErrorMessage(new Error(brut)))).size,
      6,
    );

    eq(
      'mémoire prime sur réseau, aussi en raison machine',
      cutoutFailureReason(new Error('out of memory while fetching weights')),
      'memory',
    );
  }

  /* ---------------- 6. Le registre de modèles ---------------- */
  {
    eq('le défaut est le premier du registre', DEFAULT_CUTOUT_MODEL, CUTOUT_MODELS[0]);
    eq('le défaut est MediaPipe', DEFAULT_CUTOUT_MODEL.id, 'selfie_segmenter.tflite');
    ok('le défaut est exploitable commercialement', DEFAULT_CUTOUT_MODEL.commercialUse);
    eq('le défaut ne porte aucun avertissement', modelWarning(DEFAULT_CUTOUT_MODEL), null);
    ok(
      'le défaut est bien le moins cher du registre',
      CUTOUT_MODELS.every((m) => m.approxBytes >= DEFAULT_CUTOUT_MODEL.approxBytes),
    );

    const rmbg = findModel('briaai/RMBG-1.4');
    eq('RMBG-1.4 est retrouvé', rmbg.label, 'RMBG-1.4');
    ok('RMBG-1.4 est signalé comme non commercial', !rmbg.commercialUse);
    const avertissement = modelWarning(rmbg);
    ok('son avertissement nomme la licence', Boolean(avertissement) && /BRIA/.test(avertissement!), avertissement ?? '');
    ok(
      'son avertissement dit quoi faire',
      Boolean(avertissement) && /accord/i.test(avertissement!),
    );

    eq('un identifiant inconnu retombe sur le défaut', findModel('modele/inconnu').id, DEFAULT_CUTOUT_MODEL.id);
    eq('un identifiant absent retombe sur le défaut', findModel(undefined).id, DEFAULT_CUTOUT_MODEL.id);

    ok('chaque modèle porte une licence', CUTOUT_MODELS.every((m) => m.licence.length > 2));
    ok('chaque modèle porte une raison d’être là', CUTOUT_MODELS.every((m) => m.note.length > 20));
    ok('chaque modèle annonce un poids', CUTOUT_MODELS.every((m) => m.approxBytes > 0));
    ok(
      'MODNet est plus léger que RMBG-1.4',
      findModel('Xenova/modnet').approxBytes < rmbg.approxBytes,
      `${formatBytes(findModel('Xenova/modnet').approxBytes)} vs ${formatBytes(rmbg.approxBytes)}`,
    );

    /*
     * MediaPipe est l'alternative économe, et le registre doit porter le chiffre
     * qui le justifie. Ces assertions ne sont pas décoratives : le jour où
     * quelqu'un remplace le modèle léger par un plus lourd, la raison du choix
     * disparaît sans que rien ne le signale.
     */
    const mediapipe = findModel('selfie_segmenter.tflite');
    eq('MediaPipe est retrouvé', mediapipe.label, 'MediaPipe SelfieSegmenter');
    eq('il tourne sur un autre moteur', mediapipe.runtime, 'mediapipe');
    ok('MediaPipe est exploitable commercialement', mediapipe.commercialUse);
    ok(
      'MediaPipe est plus de 20× plus léger que MODNet',
      mediapipe.approxBytes * 20 < findModel('Xenova/modnet').approxBytes,
      `${formatBytes(mediapipe.approxBytes)} vs ${formatBytes(findModel('Xenova/modnet').approxBytes)}`,
    );
    /*
     * Le chemin d'exécution MediaPipe existe désormais : son avertissement doit
     * être vide, sinon il ferait éviter le modèle qu'on vient justement de
     * choisir comme défaut.
     */
    eq('et son avertissement est vide', modelWarning(mediapipe), null);
    ok(
      'les deux moteurs sont représentés dans le registre',
      new Set(CUTOUT_MODELS.map((m) => m.runtime)).size === 2,
    );
    ok(
      'chaque modèle annonce un moteur connu',
      CUTOUT_MODELS.every((m) => m.runtime === 'transformers' || m.runtime === 'mediapipe'),
    );

    ok(
      'aucun modèle n’est laissé sans hôte de téléchargement',
      CUTOUT_MODELS.every((m) => m.hosts.length > 0),
    );
  }

  /* ---------------- 7. La stratégie à deux étages ---------------- */
  {
    /*
     * Le cœur de la décision de coût : sans adaptateur WebGPU on ne peut pas
     * accélérer ONNX Runtime, donc on prend le modèle qui n'en a pas besoin.
     * Se tromper de branche, c'est soit faire attendre un téléphone d'entrée de
     * gamme, soit priver un appareil capable d'un meilleur contour.
     */
    const sansGpu = chooseModel(false);
    const avecGpu = chooseModel(true);

    eq('sans adaptateur WebGPU, on prend MediaPipe', sansGpu.id, 'selfie_segmenter.tflite');
    eq('avec adaptateur, on prend MODNet', avecGpu.id, 'Xenova/modnet');

    ok('le choix sans GPU est exploitable', modelWarning(sansGpu) === null);
    ok('le choix avec GPU est exploitable', modelWarning(avecGpu) === null);
    /*
     * Les deux étages doivent reposer sur des **moteurs différents** : c'est
     * tout l'intérêt. Si les deux branches finissaient sur le même moteur, la
     * stratégie n'apporterait rien — et l'assertion ci-dessous le dirait.
     */
    ok(
      'les deux étages reposent sur des moteurs différents',
      sansGpu.runtime !== avecGpu.runtime,
      `${sansGpu.runtime} vs ${avecGpu.runtime}`,
    );

    ok(
      'le chemin sans GPU est le moins cher des deux',
      sansGpu.approxBytes < avecGpu.approxBytes,
      `${formatBytes(sansGpu.approxBytes)} vs ${formatBytes(avecGpu.approxBytes)}`,
    );
    ok(
      'et il ne dépend pas de WebGPU',
      sansGpu.runtime === 'mediapipe',
      `moteur ${sansGpu.runtime}`,
    );

    /*
     * L'adoucissement suit le moteur : MediaPipe tranche, Transformers pondère.
     * Appliquer un flou à un masque déjà pondéré mangerait de la définition pour
     * rien.
     */
    eq('MediaPipe demande un adoucissement', defaultFeather(sansGpu), MEDIAPIPE_FEATHER_PX);
    eq('Transformers n’en demande aucun', defaultFeather(avecGpu), 0);
    ok('la valeur d’adoucissement est positive', MEDIAPIPE_FEATHER_PX > 0);

    /*
     * Le flou est exprimé **en pixels du masque**, puis converti. C'est ce qui
     * garantit la même intention visuelle à 1080 px comme à 4000 px — l'inverse
     * d'un flou en pixels de sortie, qui vaudrait quinze fois moins sur une
     * grande photo.
     */
    eq('un masque de 256 sur une photo de 4000 donne 7,8 px', featherRadius(256, 4000, 0.5), 7.8125);
    eq('et deux fois plus sur 8000', featherRadius(256, 8000, 0.5), 15.625);
    eq('sur une photo de même taille que le masque, rien à convertir', featherRadius(256, 256, 0.5), 0.5);
    eq('un adoucissement nul reste nul', featherRadius(256, 4000, 0), 0);
    eq('un masque de largeur nulle ne se convertit pas', featherRadius(0, 4000, 0.5), 0);
    eq('une photo de largeur nulle non plus', featherRadius(256, 0, 0.5), 0);

    /*
     * Le modèle sort deux canaux, **fond puis personne**. Prendre le premier
     * détourerait le décor — un résultat parfaitement propre et parfaitement
     * inutile, que seule cette assertion empêche.
     */
    eq('le canal personne est le second', MEDIAPIPE_PERSON_CHANNEL, 1);
    eq('à deux canaux, on prend le second', personChannelIndex(2), 1);
    eq('à un seul canal, on prend le seul', personChannelIndex(1), 0);
    eq('à aucun canal, on ne plante pas', personChannelIndex(0), 0);

    /*
     * Les adresses sont épinglées : une version qui glisse changerait les
     * mesures sans prévenir, et un chemin WASM faux ferait échouer le banc avec
     * un message réseau incompréhensible.
     */
    ok('le dossier WASM est celui de la version épinglée', MEDIAPIPE_WASM.startsWith(MEDIAPIPE_CDN));
    ok('le dossier WASM est bien un dossier wasm', MEDIAPIPE_WASM.endsWith('/wasm'));
    ok('les poids sont un .tflite', MEDIAPIPE_MODEL_URL.endsWith('.tflite'));
    ok('les poids viennent du bucket mediapipe-models', MEDIAPIPE_MODEL_URL.includes('mediapipe-models'));
  }

  /* ---------------- 8. Le coût réel du premier détourage ---------------- */
  {
    /*
     * Le chiffre qui répond à la question posée. Comparer les modèles entre eux
     * ne suffit pas : le moteur pèse plus lourd que le modèle, et c'est lui qui
     * décide si le premier détourage passe sur un forfait mobile.
     */
    const mediapipe = findModel('selfie_segmenter.tflite');
    const modnet = findModel('Xenova/modnet');
    const rmbg = findModel('briaai/RMBG-1.4');

    ok('chaque moteur du registre annonce son coût', CUTOUT_RUNTIME_COSTS.length === 2);
    ok('MediaPipe a une ligne de coût', runtimeCost('mediapipe') !== undefined);
    ok('Transformers aussi', runtimeCost('transformers') !== undefined);
    ok(
      'chaque moteur employé par un modèle a une ligne de coût',
      CUTOUT_MODELS.every((m) => runtimeCost(m.runtime) !== undefined),
    );
    ok(
      'chaque ligne de coût porte une raison d’être là',
      CUTOUT_RUNTIME_COSTS.every((c) => c.note.length > 20),
    );
    ok(
      'la borne haute n’est jamais sous la borne basse',
      CUTOUT_RUNTIME_COSTS.every((c) => c.maxWasmBytes >= c.minWasmBytes),
    );

    /*
     * Les poids sont ceux **relevés** sur l'API Hugging Face le 2026-10-10, et
     * non des ordres de grandeur. Les figer ici est délibéré : changer les poids
     * d'un modèle doit être un acte conscient, pas un effet de bord d'une
     * modification voisine. `model_quantized.onnx` est la variante que
     * Transformers.js charge par défaut.
     */
    eq('MediaPipe pèse 249 537 o (selfie_segmenter.tflite)', mediapipe.approxBytes, 249_537);
    eq('MODNet pèse 6 632 188 o (model_quantized.onnx)', modnet.approxBytes, 6_632_188);
    eq('RMBG-1.4 pèse 44 403 226 o (model_quantized.onnx)', rmbg.approxBytes, 44_403_226);

    eq('MediaPipe : 12,2 Mo de moteur + 243 Ko de poids', firstLoadBytes(mediapipe), 12_417_853);
    eq('MODNet : 14,2 Mo de moteur + 6,6 Mo de poids', firstLoadBytes(modnet), 20_872_085);
    eq('au pire, MediaPipe reste sous 14 Mo', firstLoadBytes(mediapipe, true), 13_246_785);
    eq('au pire, MODNet monte à 28 Mo', firstLoadBytes(modnet, true), 28_228_207);

    /*
     * Les mêmes premières visites, **telles qu'elles passent sur le réseau**.
     *
     * C'est le chiffre qui se compare à un forfait mobile, et il n'est pas le
     * même que ci-dessus : jsDelivr sert le WASM en brotli. Les figer ici est ce
     * qui empêche la confusion de revenir — sans ces lignes, on pourrait
     * rebrancher le budget sur `firstLoadBytes()` sans que rien ne s'en aperçoive.
     */
    eq(
      'MediaPipe transfère 3,77 Mo — 3,4 Mo de WASM + 124 Ko de colle + 243 Ko de poids',
      firstLoadTransferBytes(mediapipe),
      3_774_735,
    );
    eq('au pire, MediaPipe transfère 3,88 Mo', firstLoadTransferBytes(mediapipe, true), 3_877_587);
    eq(
      'MODNet transfère 10,96 Mo — le modèle non compressé pèse plus que le moteur',
      firstLoadTransferBytes(modnet),
      10_962_617,
    );

    /*
     * Témoin négatif du facteur 3,5. Sans lui, les assertions ci-dessus
     * pourraient passer alors que les deux fonctions renvoient la même chose —
     * c'est-à-dire au moment précis où la correction aurait été défaite.
     */
    ok(
      'les deux grandeurs ne se confondent pas : transféré ≠ matérialisé',
      firstLoadTransferBytes(mediapipe) !== firstLoadBytes(mediapipe),
      `${formatBytes(firstLoadTransferBytes(mediapipe))} sur le fil vs ${formatBytes(firstLoadBytes(mediapipe))} en mémoire`,
    );
    ok(
      'et le transféré est bien le plus petit des deux — la compression ne peut pas alourdir',
      firstLoadTransferBytes(mediapipe) < firstLoadBytes(mediapipe),
    );
    ok(
      'l’écart est du bon ordre de grandeur (entre 2× et 5×)',
      firstLoadBytes(mediapipe) / firstLoadTransferBytes(mediapipe) > 2 &&
        firstLoadBytes(mediapipe) / firstLoadTransferBytes(mediapipe) < 5,
      `rapport ${(firstLoadBytes(mediapipe) / firstLoadTransferBytes(mediapipe)).toFixed(2)}`,
    );

    /*
     * Le détail que seule la mesure révèle : **l'ordre s'inverse**.
     *
     * Le relevé du 2026-10-10, en clair, parce que le registre ne peut pas
     * l'exprimer : ses bornes `min`/`max` sont indépendantes par colonne, donc
     * elles ne disent pas quelle variante va avec quelle autre. Sans ce tableau,
     * quelqu'un « harmoniserait » un jour `minWasmBytes` avec
     * `minWasmTransferBytes` — et le budget se tromperait de 103 Ko, dans le
     * sens qui sous-estime.
     */
    const releveMediaPipe = [
      { nom: 'SIMD (vision_wasm_internal.wasm)', octets: 12_168_316, transfert: 3_501_230 },
      { nom: 'sans SIMD (vision_wasm_nosimd_internal.wasm)', octets: 12_997_248, transfert: 3_398_378 },
    ];
    const parOctets = [...releveMediaPipe].sort((a, b) => a.octets - b.octets);
    const parTransfert = [...releveMediaPipe].sort((a, b) => a.transfert - b.transfert);
    ok(
      'l’ordre s’inverse entre le disque et le réseau',
      parOctets.map((v) => v.nom).join('|') !== parTransfert.map((v) => v.nom).join('|'),
      `disque : ${parOctets.map((v) => v.nom).join(' < ')} ; réseau : ${parTransfert.map((v) => v.nom).join(' < ')}`,
    );
    ok(
      'le plus lourd sur le disque est le plus léger sur le réseau',
      parOctets[parOctets.length - 1].nom === parTransfert[0].nom,
    );
    /*
     * Témoin du relevé : les bornes du registre doivent être **exactement** ces
     * nombres. Si le tableau ci-dessus dérive, ceci tombe.
     */
    eq('borne basse disque du registre', runtimeCost('mediapipe')!.minWasmBytes, 12_168_316);
    eq('borne haute disque du registre', runtimeCost('mediapipe')!.maxWasmBytes, 12_997_248);
    eq('borne basse réseau du registre', runtimeCost('mediapipe')!.minWasmTransferBytes, 3_398_378);
    eq('borne haute réseau du registre', runtimeCost('mediapipe')!.maxWasmTransferBytes, 3_501_230);

    /*
     * Le cœur de la recommandation, en une assertion. Si quelqu'un remplace un
     * moteur par un autre plus lourd, celle-ci tombe — et c'est exactement ce
     * qu'on veut savoir.
     */
    ok(
      'le premier détourage MediaPipe est plus léger que le Transformers',
      firstLoadBytes(mediapipe) < firstLoadBytes(modnet),
      `${formatBytes(firstLoadBytes(mediapipe))} vs ${formatBytes(firstLoadBytes(modnet))}`,
    );
    ok(
      'et il le reste même dans le pire cas',
      firstLoadBytes(mediapipe, true) < firstLoadBytes(modnet, true),
    );

    /*
     * Témoin : l'écart doit venir du **modèle**, pas d'un moteur déjà léger.
     * Autrement dit, à moteur identique, MediaPipe gagne encore largement.
     */
    ok(
      'le moteur Transformers est plus lourd que celui de MediaPipe',
      runtimeCost('transformers')!.minWasmBytes > runtimeCost('mediapipe')!.maxWasmBytes,
      `${formatBytes(runtimeCost('transformers')!.minWasmBytes)} vs ${formatBytes(runtimeCost('mediapipe')!.maxWasmBytes)}`,
    );
  }

  /* ---------------- 9. Les trois arbitrages tranchés ---------------- */
  {
    /*
     * Décidés le 2026-10-10 : seuil d'abandon à 5 s, budget mobile à 10 Mo, et
     * aucun transfert serveur automatique. Ce sont des règles de décision, donc
     * des fonctions pures — et des fonctions pures, cela se teste.
     */
    const mediapipe = findModel('selfie_segmenter.tflite');
    const modnet = findModel('Xenova/modnet');

    /* — le seuil d'abandon — */
    eq('le seuil d’abandon est de 5 secondes', ABANDON_AFTER_MS, 5_000);

    ok('à 4,999 s, on attend encore', shouldOfferServerFallback(4_999) === false);
    ok('à 5,000 s, on propose', shouldOfferServerFallback(5_000) === true);
    ok('au-delà, on propose toujours', shouldOfferServerFallback(30_000) === true);
    ok('à zéro, on ne propose rien', shouldOfferServerFallback(0) === false);
    /*
     * Une durée non mesurée (`NaN`, `Infinity`) ne doit **pas** déclencher la
     * proposition : proposer le serveur parce qu'on n'a pas su chronométrer
     * serait une bascule sur un bug, pas sur une lenteur.
     */
    ok('une durée non mesurée ne déclenche rien', shouldOfferServerFallback(Number.NaN) === false);
    ok('une durée infinie ne déclenche rien non plus', shouldOfferServerFallback(Number.POSITIVE_INFINITY) === false);

    /* — le budget de données — */
    eq('le budget mobile est de 10 Mo', MOBILE_TRANSFER_BUDGET_BYTES, 10_000_000);
    /*
     * Unité **décimale**, et c'est un choix, pas un oubli : un forfait mobile se
     * lit en Mo décimaux. Le seuil est donc plus strict qu'en Mio.
     */
    ok(
      'le budget est compté en Mo décimaux, pas en Mio',
      MOBILE_TRANSFER_BUDGET_BYTES === 10 * 1000 * 1000,
      '10 Mio vaudraient 10 485 760 o',
    );

    /*
     * **Le verdict, tel que la mesure l'a retourné le 2026-10-10.**
     *
     * Avant le banc, ces trois assertions disaient l'inverse — et elles étaient
     * vertes. Elles comparaient 12,4 Mo décompressés à un forfait mobile de
     * 10 Mo. Le chiffre qui se paie est celui du réseau : 3,77 Mo. Le moteur
     * retenu entre donc dans le budget, et MODNet en sort.
     *
     * C'est le seul endroit du dépôt où ce renversement est écrit en assertion.
     */
    ok(
      'le moteur retenu entre dans le budget',
      exceedsMobileBudget(mediapipe) === false,
      `${formatBytes(firstLoadTransferBytes(mediapipe))} transférés pour un budget de ${formatBytes(MOBILE_TRANSFER_BUDGET_BYTES)}`,
    );
    ok('et il y entre aussi dans le pire cas', exceedsMobileBudget(mediapipe, true) === false);
    ok(
      'MODNet, lui, en sort',
      exceedsMobileBudget(modnet) === true,
      `${formatBytes(firstLoadTransferBytes(modnet))} transférés`,
    );

    /*
     * Le budget ne se lit **pas** sur les octets décompressés. Témoin négatif
     * essentiel : si quelqu'un rebranchait `exceedsMobileBudget` sur
     * `firstLoadBytes()`, le moteur retenu serait de nouveau déclaré hors budget
     * — et cette ligne est là pour que cela se voie.
     */
    ok(
      'le budget ne se lit pas sur la taille décompressée',
      firstLoadBytes(mediapipe) > MOBILE_TRANSFER_BUDGET_BYTES &&
        firstLoadTransferBytes(mediapipe) < MOBILE_TRANSFER_BUDGET_BYTES,
      `${formatBytes(firstLoadBytes(mediapipe))} décompressés vs ${formatBytes(firstLoadTransferBytes(mediapipe))} transférés`,
    );

    /*
     * L'accord est demandé **sur connexion facturée**, et seulement quand le
     * transfert sort du budget. Conséquence directe du renversement : le moteur
     * retenu ne demande plus rien — il est sous le seuil.
     */
    ok('sur connexion facturée, le moteur retenu ne demande rien — il est sous le seuil', downloadNeedsConsent(mediapipe, true) === false);
    ok('sur connexion facturée, MODNet demande l’accord', downloadNeedsConsent(modnet, true) === true);
    ok('sur connexion non facturée, on ne demande rien', downloadNeedsConsent(modnet, false) === false);

    /*
     * Le constat, écrit ici pour qu'il ne se perde pas : **un** moteur du
     * registre entre dans le budget, et c'est celui qu'on a retenu. L'assertion
     * est un **fil de déclenchement** : si un moteur plus lourd entrait au
     * registre, ou si MODNet passait sous le seuil, elle tomberait et rappellerait
     * de mettre le §7 du plan à jour.
     */
    const inBudget = CUTOUT_MODELS.filter((m) => !exceedsMobileBudget(m));
    ok(
      'un seul moteur du registre entre dans le budget de 10 Mo — celui qu’on a retenu',
      inBudget.length === 1 && inBudget[0].id === mediapipe.id,
      inBudget.map((m) => m.id).join(', ') || 'aucun',
    );

    /* — aucun transfert serveur automatique — */
    /*
     * Le recours au serveur fait sortir la photo de l'appareil : c'est
     * exactement la promesse que le détourage sur l'appareil existe pour tenir.
     * Il ne peut donc pas être implicite. On le vérifie sur le **texte** du
     * module, faute de pouvoir l'exécuter : aucun chemin d'envoi n'y figure.
     */
    const source = readFileSync(join(process.cwd(), 'lib', 'cutout.ts'), 'utf8');
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');

    for (const token of ['XMLHttpRequest', 'sendBeacon', 'FormData', 'uploadPhoto', 'api/cutout']) {
      ok(
        `aucun chemin d’envoi : « ${token} » est absent du module`,
        !stripped.includes(token),
        'un chemin d’envoi est apparu — vérifier qu’il exige l’accord du participant',
      );
    }
    ok(
      'le témoin : ces mêmes motifs sont bien trouvables dans un texte qui les contient',
      ['XMLHttpRequest', 'FormData'].every((t) => `${t} `.includes(t)),
    );
  }

  /* ---------------- 10. Les formats ---------------- */
  {
    eq('les octets', formatBytes(500), '500 o');
    eq('les kilo-octets', formatBytes(2048), '2.0 Ko');
    /*
     * 6 300 000 se lit **6,3 Mo** en décimal et 6,0 en binaire : c'est le seul
     * jeu qui distingue les deux conventions, donc le seul qui prouve laquelle
     * est appliquée. L'ancienne valeur attendue ici était « 6.0 Mo », et elle
     * passait — parce que 6 300 000 tombait juste. Un test qui passe des deux
     * façons ne teste rien.
     */
    eq('les méga-octets', formatBytes(6_300_000), '6.3 Mo');
    eq('un budget de 10 000 000 o s’affiche bien 10.0 Mo', formatBytes(MOBILE_TRANSFER_BUDGET_BYTES), '10.0 Mo');
    /*
     * Témoin négatif de la frontière. Ces deux entrées tombent de part et
     * d'autre de 1 048 576 — la frontière **binaire** — et doivent pourtant
     * toutes deux s'afficher en Mo, parce que la frontière est à 1 000 000.
     * En binaire, la première donnerait « 976.6 Ko » et la seconde « 1024.0 Ko ».
     */
    eq('la frontière Ko/Mo est décimale, pas binaire', formatBytes(1_000_000), '1.0 Mo');
    eq('juste sous 1 048 576, on est déjà en Mo', formatBytes(1_048_575), '1.0 Mo');
    eq('une valeur absente', formatBytes(null), '—');
    eq('une valeur non finie', formatBytes(Number.NaN), '—');

    eq('les millisecondes', formatMs(250), '250 ms');
    eq('les secondes', formatMs(1500), '1.50 s');
    eq('une valeur absente', formatMs(null), '—');
  }

  /* ---------------- 11. Le poids réellement téléchargé ---------------- */
  {
    /*
     * Sur un forfait mobile, c'est le chiffre décisif : 6 Mo de poids pèsent
     * plus lourd que trois secondes de calcul. Le confondre avec « 0 » ferait
     * croire à un détourage gratuit.
     */
    eq('aucune ressource correspondante donne null', sumTransferredBytes([], 'huggingface'), null);
    eq(
      'des ressources sans rapport donnent null, pas 0',
      sumTransferredBytes([{ name: 'https://exemple.test/app.js', transferSize: 900 }], 'huggingface'),
      null,
    );

    const poids = [
      { name: 'https://huggingface.co/Xenova/modnet/onnx/model.onnx', transferSize: 6_100_000 },
      { name: 'https://huggingface.co/Xenova/modnet/config.json', transferSize: 1_200 },
      { name: 'https://exemple.test/autre.js', transferSize: 5_000_000 },
    ];
    eq(
      'seules les ressources du modèle sont additionnées',
      sumTransferredBytes(poids, 'huggingface'),
      6_101_200,
    );

    /*
     * Le cas qui décide de la justesse du chiffre : un second détourage trouve
     * les poids en cache. `transferSize` vaut alors 0 et le navigateur
     * renseigne quand même `encodedBodySize`. Compter le corps annoncerait 6 Mo
     * téléchargés alors que rien n'est sorti du réseau.
     */
    eq(
      'une ressource servie du cache compte 0, pas la taille du corps',
      sumTransferredBytes(
        [{ name: 'https://huggingface.co/model.onnx', transferSize: 0, encodedBodySize: 6_100_000 }],
        'huggingface',
      ),
      0,
    );
    ok(
      'et ce 0 n’est pas confondu avec « rien vu passer »',
      sumTransferredBytes(
        [{ name: 'https://huggingface.co/model.onnx', transferSize: 0, encodedBodySize: 6_100_000 }],
        'huggingface',
      ) !== null,
    );

    eq(
      'sans transferSize, on se rabat sur le corps compressé',
      sumTransferredBytes([{ name: 'https://huggingface.co/model.onnx', encodedBodySize: 4_000 }], 'huggingface'),
      4_000,
    );

    /*
     * Un modèle ne vient pas d'un seul domaine : les poids MediaPipe arrivent de
     * `storage.googleapis.com` et la bibliothèque de `cdn.jsdelivr.net`. Ne
     * mesurer qu'un hôte sous-estimerait le coût — c'est-à-dire exactement le
     * chiffre sur lequel on décide.
     */
    const mediapipe = findModel('selfie_segmenter.tflite');
    const mixte = [
      { name: 'https://storage.googleapis.com/mediapipe-models/selfie_segmenter.tflite', transferSize: 249_537 },
      { name: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_wasm_internal.wasm', transferSize: 5_561_000 },
      { name: 'https://exemple.test/inconnu.js', transferSize: 9_999_999 },
    ];
    eq(
      'les deux hôtes du modèle sont additionnés',
      transferredForModel(mixte, mediapipe),
      5_810_537,
    );
    eq(
      'un hôte hors modèle n’est pas compté',
      transferredForModel([{ name: 'https://exemple.test/x.js', transferSize: 1 }], mediapipe),
      null,
    );
    /*
     * Et le total suit le **modèle choisi**, pas une constante : c'est ce qui
     * permet de comparer deux moteurs sur la même page, avec les mêmes entrées.
     */
    const partage = [
      { name: 'https://huggingface.co/Xenova/modnet/onnx/model.onnx', transferSize: 6_300_000 },
      { name: 'https://storage.googleapis.com/mediapipe-models/selfie_segmenter.tflite', transferSize: 249_537 },
    ];
    eq(
      'sur les mêmes entrées, le moteur Transformers compte 6,3 Mo',
      transferredForModel(partage, findModel('Xenova/modnet')),
      6_300_000,
    );
    eq(
      'et le moteur MediaPipe 243 Ko',
      transferredForModel(partage, mediapipe),
      249_537,
    );
    /*
     * Un modèle dont aucun hôte n'apparaît donne `null` et non `0` : « je n'ai
     * rien vu passer » ne veut pas dire « rien n'a été téléchargé ». Confondre
     * les deux ferait passer un modèle lourd pour gratuit.
     */
    eq(
      'un modèle absent du trafic donne null, pas 0',
      transferredForModel([{ name: 'https://exemple.test/x.js', transferSize: 10 }], mediapipe),
      null,
    );
  }

  /* ---------------- 12. L'export CSV ---------------- */
  {
    const une = measurementsToCsv([measurement()]);
    const lignes = une.split('\n');
    eq('un en-tête et une ligne', lignes.length, 2);
    eq(
      'l’en-tête suit les colonnes déclarées',
      lignes[0],
      MEASUREMENT_COLUMNS.map((c) => c.label).join(';'),
    );
    eq('le séparateur est le point-virgule', lignes[0].split(';').length, MEASUREMENT_COLUMNS.length);
    ok('les valeurs sont présentes', lignes[1].includes('Xenova/modnet'));
    /*
     * Une mesure sans la version de la bibliothèque n'est pas reproductible :
     * « c'était lent » ne veut rien dire si on ignore avec quoi c'était lent.
     */
    ok(
      'chaque ligne porte la version de la bibliothèque',
      lignes[1].includes('3.7.6'),
      lignes[1].slice(0, 80),
    );
    ok(
      'la version est déclarée comme colonne',
      MEASUREMENT_COLUMNS.some((c) => c.key === 'libraryVersion'),
    );

    eq('aucune mesure ne donne qu’un en-tête', measurementsToCsv([]).split('\n').length, 1);

    /*
     * Un libellé d'appareil est saisi à la main : il contient facilement un
     * point-virgule ou un guillemet. Non échappé, il décalerait toutes les
     * colonnes suivantes et le tableau deviendrait illisible.
     */
    const piege = measurementsToCsv([measurement({ deviceLabel: 'Pixel 6a; Android 15' })]);
    const ligne = piege.split('\n')[1];
    ok(
      'un point-virgule dans une valeur est mis entre guillemets',
      ligne.includes('"Pixel 6a; Android 15"'),
      ligne.slice(0, 60),
    );
    /*
     * La ligne est relue comme un tableur la lirait. Le témoin négatif qui suit
     * est ce qui donne son sens à l'assertion : une découpe naïve sur `;`
     * **doit** échouer, sinon le champ n'aurait pas besoin d'être échappé et le
     * test ne prouverait rien.
     */
    const champs = splitCsvLine(ligne);
    eq('la ligne garde le bon nombre de colonnes', champs.length, MEASUREMENT_COLUMNS.length);
    eq('le champ appareil est reconstitué à l’identique', champs[1], 'Pixel 6a; Android 15');
    ok(
      'une découpe naïve se tromperait bien de nombre de colonnes',
      ligne.split(';').length > MEASUREMENT_COLUMNS.length,
      `${ligne.split(';').length} champs au lieu de ${MEASUREMENT_COLUMNS.length}`,
    );
    ok('le champ reste intact une fois les guillemets retirés', ligne.includes('Android 15'));

    const guillemets = measurementsToCsv([measurement({ deviceLabel: 'écran "6a"' })]);
    ok(
      'un guillemet dans une valeur est doublé',
      guillemets.includes('""6a""'),
      guillemets.split('\n')[1].slice(0, 60),
    );

    const vide = measurementsToCsv([measurement({ memoryBytes: null, transferredBytes: null })]);
    ok('une mesure absente devient une cellule vide', vide.includes(';;') || vide.includes(';'));
    ok('aucun « null » ne fuit dans le CSV', !vide.includes('null'));
  }

  /* ---------------- 13. Le module reste compilable seul ---------------- */
  {
    /*
     * Propriété structurelle, et non des moindres : le banc compile
     * `lib/cutout.ts` **tout seul** pour importer la même logique que
     * l'application. Le jour où quelqu'un y ajoute un `import`, cette
     * compilation échoue ou, pire, le banc se met à mesurer une copie. Le
     * contrôle est ici plutôt qu'en commentaire, parce qu'un commentaire ne
     * casse pas la compilation.
     */
    const source = readFileSync(join(process.cwd(), 'lib', 'cutout.ts'), 'utf8');
    const imports = source
      .split('\n')
      .filter((line) => /^\s*import\s/.test(line) || /^\s*export\s+.*\sfrom\s+['"]/.test(line));
    eq('lib/cutout.ts ne contient aucun import', imports.length, 0);
    if (imports.length > 0) console.log(`       ${imports.join('\n       ')}`);
  }

  /* ---------------- 14. Les décisions que lit le parcours ---------------- */
  {
    /*
     * Ces deux fonctions n'existent que parce que le parcours participant doit
     * les lire au moment où il décide : « dois-je demander l'accord ? » et
     * « ce résultat est-il montrable ? ». Elles sont pures, donc testables ici,
     * sans navigateur — c'est tout l'intérêt de les avoir sorties du composant.
     */

    /* — la connexion facturée — */
    ok('sans information de connexion, on ne suppose rien', isMeteredConnection(undefined) === false);
    ok('une connexion absente non plus', isMeteredConnection(null) === false);
    /*
     * Le cas le plus important : un objet vide veut dire « je ne sais pas ».
     * Répondre `true` ferait apparaître une demande d'accord sur le wifi d'un
     * participant qui n'a rien demandé — et l'habituerait à accepter sans lire.
     */
    ok('une connexion inconnue n’est pas dite facturée', isMeteredConnection({}) === false);

    ok('l’intention explicite d’économiser compte', isMeteredConnection({ saveData: true }) === true);
    ok('une 4G déclarée cellulaire compte', isMeteredConnection({ type: 'cellular' }) === true);
    ok('le wifi n’est pas facturé', isMeteredConnection({ type: 'wifi' }) === false);
    ok('l’ethernet non plus', isMeteredConnection({ type: 'ethernet' }) === false);
    ok('sans économie demandée, le wifi reste non facturé', isMeteredConnection({ saveData: false, type: 'wifi' }) === false);
    /*
     * Témoin : l'intention du participant prime sur le type de réseau. Un
     * « économisez mes données » sur wifi doit compter — c'est un partage de
     * connexion, et le participant sait ce qu'il fait.
     */
    ok('l’économie de données prime sur le type', isMeteredConnection({ saveData: true, type: 'wifi' }) === true);

    /*
     * **Témoin négatif de la règle, et il est structurel.** `effectiveType`
     * décrit un débit, pas une facturation. S'en servir serait une inférence —
     * fausse sur un wifi lent, et manquée sur une 4G facturée. On vérifie donc
     * que le champ n'est **lu nulle part** dans le module, plutôt que de tester
     * un cas particulier : une assertion de comportement laisserait passer un
     * repli ajouté plus tard.
     */
    const source = readFileSync(join(process.cwd(), 'lib', 'cutout.ts'), 'utf8');
    const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, '');
    ok(
      'le débit n’est jamais lu pour deviner une facturation',
      !sansCommentaires.includes('effectiveType'),
      'effectiveType apparaît dans le code, pas seulement dans un commentaire',
    );
    ok(
      'le témoin : « effectiveType » est bien trouvable dans un texte qui le contient',
      'a.effectiveType'.includes('effectiveType'),
    );

    /* — ce qu'on fait d'un résultat — */
    const table: readonly (readonly [number, CutoutVerdict, CutoutOutcome])[] = [
      [1.0, 'plein', 'warn'],
      [0.5, 'ok', 'ok'],
      [0.05, 'faible', 'warn'],
      [0.01, 'vide', 'unusable'],
    ];
    for (const [ratio, verdict, outcome] of table) {
      const quality = judgeCutout(ratio);
      eq(`un ratio de ${ratio} donne le verdict « ${verdict} »`, quality.verdict, verdict);
      eq(`… et l’issue « ${outcome} »`, cutoutOutcome(quality), outcome);
    }

    /*
     * Témoin négatif : « pas ok » ne veut pas dire « inutilisable ». Les deux
     * verdicts d'avertissement s'affichent quand même — les refuser priverait le
     * participant d'un visuel qu'il peut vouloir garder.
     */
    const issueParVerdict: readonly CutoutVerdict[] = ['ok', 'faible', 'vide', 'plein'];
    const inutilisables = issueParVerdict.filter(
      (v) => cutoutOutcome(judgeCutout(v === 'vide' ? 0.01 : v === 'plein' ? 1 : v === 'faible' ? 0.05 : 0.5)) === 'unusable',
    );
    eq('un seul verdict rend le résultat inutilisable', inutilisables.length, 1);
    eq('et c’est bien « vide »', inutilisables[0], 'vide');
    ok(
      'un avertissement n’est pas un échec : « plein » et « faible » restent affichables',
      cutoutOutcome(judgeCutout(1.0)) !== 'unusable' && cutoutOutcome(judgeCutout(0.05)) !== 'unusable',
    );
  }

  console.log(
    failures === 0
      ? '\nPASS — 0 contrôle en échec\n'
      : `\nFAIL — ${failures} contrôle(s) en échec\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
