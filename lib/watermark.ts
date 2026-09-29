/**
 * Badge « Créé avec Campagnes ».
 *
 * C'est la **seule** différence visuelle entre un export Free et un export
 * payant — l'équivalent de la mention que Twibbonize appose sur les visuels de
 * ses participants.
 *
 * La géométrie est décrite ici une seule fois, en pixels **natifs** du format,
 * et dessinée par la même fonction dans l'aperçu du participant comme dans les
 * exports PNG et vidéo. C'est la règle du projet : si l'aperçu et le fichier ne
 * partagent pas le même code, l'aperçu finit par mentir — et le participant ne
 * découvrirait le badge qu'après avoir téléchargé.
 *
 * Le badge se pose sur une pastille claire plutôt qu'en texte nu : la photo du
 * participant peut être sombre, claire ou bariolée, et un texte blanc y
 * disparaîtrait. La pastille garantit la lisibilité sur n'importe quel fond.
 */

import type { FabricObject, StaticCanvas } from 'fabric';

export const BADGE_LABEL = 'Créé avec';
/** Logo fond clair (lettres noires + terminaison dégradée). */
export const BADGE_LOGO_SRC = '/logo-dark.png';

/** Dimensions du fichier `public/logo-dark.png` — sert à réserver la place. */
export const BADGE_LOGO_RATIO = 2065 / 490;

export interface BadgeMetrics {
  /** Hauteur de la pastille. */
  height: number;
  /** Marge intérieure, à gauche et à droite. */
  padding: number;
  logoHeight: number;
  logoWidth: number;
  /** Espace entre le mot et le logo. */
  gap: number;
  fontSize: number;
  /** Distance du bord droit et du bord bas du visuel. */
  margin: number;
  radius: number;
}

/**
 * Géométrie du badge pour un canvas donné.
 *
 * Tout est proportionnel au **petit côté**, pas à la largeur : le badge a ainsi
 * exactement la même taille physique sur un carré, un paysage et un vertical.
 * Basé sur la largeur, il devenait démesuré en paysage (111 px de haut sur un
 * 1920×1080, contre 63 px sur un 1080×1080) pour la même marque.
 */
export function badgeMetrics(canvasWidth: number, canvasHeight: number): BadgeMetrics {
  const base = Math.min(canvasWidth, canvasHeight);
  const height = Math.max(26, Math.round(base * 0.058));
  const logoHeight = Math.round(height * 0.5);

  return {
    height,
    padding: Math.round(height * 0.42),
    logoHeight,
    logoWidth: Math.round(logoHeight * BADGE_LOGO_RATIO),
    gap: Math.round(height * 0.3),
    fontSize: Math.max(11, Math.round(height * 0.31)),
    margin: Math.round(base * 0.026),
    radius: Math.round(height / 2),
  };
}

/**
 * Dessine le badge **au-dessus de tout**, dans le coin inférieur droit.
 *
 * Volontairement sans `Group` : les trois pièces sont posées en coordonnées
 * absolues, ce qui évite les surprises d'origine de groupe et rend la position
 * du badge prévisible au pixel près.
 *
 * Le badge est inerte (`selectable: false`, `evented: false`) : dans l'aperçu
 * participant, il ne doit jamais intercepter le glissement de la photo.
 */
export async function addBadge(
  canvas: StaticCanvas,
  canvasWidth: number,
  canvasHeight: number,
): Promise<void> {
  const { FabricImage, IText, Rect, Shadow } = await import('fabric');
  const m = badgeMetrics(canvasWidth, canvasHeight);

  const label = new IText(BADGE_LABEL, {
    fontFamily: 'Inter, Helvetica, sans-serif',
    fontSize: m.fontSize,
    fontWeight: '500',
    fill: '#3F3F46',
    originX: 'left',
    originY: 'center',
    selectable: false,
    evented: false,
  });

  /*
   * Le logo est chargé depuis `public/`. S'il manque, le badge reste lisible :
   * mieux vaut « Créé avec » seul qu'un visuel sans aucune mention.
   */
  let logo: Awaited<ReturnType<typeof FabricImage.fromURL>> | null = null;
  try {
    logo = await FabricImage.fromURL(BADGE_LOGO_SRC);
  } catch {
    logo = null;
  }

  // Le logo est mis à l'échelle à la main : `width` reste la largeur naturelle,
  // la largeur affichée est `width * scaleX`. On la calcule explicitement pour
  // que la pastille ait la bonne taille du premier coup.
  let logoWidth = 0;
  if (logo) {
    const naturalWidth = logo.width || BADGE_LOGO_RATIO;
    const naturalHeight = logo.height || 1;
    const scale = m.logoHeight / naturalHeight;
    logo.set({ scaleX: scale, scaleY: scale });
    logoWidth = naturalWidth * scale;
  }

  const contentWidth = Math.round(m.padding * 2 + label.width + (logo ? m.gap + logoWidth : 0));
  const left = Math.round(canvasWidth - m.margin - contentWidth);
  const top = Math.round(canvasHeight - m.margin - m.height);

  const pill = new Rect({
    left,
    top,
    width: contentWidth,
    height: m.height,
    rx: m.radius,
    ry: m.radius,
    fill: 'rgba(255,255,255,0.94)',
    originX: 'left',
    originY: 'top',
    shadow: new Shadow({
      color: 'rgba(0,0,0,0.22)',
      blur: m.height * 0.2,
      offsetX: 0,
      offsetY: m.height * 0.05,
    }),
    selectable: false,
    evented: false,
  });

  label.set({ left: left + m.padding, top: top + m.height / 2 });

  const pieces: FabricObject[] = [pill, label];
  if (logo) {
    logo.set({
      left: left + m.padding + label.width + m.gap,
      top: top + m.height / 2,
      originX: 'left',
      originY: 'center',
    });
    pieces.push(logo);
  }

  canvas.add(...pieces);
}
