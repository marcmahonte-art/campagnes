/**
 * Filtres photo — source unique de vérité.
 *
 * Le participant peut appliquer un filtre à **sa** photo. Un filtre n'est pas un
 * réglage d'affichage : c'est une modification des pixels. Il doit donc voyager
 * dans le descripteur, au même titre que la position de la photo — sans quoi
 * l'aperçu montrerait un visuel que le fichier téléchargé ne reproduirait pas.
 *
 * C'est la raison pour laquelle ce module ne décrit **que** des filtres Fabric.
 * La version précédente de l'aperçu appliquait un `filter: blur(5px)` CSS : elle
 * filtrait l'écran, jamais le fichier — un CSS ne peut pas être exporté. Un
 * filtre Fabric, lui, est du code de rendu : il produit les mêmes pixels dans
 * l'aperçu et dans l'export, parce que c'est littéralement la même fonction.
 *
 * **Toutes les valeurs sont des fractions de la dimension de l'image, jamais des
 * pixels.** L'aperçu travaille sur une vignette réduite, l'export sur 1080 px ou
 * plus : une valeur en pixels donnerait un flou imperceptible à l'écran et
 * énorme dans le fichier. Fabric exprime nativement le flou ainsi — c'est la
 * propriété qui rend le rendu indépendant de la résolution.
 *
 * Volontairement absents : hautes lumières, contraste artistique, presets
 * « embellissants ». On ne sait pas qui va déposer sa propre photo ; un outil
 * qui lisse la peau d'inconnus n'a rien à faire ici. Les réglages retenus sont
 * neutres et aucun ne porte de jugement sur le visage de personne.
 */

import type { filters } from 'fabric';
import { importFabric } from './fabric-runtime';

/**
 * Filtre Fabric tel qu'attendu par `FabricImage.filters`.
 *
 * `BaseFilter` n'est pas exporté au premier niveau du paquet : il ne l'est que
 * par le namespace `filters` — celui-là même qui porte `Grayscale`, `Sepia`, etc.
 */
export type PhotoFilterObject = filters.BaseFilter<string, Record<string, any>>;

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

/**
 * Identifiants acceptés dans un descripteur.
 *
 * `none` est un membre à part entière du catalogue, pas une absence : c'est la
 * valeur par défaut, et un descripteur qui la porte est explicite plutôt
 * qu'ambigu. La liste est courte à dessein — six choix tiennent sur une ligne de
 * téléphone, et un filtre qu'on ne voit pas du premier coup d'œil ne sert à rien.
 */
export const PHOTO_FILTER_IDS = [
  'none',
  'grayscale',
  'sepia',
  'brightness',
  'contrast',
  'blur',
] as const;

export type PhotoFilter = (typeof PHOTO_FILTER_IDS)[number];

export interface PhotoFilterPreset {
  id: PhotoFilter;
  /** Libellé montré au participant. En mots, jamais une valeur technique. */
  label: string;
}

/** L'ordre du catalogue est celui de l'interface : du plus neutre au plus marqué. */
export const PHOTO_FILTER_PRESETS: readonly PhotoFilterPreset[] = [
  { id: 'none', label: 'Aucun' },
  { id: 'grayscale', label: 'Noir et blanc' },
  { id: 'sepia', label: 'Sépia' },
  { id: 'brightness', label: 'Plus lumineux' },
  { id: 'contrast', label: 'Plus contrasté' },
  { id: 'blur', label: 'Flou' },
];

export function isPhotoFilter(value: unknown): value is PhotoFilter {
  return typeof value === 'string' && (PHOTO_FILTER_IDS as readonly string[]).includes(value);
}

export function photoFilterLabel(filter: PhotoFilter): string {
  return PHOTO_FILTER_PRESETS.find((preset) => preset.id === filter)?.label ?? 'Aucun';
}

/* ------------------------------------------------------------------ */
/* Intensités                                                          */
/* ------------------------------------------------------------------ */

/*
 * Un seul endroit fixe l'intensité de chaque filtre. Elles sont modérées : le
 * participant doit pouvoir se reconnaître sur son propre visuel.
 */

/** Exposition : -1 → 1. 0.15 éclaircit sans brûler les hautes lumières. */
const BRIGHTNESS_LIFT = 0.15;

/** Contraste : -1 → 1. 0.2 redonne du relief à une photo plate. */
const CONTRAST_LIFT = 0.2;

/**
 * Flou : 0 → 1, en fraction de la dimension de l'image.
 *
 * Fabric multiplie cette valeur par 0.12 pour obtenir son rayon réel
 * (`Blur.getBlurValue()`), soit ≈ 3.6 % de la dimension — un flou franc mais
 * qui laisse le sujet lisible. La valeur reste une fraction, donc le flou est
 * identique sur la vignette d'aperçu et sur un export de 1080 px.
 */
const BLUR_AMOUNT = 0.3;

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

/**
 * Les filtres Fabric correspondant à un identifiant du catalogue.
 *
 * Renvoie un tableau **vide** pour `none` : c'est la façon dont Fabric restaure
 * les pixels d'origine — `applyFilters()` réaffecte alors l'élément source. Un
 * filtre « neutre » ne serait pas équivalent : il ferait un aller-retour par un
 * canvas intermédiaire et pourrait altérer l'image de quelques unités.
 */
export async function createPhotoFilters(filter: PhotoFilter): Promise<PhotoFilterObject[]> {
  if (filter === 'none') return [];

  const { filters } = await importFabric();

  switch (filter) {
    case 'grayscale':
      return [new filters.Grayscale()];
    case 'sepia':
      return [new filters.Sepia()];
    case 'brightness':
      return [new filters.Brightness({ brightness: BRIGHTNESS_LIFT })];
    case 'contrast':
      return [new filters.Contrast({ contrast: CONTRAST_LIFT })];
    case 'blur':
      return [new filters.Blur({ blur: BLUR_AMOUNT })];
  }
}

/**
 * Applique un filtre à un objet image Fabric.
 *
 * `applyFilters()` est synchrone en Fabric 6 : au retour de cette fonction, les
 * pixels sont réellement filtrés. C'est ce qui permet à l'export de capturer le
 * canvas juste après, sans attendre une promesse qui n'existe pas.
 *
 * Fonction unique, appelée par l'aperçu participant **et** par l'export : c'est
 * ce qui interdit aux deux de diverger.
 */
export async function applyPhotoFilter(
  object: { filters: PhotoFilterObject[]; applyFilters: () => void },
  filter: PhotoFilter,
): Promise<void> {
  object.filters = await createPhotoFilters(filter);
  object.applyFilters();
}
