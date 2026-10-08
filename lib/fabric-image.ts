/**
 * Fabrique unique des objets image Fabric.
 *
 * L'aperçu participant et l'export construisaient chacun leur `FabricImage` à la
 * main. Tant qu'ils ne différaient que par la position, la duplication était
 * inoffensive ; dès qu'un réglage **de pixels** est entré en jeu — le filtre du
 * participant — elle devenait le vecteur exact de la divergence que tout le
 * projet s'interdit : un aperçu qui montre une chose et un fichier qui en livre
 * une autre.
 *
 * Ce module est donc le **seul** endroit qui traduit un `ImageLayer` en objet
 * Fabric. Un réglage ajouté ici est appliqué partout, sans risque d'oubli.
 *
 * Il a aussi corrigé une divergence qui existait déjà, silencieusement : le
 * calque image de l'export ne recevait pas le drapeau `visible`. Un calque
 * masqué par le créateur était donc caché dans l'aperçu participant, mais bien
 * présent dans le PNG et la vidéo téléchargés.
 */

import type { FabricImage } from 'fabric';
import { applyPhotoFilter } from './photo-filters';
import { importFabric } from './fabric-runtime';
import { resolveAssetAsync } from './render/assets';
import type { PhotoZone } from './descriptor';
import type { ImageLayer } from './types';

export interface ImageObjectOptions {
  /**
   * L'objet répond au doigt et à la souris. Réservé à la photo du participant :
   * tout le reste du cadre est inerte, parce que le cadre est un contrat figé et
   * que la photo est la seule variable.
   */
  interactive?: boolean;
  /**
   * Rectangle de découpe, dans le repère du canvas (mode Fond). Il est
   * `absolutePositioned` : il ne suit ni le déplacement de la photo ni le zoom de
   * la vue, ce qui le rend identique à l'écran et à l'export.
   */
  clip?: PhotoZone | null;
  /** Masque posé dans l'éditeur. Un calque masqué ne part pas dans le fichier. */
  visible?: boolean;
}

export async function createImageObject(
  layer: ImageLayer,
  options: ImageObjectOptions = {},
): Promise<FabricImage> {
  const { FabricImage: FabricImageClass, Rect } = await importFabric();

  const image = await FabricImageClass.fromURL(layer.src, { crossOrigin: 'anonymous' });
  const naturalWidth = image.width || layer.w;
  const naturalHeight = image.height || layer.h;

  image.set({
    left: layer.x,
    top: layer.y,
    angle: layer.rotation,
    opacity: layer.opacity,
    originX: 'left',
    originY: 'top',
    ...(options.interactive
      ? {
          selectable: true,
          evented: true,
          // Pas de poignées : le zoom se règle au curseur, pas au coin de l'image.
          hasControls: false,
          hasBorders: false,
          lockRotation: true,
          hoverCursor: 'grab',
          moveCursor: 'grabbing',
        }
      : { selectable: false, evented: false }),
  });

  // Le drapeau de visibilité n'est pas déclaré dans le type de `set()` pour une
  // image, alors qu'il est bien honoré au rendu.
  image.set({ visible: options.visible !== false } as never);

  image.scaleX = layer.w / naturalWidth;
  image.scaleY = layer.h / naturalHeight;

  if (options.clip) {
    image.clipPath = new Rect({
      left: options.clip.x,
      top: options.clip.y,
      width: options.clip.w,
      height: options.clip.h,
      originX: 'left',
      originY: 'top',
      absolutePositioned: true,
    });
  }

  /*
   * Le filtre est appliqué en dernier, et sur les pixels **d'origine** : Fabric
   * filtre l'élément source, pas la copie affichée. La taille à l'écran n'a donc
   * aucune influence sur le rendu du filtre — c'est précisément ce qui fait
   * qu'une vignette d'aperçu et un export de 1080 px donnent la même image.
   */
  if (layer.filter) await applyPhotoFilter(image, layer.filter);

  return image;
}
