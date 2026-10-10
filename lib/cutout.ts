/**
 * Détourage du sujet — logique du banc isolé.
 *
 * Ce module ne dépend de **rien** : ni de Fabric, ni du parcours participant,
 * ni de React, ni d'un paquet npm. Deux raisons, et les deux comptent :
 *
 * 1. **Il doit être mesurable seul.** La phase 1 du chantier Background Frame
 *    consiste à savoir si le détourage sur l'appareil est tenable avant d'écrire
 *    une ligne de parcours. Un module qui traînerait le descripteur, Fabric et
 *    l'état du participant ne serait pas mesurable.
 * 2. **Il est compilé deux fois.** Une fois pour l'application, une fois en
 *    module ESM pour le banc (`tools/cutout-bench/`). Un seul fichier source,
 *    donc la mesure porte sur le **vrai** code — pas sur une copie qui aurait
 *    dérivé. C'est la raison pour laquelle il n'y a aucun `import` ici : le
 *    fichier doit tenir debout tout seul.
 *
 * Le découpage est volontaire : **la logique est épaisse et testable**, le code
 * navigateur est mince. Tout ce qui peut être vérifié sans navigateur l'est
 * (`npm run check:cutout`), et ce qui ne peut pas l'est dit explicitement.
 */

/* ------------------------------------------------------------------ */
/* Les modèles — un registre, pas une constante cachée                 */
/* ------------------------------------------------------------------ */

/**
 * Où le détourage s'exécute réellement.
 *
 * `webgpu` quand l'appareil expose un adaptateur, `wasm` sinon — ce sont les
 * deux chemins de Transformers.js. MediaPipe en ajoute un troisième : son
 * délégué GPU passe par **WebGL**, pas par WebGPU. Les confondre ferait écrire
 * « WebGPU » dans le tableau de mesures pour un appareil qui n'en a pas — et
 * c'est exactement le genre de chiffre qui fait prendre une mauvaise décision.
 *
 * `wasm` n'est pas un lot de consolation : sur les téléphones réellement visés,
 * c'est souvent le seul chemin disponible — d'où l'obligation de le tester.
 */
export type CutoutDevice = 'webgpu' | 'webgl' | 'wasm';

/**
 * Le moteur qui exécute le modèle.
 *
 * Les deux ne coûtent pas la même chose et ne s'exécutent pas au même endroit :
 * `transformers` s'appuie sur ONNX Runtime Web (13,9 Mo de WASM au minimum, 27,6
 * avec le moteur WebGPU) et accepte `device: 'webgpu'` ; `mediapipe` embarque son
 * propre WASM et tourne sur WASM/WebGL, **sans WebGPU**. C'est la distinction qui
 * décide si le détourage fonctionne sur un téléphone d'entrée de gamme.
 */
export type CutoutRuntime = 'transformers' | 'mediapipe';

export interface CutoutModel {
  /** Identifiant du modèle, ou nom de fichier pour MediaPipe. */
  id: string;
  label: string;
  /** Le moteur qui sait exécuter ce modèle. */
  runtime: CutoutRuntime;
  /** Licence, telle qu'elle est déclarée sur le dépôt du modèle. */
  licence: string;
  /**
   * Vrai si la licence couvre l'exploitation commerciale **sans négociation**.
   *
   * Ce champ n'est pas décoratif : `modelWarning()` le lit, et le banc refuse
   * d'activer silencieusement un modèle dont la licence ne suit pas. Une
   * décision d'affaires ne doit pas se perdre dans un commentaire.
   */
  commercialUse: boolean;
  /** Poids réellement téléchargés, en octets. */
  approxBytes: number;
  /**
   * Hôtes d'où les poids sont réellement téléchargés.
   *
   * Sert à mesurer ce qui sort du réseau : sans cette liste, `transferredBytes`
   * ne saurait pas quoi additionner, et le poste le plus lourd sur un forfait
   * mobile resterait invisible.
   */
  hosts: readonly string[];
  /** Pourquoi ce modèle est dans la liste. */
  note: string;
}

/**
 * Les modèles, **du moins cher au plus cher**.
 *
 * L'ordre n'est pas décoratif : `DEFAULT_CUTOUT_MODEL` est la première entrée.
 * Placer le moins coûteux en tête rend la règle lisible — un modèle plus lourd
 * ne peut devenir le défaut qu'en le devenant explicitement.
 */
export const CUTOUT_MODELS: readonly CutoutModel[] = [
  {
    id: 'selfie_segmenter.tflite',
    label: 'MediaPipe SelfieSegmenter',
    runtime: 'mediapipe',
    licence: 'Apache-2.0',
    commercialUse: true,
    approxBytes: 249_537,
    hosts: ['storage.googleapis.com', 'cdn.jsdelivr.net'],
    note:
      'MobileNetV3 entraîné pour la personne en gros plan. 243 Ko — 26× moins ' +
      'que MODNet — et 33 ms annoncés par Google sur un Pixel 6 **en CPU**, ' +
      'sans WebGPU. Le masque est plus dur : les cheveux fins y perdent.',
  },
  {
    id: 'Xenova/modnet',
    label: 'MODNet',
    runtime: 'transformers',
    licence: 'Apache-2.0',
    commercialUse: true,
    approxBytes: 6_632_188,
    hosts: ['huggingface.co', 'cdn-lfs.huggingface.co'],
    note:
      'Modèle de matting portrait : il est conçu pour des personnes, ce qui est ' +
      'exactement le cas ici. Meilleur sur les cheveux que MediaPipe, mais 26× ' +
      'plus lourd et lent sans WebGPU.',
  },
  {
    id: 'briaai/RMBG-1.4',
    label: 'RMBG-1.4',
    runtime: 'transformers',
    licence: 'BRIA — usage commercial non couvert',
    commercialUse: false,
    approxBytes: 44_403_226,
    hosts: ['huggingface.co', 'cdn-lfs.huggingface.co'],
    note:
      'Meilleur contour sur les cheveux fins, mais 6,7× plus lourd que MODNet et ' +
      'sa licence exige un accord commercial avant toute mise en production payante.',
  },
];

/**
 * Le modèle par défaut : MediaPipe.
 *
 * Le moins cher des trois, et le seul qui **ne demande pas WebGPU** — donc le
 * seul qui fonctionne sur un téléphone d'entrée de gamme sans faire attendre le
 * participant. Un défaut doit être le choix qui ne se trompe jamais, pas le plus
 * beau quand tout va bien.
 *
 * Le choix reste **réversible** — c'est tout l'intérêt du registre. Ce qui n'est
 * pas réversible, c'est la licence : c'est pourquoi l'avertissement est calculé
 * et non écrit dans un commentaire.
 */
export const DEFAULT_CUTOUT_MODEL: CutoutModel = CUTOUT_MODELS[0];

/** Retrouve un modèle par son identifiant, ou le défaut si l'identifiant est inconnu. */
export function findModel(id: string | undefined): CutoutModel {
  if (!id) return DEFAULT_CUTOUT_MODEL;
  return CUTOUT_MODELS.find((model) => model.id === id) ?? DEFAULT_CUTOUT_MODEL;
}

/**
 * Le modèle à employer sur un appareil donné — la stratégie à deux étages.
 *
 * - **Pas d'adaptateur WebGPU** : MediaPipe. 243 Ko, WASM/WebGL, 33 ms annoncés.
 *   C'est le seul chemin qui tienne sur les téléphones réellement visés.
 * - **Adaptateur accordé** : MODNet. L'appareil peut payer 6,3 Mo et le coût du
 *   moteur ONNX Runtime, et il le rend en qualité de contour sur les cheveux.
 *
 * Ce n'est pas une optimisation prématurée : c'est la seule façon d'obtenir à la
 * fois un détourage qui marche partout **et** un rendu proche de la référence là
 * où c'est possible. Les deux branches sont testées.
 */
export function chooseModel(webgpuAvailable: boolean): CutoutModel {
  return webgpuAvailable ? findModel('Xenova/modnet') : findModel('selfie_segmenter.tflite');
}

/**
 * L'adoucissement du bord du masque, **en pixels du masque** — pas de la photo.
 *
 * MediaPipe tranche au lieu de pondérer : son masque est binaire, et il fait
 * 256×256 avant d'être remonté à la résolution de la photo. L'agrandissement
 * bilinéaire étale déjà le bord sur une quinzaine de pixels de sortie ; ce qu'on
 * ajoute ici élargit légèrement cette rampe, sans la remplacer.
 *
 * L'unité est le pixel **du masque** pour une raison précise : un flou exprimé
 * en pixels de sortie vaudrait quinze fois moins à 1080 px qu'à 4000 px, et
 * donnerait donc deux rendus différents pour la même intention. `featherRadius()`
 * fait la conversion, et c'est elle qui est testée.
 *
 * **Valeur de départ, pas valeur mesurée.** Elle se juge sur appareil, en
 * comparant 0, 0,5 et 1,5 — c'est ce que le banc existe pour trancher.
 */
export const MEDIAPIPE_FEATHER_PX = 0.5;

/**
 * Transformers.js produit déjà un masque pondéré, et travaille à 1024 px : le
 * flouter n'ajouterait rien et mangerait un peu de définition au contour.
 */
export function defaultFeather(model: CutoutModel): number {
  return model.runtime === 'mediapipe' ? MEDIAPIPE_FEATHER_PX : 0;
}

/**
 * Le rayon de flou à appliquer, en pixels de la **photo**.
 *
 * Un rayon nul reste nul : une dimension absente ou nulle ne doit pas produire
 * un flou arbitraire, et un masque de largeur inconnue ne se convertit pas.
 */
export function featherRadius(
  maskEdge: number,
  outputEdge: number,
  featherInMaskPx: number,
): number {
  if (!(maskEdge > 0) || !(outputEdge > 0) || !(featherInMaskPx > 0)) return 0;
  return featherInMaskPx * (outputEdge / maskEdge);
}

/**
 * L'avertissement à afficher avant d'utiliser un modèle, ou `null` si rien ne
 * s'y oppose.
 *
 * Il ne reste qu'une raison de refuser, et c'est la bonne : une licence qui **ne
 * couvre pas** l'usage commercial. C'est une décision d'affaires, elle survit à
 * l'implémentation, et c'est celle qu'on oublie.
 *
 * Il y avait ici une seconde branche — « ce modèle n'est pas encore exécutable » —
 * du temps où le moteur MediaPipe n'existait pas. Elle a été retirée avec le
 * champ qui la nourrissait : une garde qui ne peut plus se déclencher ne protège
 * rien, elle rassure. Le risque qu'elle couvrait est désormais pris à la
 * compilation, par l'aiguillage exhaustif de `runCutout()`.
 */
export function modelWarning(model: CutoutModel): string | null {
  if (model.commercialUse) return null;
  return (
    `« ${model.label} » est distribué sous ${model.licence} : ` +
    "ne pas l'activer en production sans accord écrit."
  );
}

/* ------------------------------------------------------------------ */
/* Le coût réel d'un moteur — le poste qu'on oublie                   */
/* ------------------------------------------------------------------ */

/**
 * Ce que le **moteur** coûte à télécharger, indépendamment du modèle.
 *
 * C'est le poste dominant, et c'est contre-intuitif : le modèle fait 243 Ko à
 * 6,6 Mo, le moteur 12,2 à 21,6 Mo. Comparer les modèles entre eux sans regarder
 * le moteur revient à comparer le prix d'un pneu sans regarder la voiture.
 *
 * **Ce qui est compté, exactement : le binaire WASM.** Les tailles sont relevées
 * sur les paquets publiés (`size` des fichiers `.wasm` chez jsDelivr), pas
 * estimées. Ce qui n'est **pas** compté : la colle JavaScript du moteur — 156 Ko
 * pour MediaPipe, environ 570 Ko plus le chargeur d'ONNX Runtime pour
 * Transformers.js. L'omettre des deux côtés sous-estime donc un peu le second,
 * c'est-à-dire l'option la plus lourde : la comparaison est conservatrice dans le
 * bon sens.
 *
 * `min` et `max` encadrent les variantes que le navigateur peut tirer selon son
 * support SIMD et selon qu'il utilise le moteur WebGPU.
 */
export interface CutoutRuntimeCost {
  runtime: CutoutRuntime;
  label: string;
  minWasmBytes: number;
  maxWasmBytes: number;
  /**
   * Le **même jeu** de variantes, compressé — ce qui passe réellement sur le
   * réseau. Ce ne sont pas les mêmes variantes aux mêmes bornes : voir plus bas.
   *
   * Cette distinction n'est pas cosmétique, et c'est une mesure qui l'a imposée.
   * Le 2026-10-10, le banc exécuté pour la première fois a rapporté **3,5 Mo**
   * transférés là où `firstLoadBytes()` en annonçait **11,8** : jsDelivr sert le
   * WASM en **brotli** (`Content-Encoding: br`), et `Content-Length` tombe de
   * 12 168 316 à 3 501 230. Le budget de données d'un participant se paie sur le
   * second chiffre, pas sur le premier — comparer un fichier décompressé à un
   * forfait mobile, c'est se tromper de 3,5×.
   *
   * **Piège, et il est réel.** `min`/`max` sont deux bornes indépendantes par
   * colonne, pas deux colonnes appariées : le fichier le plus petit sur le disque
   * (SIMD, 12 168 316) est le plus gros sur le fil (3 501 230), et l'inverse.
   * Lire `minWasmBytes` et `minWasmTransferBytes` comme « la même variante » est
   * donc faux. Sans conséquence ici — l'écart de transfert entre variantes est de
   * 103 Ko, et le verdict de budget est le même des deux côtés — mais la phrase
   * serait fausse, et elle induirait en erreur au prochain arbitrage.
   */
  minWasmTransferBytes: number;
  maxWasmTransferBytes: number;
  /**
   * La colle JavaScript du moteur, compressée elle aussi. Petite devant le WASM,
   * mais comptée : sur un budget, sous-estimer est la mauvaise direction.
   */
  jsTransferBytes: number;
  note: string;
}

export const CUTOUT_RUNTIME_COSTS: readonly CutoutRuntimeCost[] = [
  {
    runtime: 'mediapipe',
    label: 'MediaPipe Tasks Vision',
    /*
     * `vision_wasm_nosimd_internal.wasm` → `vision_wasm_internal.wasm`.
     * La bibliothèque choisit elle-même selon le support SIMD. Pas de variante
     * WebGPU à tirer, donc pas de binaire qui double de taille.
     */
    minWasmBytes: 12_168_316,
    maxWasmBytes: 12_997_248,
    /*
     * Et ici, un détail que seule la mesure révèle : **l'ordre s'inverse**.
     * Le binaire non-SIMD est le plus gros décompressé (12 997 248) mais le plus
     * petit compressé (3 398 378) — il compresse mieux. Supposer que « min »
     * décompressé reste « min » transféré aurait donné un budget faux.
     */
    minWasmTransferBytes: 3_398_378,
    maxWasmTransferBytes: 3_501_230,
    /* `vision_bundle.mjs` 45 147 + `vision_wasm_internal.js` 81 673, en brotli. */
    jsTransferBytes: 126_820,
    note:
      'Un seul WASM, choisi par la bibliothèque selon le support SIMD. Pas de ' +
      'moteur WebGPU à tirer, donc pas de variante qui double le poids. Servi en ' +
      'brotli : 12,2 Mo sur le disque, 3,4 Mo sur le réseau.',
  },
  {
    runtime: 'transformers',
    label: 'ONNX Runtime Web',
    /*
     * `ort-wasm-simd-threaded.jsep.wasm` — la variante que Transformers.js 3.7.6
     * embarque, et **la seule** du paquet : il n'y a pas de variante plus légère
     * à tirer côté navigateur. Le `min` ci-dessus vient du paquet autonome
     * `onnxruntime-web`, pas de celui-ci.
     */
    minWasmBytes: 14_239_897,
    maxWasmBytes: 21_596_019,
    minWasmTransferBytes: 4_110_288,
    maxWasmTransferBytes: 4_110_288,
    /* `transformers.min.js` en brotli — borne haute, le build navigateur est plus petit. */
    jsTransferBytes: 220_141,
    note:
      'Un seul WASM dans le paquet embarqué (jsep), 21,6 Mo décompressé, ' +
      '4,1 Mo en brotli. C’est le prix de la qualité de contour de MODNet.',
  },
];

export function runtimeCost(runtime: CutoutRuntime): CutoutRuntimeCost | undefined {
  return CUTOUT_RUNTIME_COSTS.find((cost) => cost.runtime === runtime);
}

/**
 * Ce qu'un premier détourage coûte réellement sur le réseau : moteur + modèle.
 *
 * `worstCase` prend la variante la plus lourde du moteur — utile pour se placer
 * du point de vue d'un appareil qui a WebGPU et tirera le gros WASM.
 */
export function firstLoadBytes(model: CutoutModel, worstCase = false): number {
  const cost = runtimeCost(model.runtime);
  const wasm = cost ? (worstCase ? cost.maxWasmBytes : cost.minWasmBytes) : 0;
  return wasm + model.approxBytes;
}

/**
 * Ce que le participant **paie**, en octets réellement transférés.
 *
 * C'est ce chiffre-là qui se compare à un forfait mobile, et donc au budget
 * (`exceedsMobileBudget`). `firstLoadBytes()` reste utile — c'est la taille que
 * le navigateur doit matérialiser — mais il ne faut pas le confondre avec une
 * consommation de données : entre les deux, il y a un facteur 3,5 sur MediaPipe.
 *
 * **Ce qui est compté :** le WASM du moteur, sa colle JavaScript, et les poids
 * du modèle — tous mesurés avec `Accept-Encoding: br` le 2026-10-10. Les poids
 * sont servis **sans compression** (vérifié : `selfie_segmenter.tflite` et
 * `model_quantized.onnx` arrivent sans `Content-Encoding`), donc `approxBytes`
 * les décrit exactement.
 *
 * **Ce qui ne l'est pas :** le reste du parcours (la page, la photo, l'export).
 * Et une réserve qui compte : la compression dépend du CDN **et** du réseau du
 * participant. Un intermédiaire qui ne négocie pas brotli ramène le transfert à
 * la taille décompressée — soit 12,2 Mo pour MediaPipe. C'est le pire cas réel,
 * et il est visible dans `firstLoadBytes()`.
 */
export function firstLoadTransferBytes(model: CutoutModel, worstCase = false): number {
  const cost = runtimeCost(model.runtime);
  if (!cost) return model.approxBytes;
  const wasm = worstCase ? cost.maxWasmTransferBytes : cost.minWasmTransferBytes;
  return wasm + cost.jsTransferBytes + model.approxBytes;
}

/* ------------------------------------------------------------------ */
/* Les trois arbitrages, tranchés le 2026-10-10                       */
/* ------------------------------------------------------------------ */

/*
 * Ces trois décisions étaient ouvertes au §7 du plan. Elles sont écrites ici,
 * et non seulement dans un document, pour la même raison que le coût : ce sont
 * des règles qu'un geste du parcours doit pouvoir lire au moment où il décide.
 */

/**
 * Délai au-delà duquel on cesse d'attendre l'appareil et on **propose** le
 * serveur. Cinq secondes.
 *
 * « Propose », pas « bascule » : le recours au serveur suppose l'accord du
 * participant, parce qu'il fait sortir sa photo de son appareil — c'est-à-dire
 * exactement la promesse que le détourage sur l'appareil existe pour tenir.
 * Dépasser ce délai n'autorise donc rien ; cela ouvre une question.
 */
export const ABANDON_AFTER_MS = 5_000;

export function shouldOfferServerFallback(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= ABANDON_AFTER_MS;
}

/**
 * Budget de données d'un transfert mobile **sans accord explicite** : 10 Mo.
 *
 * Unité **décimale** (1 Mo = 1 000 000 o) : c'est celle dans laquelle un
 * participant lit sa consommation mobile. Le seuil est donc plus strict que s'il
 * était compté en Mio — et il l'est à dessein.
 *
 * Attention, ce budget ne dit pas « on télécharge jusqu'à 10 Mo sans rien
 * demander » : il dit à partir de quand **on demande**.
 *
 * **Ce que la mesure a changé (2026-10-10).** Ce seuil se comparait d'abord à
 * `firstLoadBytes()` — la taille décompressée. C'était faux d'un facteur 3,5 :
 * MediaPipe annonçait 12,4 Mo là où le réseau transporte 3,8 Mo. Le verdict
 * s'inversait : le moteur **retenu** était déclaré hors budget et MODNet, plus
 * lourd, n'était pas distingué de lui. Ce budget se lit désormais sur
 * `firstLoadTransferBytes()`.
 *
 * Conséquence assumée : **MediaPipe entre dans le budget** (3,77 Mo, et 3,88 Mo
 * au pire) ; **MODNet en sort** (10,96 Mo). Un transfert sous le seuil ne
 * déclenche donc aucune demande d'accord — c'est le cas du moteur retenu.
 */
export const MOBILE_TRANSFER_BUDGET_BYTES = 10_000_000;

export function exceedsMobileBudget(model: CutoutModel, worstCase = false): boolean {
  return firstLoadTransferBytes(model, worstCase) > MOBILE_TRANSFER_BUDGET_BYTES;
}

/**
 * Faut-il l'accord du participant avant de télécharger le moteur ?
 *
 * Oui dès que la connexion est **facturée au volume** et que le transfert sort
 * du budget. Sur une connexion non facturée, on ne demande rien : solliciter
 * pour rien est la meilleure façon d'entraîner quelqu'un à accepter sans lire.
 *
 * `metered` est un paramètre, pas une lecture de `navigator.connection` : la
 * règle reste testable sans navigateur, comme `detectWebGpu()`.
 */
export function downloadNeedsConsent(model: CutoutModel, metered: boolean): boolean {
  return metered === true && exceedsMobileBudget(model);
}

/**
 * La seule partie de `navigator.connection` dont ce module a besoin.
 *
 * `NetworkInformation` n'est pas dans les types DOM standard de toutes les
 * versions de TypeScript, et ce module n'importe rien : la forme est donc
 * déclarée ici, structurellement, comme pour `GpuLike`.
 */
export interface ConnectionLike {
  /** Le participant a demandé à économiser ses données. */
  saveData?: boolean;
  /** `'cellular'`, `'wifi'`, `'ethernet'`… — Chrome sur Android seulement. */
  type?: string;
}

/**
 * La connexion est-elle **facturée au volume** ?
 *
 * Seuls deux signaux sont lus, et c'est délibéré : `saveData` (une intention
 * explicite du participant) et `type === 'cellular'` (une déclaration de
 * facturation). Les deux disent quelque chose sur **l'argent**, pas sur la
 * vitesse.
 *
 * **Ce qui n'est pas lu, et pourquoi :** `effectiveType` (`'3g'`, `'4g'`…)
 * décrit un débit. S'en servir pour deviner une facturation serait une
 * inférence, et une inférence fausse dans les deux sens : elle déclencherait une
 * demande sur un wifi lent, et l'omettrait sur une 4G facturée — qui est
 * justement le cas courant. Le module préfère ne rien affirmer.
 *
 * **La conséquence assumée :** `type` n'existe pas sur Safari, donc sur iPhone
 * cette fonction répond `false` même en itinérance. Le trou est connu et il est
 * nommé ici plutôt que masqué par un repli approximatif.
 *
 * `connection` est un paramètre, jamais une lecture directe de `navigator` :
 * c'est ce qui rend la règle testable sans navigateur, comme `detectWebGpu()`.
 */
export function isMeteredConnection(connection?: ConnectionLike | null): boolean {
  if (!connection) return false;
  if (connection.saveData === true) return true;
  return connection.type === 'cellular';
}

/* ------------------------------------------------------------------ */
/* Où exécuter                                                        */
/* ------------------------------------------------------------------ */

/** La seule partie de `navigator.gpu` dont ce module a besoin. */
export interface GpuLike {
  requestAdapter(): Promise<unknown>;
}

/**
 * L'appareil expose-t-il un adaptateur WebGPU exploitable ?
 *
 * La question n'est **pas** « le navigateur connaît-il `navigator.gpu` » : un
 * navigateur peut exposer l'API et n'avoir aucun adaptateur (pilote absent,
 * matériel trop ancien, contexte non sécurisé). On demande donc réellement un
 * adaptateur, et on traite l'échec comme une absence — jamais comme une erreur
 * remontée au participant.
 *
 * `gpu` est un paramètre plutôt qu'une lecture directe de `navigator` : c'est ce
 * qui rend la décision testable sans navigateur.
 */
export async function detectWebGpu(gpu?: GpuLike | null): Promise<boolean> {
  if (!gpu || typeof gpu.requestAdapter !== 'function') return false;
  try {
    return (await gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
}

/** Le chemin retenu, à partir de la disponibilité réelle. */
export function chooseDevice(webgpuAvailable: boolean): CutoutDevice {
  return webgpuAvailable ? 'webgpu' : 'wasm';
}

/** Le nom du chemin, tel qu'il apparaîtra dans le tableau de mesures. */
export function deviceLabel(device: CutoutDevice): string {
  if (device === 'webgpu') return 'WebGPU';
  if (device === 'webgl') return 'WebGL (délégué GPU)';
  return 'WASM (repli)';
}

/* ------------------------------------------------------------------ */
/* Préparation de l'entrée                                            */
/* ------------------------------------------------------------------ */

/**
 * Dimension maximale du plus grand côté envoyé au modèle.
 *
 * Ce n'est pas une limite du modèle mais un **arbitrage de temps** : le coût de
 * l'inférence croît plus vite que la surface, et une photo de téléphone fait
 * couramment 4000 px de côté. Au-delà de 1024, on paie des secondes pour un
 * gain invisible — le sujet détouré finit de toute façon à la taille de la zone.
 */
export const MAX_INPUT_EDGE = 1024;

/** En-deçà, il n'y a plus assez de matière pour détourer proprement. */
export const MIN_INPUT_EDGE = 128;

export interface InputSize {
  width: number;
  height: number;
  /** Facteur appliqué. 1 = l'image part telle quelle. */
  scale: number;
  /** Vrai si l'image a été réduite. */
  resized: boolean;
}

/**
 * La taille à envoyer au modèle.
 *
 * Règles, dans cet ordre :
 *  - on **n'agrandit jamais** — agrandir n'ajoute aucune information, coûte du
 *    temps et donne au participant l'illusion d'un traitement plus soigné ;
 *  - on réduit le plus grand côté à `MAX_INPUT_EDGE`, en conservant le rapport ;
 *  - une dimension nulle ou négative est laissée telle quelle plutôt que
 *    corrigée : c'est au code appelant de refuser une image sans dimensions, et
 *    inventer une taille ici masquerait le vrai problème.
 */
export function inputSize(width: number, height: number): InputSize {
  if (!(width > 0) || !(height > 0)) {
    return { width, height, scale: 1, resized: false };
  }

  const longest = Math.max(width, height);
  if (longest <= MAX_INPUT_EDGE) {
    return { width, height, scale: 1, resized: false };
  }

  const scale = MAX_INPUT_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
    resized: true,
  };
}

/* ------------------------------------------------------------------ */
/* Le résultat est-il exploitable ?                                   */
/* ------------------------------------------------------------------ */

/** Un pixel est « opaque » au-delà de ce canal alpha (0–255). */
export const OPAQUE_ALPHA = 24;

export type CutoutVerdict = 'ok' | 'faible' | 'vide' | 'plein';

/** Au-delà, le masque n'a rien retiré : le détourage n'a pas eu lieu. */
export const VERDICT_FULL = 0.98;
/** En-deçà, il a tout retiré : il n'y a plus de sujet. */
export const VERDICT_EMPTY = 0.02;
/** En-deçà, le sujet est suspicieusement petit — probablement un faux positif. */
export const VERDICT_THIN = 0.08;

export interface CutoutQuality {
  verdict: CutoutVerdict;
  /** Part de pixels opaques, 0–1. */
  opaqueRatio: number;
  message: string;
}

/**
 * Part des pixels réellement opaques dans un canal alpha.
 *
 * `data` est un tableau RGBA (4 octets par pixel). On ne lit que le canal alpha,
 * tous les 4 octets — c'est la seule chose qui distingue un détourage réussi
 * d'un échec, et c'est aussi ce qui permet de le dire **au participant** au lieu
 * de lui livrer un PNG vide sans explication.
 */
export function measureOpaqueRatio(data: ArrayLike<number>, alphaThreshold = OPAQUE_ALPHA): number {
  const pixels = Math.floor(data.length / 4);
  if (pixels === 0) return 0;

  let opaque = 0;
  for (let i = 3; i < pixels * 4; i += 4) {
    if (data[i] > alphaThreshold) opaque += 1;
  }
  return opaque / pixels;
}

/**
 * Le verdict sur un détourage, à partir de la part opaque.
 *
 * Les trois échecs ne sont pas équivalents et ne se disent pas de la même façon :
 * un masque **plein** signifie que le modèle n'a rien vu à retirer, un masque
 * **vide** qu'il a tout retiré, un masque **maigre** qu'il a probablement
 * détouré un détail. Les confondre priverait le participant de la seule
 * information qui lui permette de réessayer utilement.
 */
export function judgeCutout(opaqueRatio: number): CutoutQuality {
  if (opaqueRatio >= VERDICT_FULL) {
    return {
      verdict: 'plein',
      opaqueRatio,
      message:
        "Rien n'a été détouré : le sujet occupe toute l'image. " +
        'Essayez une photo où la personne se détache du fond.',
    };
  }
  if (opaqueRatio <= VERDICT_EMPTY) {
    return {
      verdict: 'vide',
      opaqueRatio,
      message:
        "Aucun sujet n'a été détecté. Essayez une photo où la personne est " +
        'entière et bien éclairée.',
    };
  }
  if (opaqueRatio < VERDICT_THIN) {
    return {
      verdict: 'faible',
      opaqueRatio,
      message:
        'Le sujet détecté est très petit. Vérifiez le résultat — ' +
        'vous pouvez réessayer avec une autre photo.',
    };
  }
  return { verdict: 'ok', opaqueRatio, message: 'Sujet détecté.' };
}

/**
 * Ce qu'on fait d'un résultat de détourage — et c'est une décision, pas une
 * impression.
 *
 * `judgeCutout()` **décrit** (quatre verdicts) ; cette fonction **tranche** (trois
 * issues). Séparer les deux permet de régler la sévérité sans toucher au
 * diagnostic, et surtout de tester la règle sans navigateur.
 *
 * - **`unusable`** — le masque a tout retiré (`vide`). Afficher ce résultat
 *   donnerait une image blanche : le participant croirait que son envoi a
 *   échoué. On garde donc la photo d'origine et on propose de réessayer.
 * - **`warn`** — utilisable, mais le participant doit le savoir. Deux cas très
 *   différents : `plein` (rien n'a été détouré, l'image est celle d'origine — le
 *   fond n'a pas disparu) et `faible` (le sujet détecté est minuscule, donc
 *   probablement un faux positif). Dans les deux, le résultat *s'affiche* : le
 *   refuser priverait le participant d'un visuel qu'il peut vouloir garder.
 * - **`ok`** — rien à signaler.
 *
 * Le cas `plein` mérite d'être explicite parce qu'il est **silencieux** : l'image
 * paraît normale, et sans message le participant croirait que le fond a été
 * retiré alors qu'il ne l'a pas été.
 */
export type CutoutOutcome = 'ok' | 'warn' | 'unusable';

export function cutoutOutcome(quality: CutoutQuality): CutoutOutcome {
  if (quality.verdict === 'vide') return 'unusable';
  if (quality.verdict === 'plein' || quality.verdict === 'faible') return 'warn';
  return 'ok';
}

/* ------------------------------------------------------------------ */
/* Ce qui a échoué, dit au participant                                */
/* ------------------------------------------------------------------ */

const MESSAGE_OOM =
  "Votre appareil n'a pas assez de mémoire pour le détourage. " +
  'Fermez d’autres applications, puis réessayez.';
const MESSAGE_TIMEOUT = 'Le détourage a pris trop de temps. Réessayez.';
const MESSAGE_NETWORK =
  "Le modèle de détourage n'a pas pu être téléchargé. " +
  'Vérifiez votre connexion, puis réessayez.';
const MESSAGE_GPU =
  "Le détourage n'a pas pu démarrer sur cet appareil. " +
  'Vous pouvez publier votre photo telle quelle.';
const MESSAGE_IMAGE =
  "Cette image n'a pas pu être préparée pour le détourage. " +
  'Essayez un autre fichier.';
const MESSAGE_GENERIC =
  'Le détourage a échoué. Vous pouvez réessayer, ou publier votre photo telle quelle.';

/**
 * La **raison normalisée** d'une panne — six valeurs, jamais un message.
 *
 * Pourquoi une seconde fonction à côté de `cutoutErrorMessage()` : le message
 * est destiné au participant, la raison est destinée à la mesure. Un message
 * d'erreur est du **texte libre** — il contient des noms de fichiers, des URL,
 * parfois un extrait de la donnée fautive. Le transmettre pour compter les
 * échecs serait la façon la plus banale de faire sortir une donnée du parcours.
 * La raison, elle, est une valeur fermée : elle se compte, elle ne se lit pas.
 *
 * Les deux fonctions partagent le **même** classifieur, donc elles ne peuvent pas
 * diverger : une panne annoncée « vérifiez votre connexion » ne sera jamais
 * comptée comme un manque de mémoire.
 */
export type CutoutFailureReason =
  | 'memory'
  | 'timeout'
  | 'network'
  | 'gpu'
  | 'image'
  | 'unknown';

/** Le message d'erreur, en minuscules. Chaîne vide si l'entrée n'en porte pas. */
function rawMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return raw.toLowerCase();
}

/**
 * Classe une panne. L'ordre des motifs compte : « out of memory » avant
 * « fetch », parce qu'un échec de chargement de poids par manque de mémoire
 * contient souvent les deux.
 *
 * `oom` est ancré par des limites de mot : sans elles, il se déclenche sur
 * `boom`, `room` ou `zoom` — et une panne inconnue serait annoncée au
 * participant comme un manque de mémoire, c'est-à-dire par un geste inutile.
 * Le harnais a trouvé ce défaut avant la production ; l'assertion le garde.
 */
export function cutoutFailureReason(error: unknown): CutoutFailureReason {
  const message = rawMessage(error);
  if (/out of memory|\boom\b|allocation failed|memory limit|array buffer/.test(message)) {
    return 'memory';
  }
  if (/timed? ?out|timeout|délai/.test(message)) return 'timeout';
  if (/offline|network|fetch|failed to load|load failed|econn|import\(/.test(message)) {
    return 'network';
  }
  if (/webgpu|adapter|device lost|\bgpu\b/.test(message)) return 'gpu';
  if (/decode|bitmap|image/.test(message)) return 'image';
  return 'unknown';
}

/**
 * Traduit une panne en message actionnable.
 *
 * Le participant n'a aucun moyen d'agir sur une pile d'appels. Ce qui l'aide,
 * c'est de savoir **quoi faire** : vérifier sa connexion, fermer des
 * applications, réessayer, ou continuer sans détourage. Chaque message finit
 * donc par un geste.
 *
 * Le message est **déduit de la raison**, et non classé une seconde fois : deux
 * classifieurs qui se ressemblent finissent par ne plus dire la même chose.
 */
const MESSAGE_PAR_RAISON: Readonly<Record<CutoutFailureReason, string>> = {
  memory: MESSAGE_OOM,
  timeout: MESSAGE_TIMEOUT,
  network: MESSAGE_NETWORK,
  gpu: MESSAGE_GPU,
  image: MESSAGE_IMAGE,
  unknown: MESSAGE_GENERIC,
};

export function cutoutErrorMessage(error: unknown): string {
  return MESSAGE_PAR_RAISON[cutoutFailureReason(error)];
}

/* ------------------------------------------------------------------ */
/* Les mesures                                                        */
/* ------------------------------------------------------------------ */

export interface CutoutMeasurements {
  /** Horodatage ISO, pour ordonner le tableau. */
  at: string;
  device: CutoutDevice;
  /** Appareil et navigateur, saisi dans le banc — « Pixel 6a / Chrome 126 ». */
  deviceLabel: string;
  modelId: string;
  /**
   * Version de Transformers.js **lue dans le module chargé**, pas déduite de
   * l'URL. Une mesure sans la version de la bibliothèque n'est pas reproductible,
   * et une URL ne prouve pas ce qui a réellement tourné.
   */
  libraryVersion: string;
  /** Téléchargement et initialisation du modèle, en ms. */
  loadMs: number;
  /** Inférence seule, en ms. */
  inferenceMs: number;
  /** Total perçu, en ms. */
  totalMs: number;
  inputWidth: number;
  inputHeight: number;
  outputWidth: number;
  outputHeight: number;
  /** Octets réellement transférés pour le modèle, si le navigateur les expose. */
  transferredBytes: number | null;
  /** Mémoire JS après inférence, en octets — `null` si l'API n'existe pas. */
  memoryBytes: number | null;
  opaqueRatio: number;
  verdict: CutoutVerdict;
}

/* ------------------------------------------------------------------ */
/* Ce que le participant paie sur son forfait                         */
/* ------------------------------------------------------------------ */

/**
 * Une entrée de `performance.getEntriesByType('resource')`.
 *
 * Seuls ces champs servent, et ils sont nommés tels que le navigateur les
 * nomme — la fonction ci-dessous reste ainsi testable avec de simples objets.
 */
export interface ResourceEntryLike {
  name: string;
  /** Octets sur le réseau, en-têtes compris. **0 signifie « servi du cache ».** */
  transferSize?: number;
  /** Octets compressés du corps, hors en-têtes. */
  encodedBodySize?: number;
}

/**
 * Octets réellement transférés pour les ressources dont l'URL contient `match`.
 *
 * C'est le chiffre qui manquait : sur un forfait mobile, télécharger 6 Mo de
 * poids est souvent le coût dominant — bien plus que les quelques secondes
 * d'inférence. Sans lui, le tableau de mesures dirait « c'est rapide » sans dire
 * « au prix de combien de données ».
 *
 * Deux subtilités, et elles décident de la valeur du chiffre :
 *  - `transferSize === 0` avec un `encodedBodySize` renseigné veut dire **servi
 *    depuis le cache**. On compte donc 0, et non la taille du corps : c'est la
 *    vérité du second chargement, qui est justement le cas qu'on veut connaître.
 *  - aucun fichier correspondant ⇒ `null`, et non `0`. « Je n'ai rien vu passer »
 *    et « il n'y a rien eu à télécharger » ne sont pas la même information ; les
 *    confondre ferait croire à un modèle gratuit.
 */
export function sumTransferredBytes(
  entries: readonly ResourceEntryLike[],
  match: string,
): number | null {
  let total = 0;
  let seen = false;

  for (const entry of entries) {
    if (!entry.name.includes(match)) continue;
    seen = true;
    if (typeof entry.transferSize === 'number') total += entry.transferSize;
    else if (typeof entry.encodedBodySize === 'number') total += entry.encodedBodySize;
  }

  return seen ? total : null;
}

/**
 * Le poids total téléchargé pour un modèle donné, tous ses hôtes confondus.
 *
 * Un modèle ne vient pas forcément d'un seul domaine — les poids MediaPipe
 * arrivent de `storage.googleapis.com` et la bibliothèque de `cdn.jsdelivr.net`.
 * Mesurer un seul hôte sous-estimerait le coût réel, et c'est précisément le
 * chiffre sur lequel se décide « est-ce qu'on peut se le permettre ? ».
 */
export function transferredForModel(
  entries: readonly ResourceEntryLike[],
  model: CutoutModel,
): number | null {
  let total = 0;
  let seen = false;

  for (const host of model.hosts) {
    const bytes = sumTransferredBytes(entries, host);
    if (bytes !== null) {
      total += bytes;
      seen = true;
    }
  }

  return seen ? total : null;
}

/**
 * Affiche une taille en **unités décimales** : 1 Ko = 1 000 o, 1 Mo = 1 000 000 o.
 *
 * Ce n'est pas un détail d'affichage, et c'est la même leçon que le budget : le
 * module compte en décimal (voir `MOBILE_TRANSFER_BUDGET_BYTES`), et les libellés
 * des assertions sont écrits en décimal (« 12,2 Mo de moteur » pour 12 168 316 o).
 * Diviser par 1 024 en gardant l'étiquette « Mo » aurait donc affiché **9,5 Mo**
 * pour un budget de 10 Mo — un chiffre faux, du même genre que celui qui a coûté
 * un facteur 3,5 sur le transfert. Si un jour on veut du binaire, la seule
 * façon honnête est de l'étiqueter « Mio ».
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1000) return `${bytes} o`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} Ko`;
  return `${(bytes / (1000 * 1000)).toFixed(1)} Mo`;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Les colonnes du tableau de mesures, dans l'ordre d'export. */
export const MEASUREMENT_COLUMNS: readonly { key: keyof CutoutMeasurements; label: string }[] = [
  { key: 'at', label: 'horodatage' },
  { key: 'deviceLabel', label: 'appareil' },
  { key: 'device', label: 'chemin' },
  { key: 'modelId', label: 'modele' },
  { key: 'libraryVersion', label: 'bibliotheque' },
  { key: 'loadMs', label: 'chargement_ms' },
  { key: 'inferenceMs', label: 'inference_ms' },
  { key: 'totalMs', label: 'total_ms' },
  { key: 'inputWidth', label: 'entree_l' },
  { key: 'inputHeight', label: 'entree_h' },
  { key: 'outputWidth', label: 'sortie_l' },
  { key: 'outputHeight', label: 'sortie_h' },
  { key: 'transferredBytes', label: 'octets_transferes' },
  { key: 'memoryBytes', label: 'memoire_octets' },
  { key: 'opaqueRatio', label: 'part_opaque' },
  { key: 'verdict', label: 'verdict' },
];

/**
 * Une cellule CSV.
 *
 * Le séparateur est le point-virgule : c'est ce qu'attend un tableur configuré
 * en français, et cela évite de casser les décimales à la virgule. Les guillemets
 * sont tout de même doublés — un libellé d'appareil saisi à la main contient
 * facilement un guillemet ou un point-virgule.
 */
function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Le tableau de mesures en CSV.
 *
 * C'est le livrable de la phase 1 : sans lui, la mesure reste une impression
 * affichée à l'écran d'un téléphone. Avec lui, elle se compare entre appareils
 * et se relit plus tard.
 */
export function measurementsToCsv(rows: readonly CutoutMeasurements[]): string {
  const header = MEASUREMENT_COLUMNS.map((column) => column.label).join(';');
  const lines = rows.map((row) =>
    MEASUREMENT_COLUMNS.map((column) => csvCell(row[column.key])).join(';'),
  );
  return [header, ...lines].join('\n');
}

/* ------------------------------------------------------------------ */
/* L'exécution — navigateur uniquement                                */
/* ------------------------------------------------------------------ */

/**
 * D'où vient Transformers.js.
 *
 * **Choix de banc, pas de production.** Le dépôt a des dépendances volontairement
 * légères et le modèle n'est pas encore tranché : charger la bibliothèque depuis
 * un CDN évite d'inscrire dans `package.json` un paquet lourd qu'on retirerait
 * peut-être. Une fois la décision prise, l'intégration pourra la **regrouper**
 * dans le bundle — et devra alors élargir la CSP, ce que le CDN ne dispense pas
 * de faire pour les poids du modèle.
 *
 * La version est **épinglée** : jsdelivr sert bien un module ESM exposant
 * `pipeline` (vérifié), mais la mesure ne s'en remet pas à cette vérification —
 * `cutoutPhoto()` lit `env.version` dans le module chargé et l'inscrit dans le
 * tableau. C'est la version qui a tourné qui compte, pas celle de l'URL.
 */
export const TRANSFORMERS_CDN =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';

/**
 * D'où vient MediaPipe Tasks Vision.
 *
 * Même raisonnement que ci-dessus, et un avantage propre : MediaPipe charge son
 * propre WASM, **sans ONNX Runtime**, donc sans les 13,9 à 27,6 Mo que
 * Transformers.js traîne derrière lui. C'est là que se joue l'essentiel de
 * l'économie — bien plus que dans le modèle lui-même.
 *
 * `wasm/` est le dossier que `FilesetResolver` attend : il y choisit lui-même la
 * variante SIMD ou non selon ce que le navigateur annonce.
 */
export const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0';
export const MEDIAPIPE_WASM = `${MEDIAPIPE_CDN}/wasm`;

/** L'adresse des poids, telle que Google la publie. */
export const MEDIAPIPE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/' +
  'selfie_segmenter/float16/latest/selfie_segmenter.tflite';

/** Ce que le détourage attend en entrée. Structurellement compatible avec `ParticipantPhoto`. */
export interface CutoutSource {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface CutoutProgress {
  stage: 'model' | 'inference';
  message: string;
  /** 0–1 quand la progression est connue. */
  ratio?: number;
}

export interface CutoutResult {
  /** PNG en data URL, **avec canal alpha**. */
  src: string;
  width: number;
  height: number;
  quality: CutoutQuality;
  measurements: CutoutMeasurements;
}

export interface CutoutOptions {
  /**
   * Force un modèle. **Absent, la stratégie à deux étages décide**
   * (`chooseModel()`), à partir de l'adaptateur réellement accordé — c'est le
   * cas normal, et le banc est le seul endroit qui a besoin de forcer.
   */
  modelId?: string;
  /**
   * Journalise chaque étape du détourage dans la console — **désactivé par
   * défaut, jamais activé en production**.
   *
   * Raison d'être : `cutoutPhoto()` traduit toute panne en six messages
   * actionnables, ce qui est le bon contrat pour le participant et un mauvais
   * outil de diagnostic. Quand le réseau est joignable et que le message dit
   * pourtant « le modèle n'a pas pu être téléchargé », la cause interne est
   * invisible. Ce drapeau l'expose sans jamais changer ce que voit le
   * participant.
   */
  debug?: boolean;
  /** Renseigné par le banc ; la production le lira du contexte. */
  deviceLabel?: string;
  /**
   * Adoucissement du bord du masque, en pixels. Absent, la valeur recommandée
   * pour le moteur est appliquée (`defaultFeather()`).
   */
  featherPx?: number;
  onProgress?: (progress: CutoutProgress) => void;
}

let transformersPromise: Promise<TransformersModule> | null = null;

interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    options: Record<string, unknown>,
  ) => Promise<(input: unknown) => Promise<unknown>>;
  RawImage: new (data: unknown, width: number, height: number, channels: number) => unknown;
  /** Renseigné par la bibliothèque elle-même — c'est ce qui rend la mesure traçable. */
  env?: { version?: string };
}

/**
 * Charge Transformers.js **une fois**, à la première demande.
 *
 * Paresseux et mémoïsé : le parcours participant ne doit rien payer tant que le
 * participant n'a pas choisi sa photo. La promesse est mémorisée, pas le module —
 * deux appels simultanés partagent donc le même chargement.
 */
export async function loadTransformers(): Promise<TransformersModule> {
  if (!transformersPromise) {
    transformersPromise = import(/* webpackIgnore: true */ TRANSFORMERS_CDN).then(
      (module) => module as unknown as TransformersModule,
    );
  }
  try {
    return await transformersPromise;
  } catch (error) {
    // Un échec réseau ne doit pas être mémorisé : sinon le participant qui
    // retrouve du réseau ne pourrait plus jamais réessayer sans recharger.
    transformersPromise = null;
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* MediaPipe — le chemin économe                                      */
/* ------------------------------------------------------------------ */

/**
 * Ce que ce module attend de `@mediapipe/tasks-vision`.
 *
 * Déclaré structurellement, comme pour Transformers.js : le module reste sans
 * `import` et donc compilable seul, et le banc mesure le même fichier que
 * l'application. Les types de la bibliothèque ne sont pas nécessaires — seuls
 * ces trois points d'entrée sont utilisés.
 */
export interface MediapipeModule {
  FilesetResolver: {
    forVisionTasks: (wasmPath: string) => Promise<unknown>;
  };
  ImageSegmenter: {
    createFromOptions: (
      fileset: unknown,
      options: Record<string, unknown>,
    ) => Promise<MediapipeSegmenter>;
  };
}

export interface MediapipeSegmenter {
  segment: (image: unknown) => {
    confidenceMasks?: MediapipeMask[];
    categoryMask?: MediapipeMask;
    /**
     * Le résultat **possède** les masques : c'est lui qui les libère, et non
     * l'appelant. Déclaré ici parce que le code s'en sert — la garde
     * `check:cutout:api` vérifie que la méthode existe bien dans le paquet.
     */
    close?: () => void;
  };
  close?: () => void;
}

export interface MediapipeMask {
  width: number;
  height: number;
  getAsFloat32Array: () => Float32Array;
  getAsUint8Array?: () => Uint8Array;
  close?: () => void;
}

let mediapipePromise: Promise<MediapipeModule> | null = null;

/** Même discipline que `loadTransformers()` : paresseux, mémoïsé, et un échec réseau oublié. */
export async function loadMediapipe(): Promise<MediapipeModule> {
  if (!mediapipePromise) {
    mediapipePromise = import(/* webpackIgnore: true */ MEDIAPIPE_CDN).then(
      (module) => module as unknown as MediapipeModule,
    );
  }
  try {
    return await mediapipePromise;
  } catch (error) {
    mediapipePromise = null;
    throw error;
  }
}

/**
 * L'index du canal « personne » dans les masques de confiance.
 *
 * Le modèle SelfieSegmenter sort **deux** catégories, dans cet ordre : 0 le
 * fond, 1 la personne. Prendre le premier masque donnerait le fond — c'est-à-dire
 * l'exact inverse de ce qu'on veut, et un détourage parfaitement propre du décor.
 *
 * Un modèle qui n'annonce qu'un seul canal est un modèle qui ne segmente que la
 * personne : on prend alors le seul disponible plutôt que d'échouer.
 */
export const MEDIAPIPE_PERSON_CHANNEL = 1;

export function personChannelIndex(maskCount: number): number {
  return maskCount > MEDIAPIPE_PERSON_CHANNEL ? MEDIAPIPE_PERSON_CHANNEL : 0;
}

/** Ce qu'un moteur rend après avoir détouré : le masque, et ce qu'il a coûté. */
interface CutoutRun {
  device: CutoutDevice;
  libraryVersion: string;
  loadMs: number;
  inferenceMs: number;
  /** Le masque, à la résolution du modèle, en niveaux de gris sur le canal alpha. */
  maskCanvas: HTMLCanvasElement;
}

/**
 * Le détourage par MediaPipe — 243 Ko de poids, WASM et WebGL, pas de WebGPU.
 *
 * Trois points de rigueur :
 *  - le délégué GPU de MediaPipe est **WebGL**, pas WebGPU : il est donc
 *    disponible sur des appareils que Transformers.js ne peut pas accélérer ;
 *  - si le délégué GPU échoue à l'initialisation, on **recommence en CPU** au
 *    lieu d'échouer — c'est le même raisonnement que le repli WASM ;
 *  - le segmenter est **fermé** après usage. MediaPipe alloue côté WASM ; le
 *    laisser ouvert ferait grossir la mémoire à chaque essai du participant.
 *
 * Le contrat de cette API a été relevé sur le `vision.d.ts` **publié** par le
 * paquet, et non sur la documentation en ligne : `segment()` y est synchrone et
 * renvoie directement le résultat, `MPMask.close()` existe bien, et
 * `runningMode` est la chaîne `'IMAGE'`. `npm run check:cutout:api` revérifie
 * tout cela contre le `vision.d.ts` de la version épinglée.
 */
async function runMediapipe(
  source: CutoutSource,
  model: CutoutModel,
  options: CutoutOptions,
): Promise<CutoutRun> {
  const trace = (step: string, detail?: unknown) => {
    if (options.debug) console.info('[détourage]', step, detail ?? '');
  };

  trace('import du module', MEDIAPIPE_CDN);
  const mediapipe = await loadMediapipe();
  trace('module importé', Object.keys(mediapipe ?? {}).join(', '));
  const image = await loadImageElement(source.src);

  const loadStarted = Date.now();
  options.onProgress?.({ stage: 'model', message: 'Préparation du modèle…' });
  trace('résolution du dossier WASM', MEDIAPIPE_WASM);
  const fileset = await mediapipe.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  trace('dossier WASM résolu');

  /*
   * Un canvas **neuf**, dédié, et jamais touché.
   *
   * La déclaration officielle est explicite : « The canvas element to bind
   * textures to. **This has to be set for GPU processing.** The task will
   * initialize a WebGL context and throw an error if this fails (e.g. if you
   * have already initialized a different type of context). »
   *
   * Deux conséquences, et la seconde est un piège : il faut le fournir, et il ne
   * faut **surtout pas** en avoir tiré un contexte 2D auparavant — MediaPipe
   * échouerait alors à obtenir son contexte WebGL. D'où un canvas créé ici, pour
   * cet usage, et jamais réutilisé.
   */
  const gpuCanvas = document.createElement('canvas');

  let device: CutoutDevice = 'webgl';
  let segmenter: MediapipeSegmenter;
  try {
    trace('création du segmenter, délégué GPU');
    segmenter = await mediapipe.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MEDIAPIPE_MODEL_URL, delegate: 'GPU' },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
      canvas: gpuCanvas,
    });
    trace('segmenter prêt en GPU');
  } catch (error) {
    trace('délégué GPU refusé', error);
    device = 'wasm';
    try {
      trace('création du segmenter, délégué CPU');
      segmenter = await mediapipe.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MEDIAPIPE_MODEL_URL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      trace('segmenter prêt en CPU');
    } catch {
      // On remonte l'erreur d'origine : c'est la plus informative des deux.
      throw error;
    }
  }
  const loadMs = Date.now() - loadStarted;

  options.onProgress?.({ stage: 'inference', message: 'Détourage en cours…' });
  const inferenceStarted = Date.now();
  let result: ReturnType<MediapipeSegmenter['segment']> | undefined;
  try {
    result = segmenter.segment(image);
    const inferenceMs = Date.now() - inferenceStarted;

    const masks = result.confidenceMasks ?? [];
    const chosen = masks[personChannelIndex(masks.length)];
    if (!chosen) throw new Error('Le détourage n’a produit aucun masque.');

    /*
     * Le masque est recopié **avant** toute fermeture : `maskCanvasFromFloat32`
     * écrit les valeurs dans un canvas, il ne retient pas le `Float32Array`.
     */
    return {
      device,
      libraryVersion: mediapipeVersion(),
      loadMs,
      inferenceMs,
      maskCanvas: maskCanvasFromFloat32(
        chosen.getAsFloat32Array(),
        chosen.width,
        chosen.height,
      ),
    };
  } finally {
    /*
     * On ferme le **résultat**, pas le masque, et l'ordre est celui du paquet.
     *
     * `ImageSegmenterResult.close()` est documenté comme « libère les ressources
     * détenues par les masques de catégorie et de confiance » : c'est donc le
     * résultat qui **possède** les masques. Fermer un masque à la main puis le
     * résultat reviendrait à libérer deux fois la même allocation WASM.
     *
     * Le modèle sort **deux** masques de confiance ; on n'en lit qu'un. Sans le
     * `close()` du résultat, le second — et l'allocation partagée — survivaient à
     * chaque essai du participant : exactement la fuite que cette fonction doit
     * éviter. `finally` couvre aussi l'échec de `segment()`.
     */
    result?.close?.();
    segmenter.close?.();
  }
}

/**
 * La version de MediaPipe, quand la bibliothèque l'expose.
 *
 * Elle ne publie pas d'équivalent d'`env.version`. On préfère une chaîne vide à
 * une version devinée : une mesure étiquetée d'un numéro inventé est pire qu'une
 * mesure sans numéro.
 */
function mediapipeVersion(): string {
  return '';
}

/* ------------------------------------------------------------------ */
/* Transformers.js — le chemin qualité                                */
/* ------------------------------------------------------------------ */

async function runTransformers(
  source: CutoutSource,
  model: CutoutModel,
  size: InputSize,
  preferred: CutoutDevice,
  options: CutoutOptions,
): Promise<CutoutRun> {
  const transformers = await loadTransformers();
  const { pipeline, RawImage } = transformers;

  let device = preferred;
  const loadStarted = Date.now();
  let segmenter: (input: unknown) => Promise<unknown>;
  try {
    segmenter = await pipeline('image-segmentation', model.id, {
      device,
      progress_callback: (report: { status?: string; progress?: number; file?: string }) => {
        options.onProgress?.({
          stage: 'model',
          message: report.file ? `Téléchargement — ${report.file}` : 'Préparation du modèle…',
          ratio: typeof report.progress === 'number' ? report.progress / 100 : undefined,
        });
      },
    });
  } catch (error) {
    if (device !== 'webgpu') throw error;
    // Le repli n'est pas décoratif : sur les téléphones visés, WebGPU peut être
    // annoncé par le navigateur et échouer à l'initialisation.
    device = 'wasm';
    segmenter = await pipeline('image-segmentation', model.id, { device: 'wasm' });
  }
  const loadMs = Date.now() - loadStarted;

  options.onProgress?.({ stage: 'inference', message: 'Détourage en cours…' });
  const inferenceStarted = Date.now();
  const input = await drawSource(source.src, size.width, size.height);
  const output = (await segmenter(input)) as { mask?: unknown }[];
  const mask = output?.[0]?.mask;
  if (!mask) throw new Error('Le détourage n’a produit aucun masque.');
  const inferenceMs = Date.now() - inferenceStarted;

  const maskCanvas = maskCanvasFromRaw(mask as TransformersMask, RawImage);

  return {
    device,
    libraryVersion: transformers.env?.version ?? '',
    loadMs,
    inferenceMs,
    maskCanvas,
  };
}

/**
 * Épuise l'union — et fait **échouer la compilation** si un moteur est ajouté
 * sans son exécuteur.
 *
 * C'est ce qui remplace l'ancien drapeau `executable` du registre. Un booléen
 * qu'on oublie de mettre à jour laisse passer ; une fonction qui exige `never`
 * ne laisse pas compiler. Le garde est passé du runtime à la compilation, ce qui
 * est toujours le bon sens de déplacement.
 */
function assertNever(value: never): never {
  throw new Error(`Moteur de détourage inconnu : ${String(value)}`);
}

/** L'aiguillage : un moteur, un exécuteur, aucun repli silencieux. */
function runCutout(
  source: CutoutSource,
  model: CutoutModel,
  size: InputSize,
  preferred: CutoutDevice,
  options: CutoutOptions,
): Promise<CutoutRun> {
  switch (model.runtime) {
    case 'mediapipe':
      return runMediapipe(source, model, options);
    case 'transformers':
      return runTransformers(source, model, size, preferred, options);
    default:
      return assertNever(model.runtime);
  }
}

/**
 * Le détourage d'une photo, du choix du chemin au PNG à canal alpha.
 *
 * **Non vérifié par le harnais** : cette fonction a besoin d'un navigateur, d'un
 * GPU et du réseau. Elle est délibérément mince, et tout ce qui pouvait en être
 * extrait l'a été (`inputSize`, `judgeCutout`, `cutoutErrorMessage`,
 * `detectWebGpu`, `chooseModel`, `defaultFeather`, `featherRadius`,
 * `personChannelIndex`). Ce qui reste est de l'orchestration.
 *
 * Le modèle n'est **pas** imposé : absent de `options`, c'est la stratégie à
 * deux étages qui décide, à partir de l'adaptateur réellement accordé.
 *
 * La photo d'origine n'est jamais réduite — seule l'entrée du modèle l'est, et
 * le masque est ensuite appliqué à la pleine résolution. Réduire la sortie ferait
 * perdre au participant la définition qu'il a fournie.
 */
export async function cutoutPhoto(
  source: CutoutSource,
  options: CutoutOptions = {},
): Promise<CutoutResult> {
  const started = Date.now();
  /*
   * Le tampon de mesures est vidé **avant** chaque détourage. Sans cela, une
   * seconde mesure sur la même page additionnerait le téléchargement de la
   * première et le total deviendrait un cumul illisible au lieu d'une mesure.
   */
  resourceTimings()?.clearResourceTimings?.();

  const gpu = (globalThis as { navigator?: { gpu?: GpuLike } }).navigator?.gpu;
  const webgpuAvailable = await detectWebGpu(gpu);
  const model = options.modelId ? findModel(options.modelId) : chooseModel(webgpuAvailable);
  const size = inputSize(source.naturalWidth, source.naturalHeight);
  const featherPx = options.featherPx ?? defaultFeather(model);
  if (options.debug) {
    console.info('[détourage]', 'plan retenu', {
      model: model.id,
      runtime: model.runtime,
      device: chooseDevice(webgpuAvailable),
      tailleEnvoyee: `${size.width}×${size.height}`,
      featherPx,
    });
  }

  const run = await runCutout(
    source,
    model,
    size,
    chooseDevice(webgpuAvailable),
    options,
  );

  const composed = await composeAlpha(
    source.src,
    run.maskCanvas,
    featherRadius(run.maskCanvas.width, source.naturalWidth, featherPx),
  );
  const quality = judgeCutout(composed.opaqueRatio);

  const memory = (globalThis as { performance?: { memory?: { usedJSHeapSize: number } } })
    .performance?.memory;

  return {
    src: composed.src,
    width: composed.width,
    height: composed.height,
    quality,
    measurements: {
      at: new Date().toISOString(),
      device: run.device,
      deviceLabel: options.deviceLabel ?? '',
      modelId: model.id,
      libraryVersion: run.libraryVersion,
      loadMs: run.loadMs,
      inferenceMs: run.inferenceMs,
      totalMs: Date.now() - started,
      inputWidth: size.width,
      inputHeight: size.height,
      outputWidth: composed.width,
      outputHeight: composed.height,
      transferredBytes: transferredForModel(
        resourceTimings()?.getEntriesByType?.('resource') ?? [],
        model,
      ),
      memoryBytes: memory ? memory.usedJSHeapSize : null,
      opaqueRatio: quality.opaqueRatio,
      verdict: quality.verdict,
    },
  };
}

/** Le masque renvoyé par le modèle : une image à un canal. */
interface TransformersMask {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channels: number;
}

/**
 * La seule partie de `performance` dont ce module a besoin.
 *
 * Passé par `globalThis` plutôt que lu directement : le harnais compile ce
 * fichier sans navigateur, et une lecture nue de `performance` y serait un
 * piège le jour où quelqu'un appellerait la fonction par erreur.
 */
interface ResourceTimingLike {
  clearResourceTimings?: () => void;
  getEntriesByType?: (type: string) => ResourceEntryLike[];
}

function resourceTimings(): ResourceTimingLike | undefined {
  return (globalThis as { performance?: ResourceTimingLike }).performance;
}

/** Charge la photo dans un canvas aux dimensions demandées. */
async function drawSource(
  src: string,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const image = await loadImageElement(src);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponible : impossible de préparer l’image.');
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

/**
 * Le masque de Transformers.js en canvas.
 *
 * `RawImage.toCanvas()` fait la conversion à notre place ; on vérifie tout de
 * même sa présence, parce qu'un `mask` renvoyé sous une autre forme produirait
 * sinon un détourage silencieusement vide.
 */
function maskCanvasFromRaw(
  mask: TransformersMask,
  RawImage: TransformersModule['RawImage'],
): HTMLCanvasElement {
  const raw = new RawImage(mask.data, mask.width, mask.height, mask.channels) as {
    toCanvas?: () => HTMLCanvasElement;
  };
  if (typeof raw.toCanvas !== 'function') {
    throw new Error('Le masque renvoyé par le modèle n’est pas exploitable.');
  }
  return raw.toCanvas();
}

/**
 * Le masque MediaPipe — un tableau de confiances flottantes — en canvas.
 *
 * Seul le **canal alpha** compte : c'est lui que `destination-in` lit. Le fond
 * est donc posé opaque et blanc, et la confiance devient l'alpha. Écrire la
 * confiance dans les canaux de couleur ne servirait à rien et laisserait un
 * alpha à 255 partout — c'est-à-dire aucun détourage.
 */
function maskCanvasFromFloat32(
  data: ArrayLike<number>,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponible : impossible de lire le masque.');

  const image = context.createImageData(width, height);
  const pixels = Math.min(width * height, Math.floor(data.length));
  for (let i = 0; i < pixels; i += 1) {
    const confidence = data[i];
    const alpha = Math.round(Math.min(1, Math.max(0, confidence)) * 255);
    image.data[i * 4] = 255;
    image.data[i * 4 + 1] = 255;
    image.data[i * 4 + 2] = 255;
    image.data[i * 4 + 3] = alpha;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Applique le masque à la photo **d'origine** et renvoie un PNG à canal alpha.
 *
 * Le masque est mis à l'échelle depuis la résolution du modèle vers celle de la
 * photo : c'est le seul moment où l'on remonte en définition, et il vaut mieux
 * interpoler un masque — une forme simple, tolérante au flou — que d'avoir réduit
 * la photo du participant.
 *
 * Le flou est appliqué **pendant** le dessin du masque, via `context.filter` :
 * une passe séparée sur un canvas intermédiaire coûterait une copie pleine
 * résolution, pour un résultat identique. Les navigateurs qui ignorent
 * `context.filter` produisent un bord simplement plus dur — jamais un détourage
 * faux, ce qui est la bonne façon d'échouer ici.
 */
async function composeAlpha(
  src: string,
  maskCanvas: HTMLCanvasElement,
  blurPx: number,
): Promise<{ src: string; width: number; height: number; opaqueRatio: number }> {
  const image = await loadImageElement(src);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponible : impossible de composer le détourage.');

  context.drawImage(image, 0, 0, width, height);
  context.globalCompositeOperation = 'destination-in';
  if (blurPx > 0) context.filter = `blur(${blurPx.toFixed(2)}px)`;
  context.drawImage(maskCanvas, 0, 0, width, height);
  context.filter = 'none';
  context.globalCompositeOperation = 'source-over';

  const pixels = context.getImageData(0, 0, width, height);
  return {
    src: output.toDataURL('image/png'),
    width,
    height,
    opaqueRatio: measureOpaqueRatio(pixels.data),
  };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Cette image n’a pas pu être décodée.'));
    image.src = src;
  });
}
