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

/**
 * Part maximale de la largeur du visuel que le badge peut occuper.
 *
 * Un export n'atteint jamais ce plafond (≈ 27 %). Il n'existe que pour les
 * vignettes d'interface, où la hauteur plancher rendait le badge envahissant.
 */
const MAX_WIDTH_SHARE = 0.62;

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
 * Réduit toutes les dimensions d'un même facteur.
 *
 * Sert quand le badge, à sa taille nominale, serait plus large que le visuel :
 * mieux vaut une pastille un peu plus petite qu'une pastille rognée.
 */
function scaleMetrics(m: BadgeMetrics, factor: number): BadgeMetrics {
  return {
    height: Math.max(14, Math.round(m.height * factor)),
    padding: Math.max(3, Math.round(m.padding * factor)),
    logoHeight: Math.max(6, Math.round(m.logoHeight * factor)),
    logoWidth: Math.max(6, Math.round(m.logoWidth * factor)),
    gap: Math.max(2, Math.round(m.gap * factor)),
    fontSize: Math.max(7, Math.round(m.fontSize * factor)),
    margin: Math.max(2, Math.round(m.margin * factor)),
    radius: Math.max(6, Math.round(m.radius * factor)),
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
 *
 * La taille est d'abord nominale, puis **corrigée pour tenir dans le visuel**.
 * Ce cas se produit sur les vignettes : la hauteur plancher de 26 px, nécessaire
 * pour que la mention reste lisible sur un petit format, rendait la pastille
 * plus large que le cadre — elle était donc rognée et la mention apparaissait
 * tronquée. La correction s'applique en deux temps : le badge ne dépasse jamais
 * la largeur du visuel, et il n'en occupe jamais plus de `MAX_WIDTH_SHARE`.
 *
 * Sur un canvas trop petit pour porter un badge lisible, `addBadge` ne dessine
 * **rien** : une mention illisible vaut moins que pas de mention, et un visuel
 * de cette taille n'est jamais un export, seulement une vignette d'interface.
 */
export async function addBadge(
  canvas: StaticCanvas,
  canvasWidth: number,
  canvasHeight: number,
): Promise<void> {
  const { FabricImage, IText, Rect, Shadow } = await import('fabric');

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
  const logoRatio = logo ? (logo.width || BADGE_LOGO_RATIO) / (logo.height || 1) : 0;

  /** Construit les pièces pour une géométrie donnée. */
  const build = (m: BadgeMetrics) => {
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

    // Le logo est mis à l'échelle à la main : `width` reste la largeur
    // naturelle, la largeur affichée est `width * scaleX`.
    const logoWidth = logo ? Math.round(m.logoHeight * logoRatio) : 0;
    const contentWidth = Math.round(
      m.padding * 2 + label.width + (logo ? m.gap + logoWidth : 0),
    );

    return { label, logoWidth, contentWidth };
  };

  let metrics = badgeMetrics(canvasWidth, canvasHeight);
  let parts = build(metrics);

  /*
   * Correction de largeur, en deux temps.
   *
   * 1. Le badge ne doit jamais dépasser le visuel — sinon il est rogné et la
   *    mention apparaît tronquée.
   * 2. Il ne doit pas non plus l'envahir : la hauteur plancher de 26 px,
   *    nécessaire pour rester lisible sur un petit format, produisait sur une
   *    vignette de 93 px un badge large de 89 px, soit la quasi-totalité du
   *    cadre. On plafonne donc aussi sa part de la largeur.
   *
   * Sur un export (1080 px et plus), le badge occupe environ 27 % de la
   * largeur : aucun de ces deux plafonds ne s'y applique, les fichiers livrés
   * sont donc strictement inchangés.
   */
  const budget = Math.min(
    canvasWidth - 2 * metrics.margin,
    Math.round(canvasWidth * MAX_WIDTH_SHARE),
  );
  if (parts.contentWidth > budget && parts.contentWidth > 0) {
    const factor = Math.max(0.28, budget / parts.contentWidth);
    metrics = scaleMetrics(metrics, factor);
    parts = build(metrics);
  }

  /*
   * Si les planchers de lisibilité empêchent encore le badge de tenir, on
   * renonce à le dessiner plutôt que d'en poser un rogné : une mention
   * tronquée est pire qu'aucune mention, et un visuel aussi petit n'est jamais
   * un export — c'est une vignette d'interface.
   */
  if (parts.contentWidth > canvasWidth) return;

  const { label, logoWidth, contentWidth } = parts;
  const left = Math.round(canvasWidth - metrics.margin - contentWidth);
  const top = Math.round(canvasHeight - metrics.margin - metrics.height);

  const pill = new Rect({
    left,
    top,
    width: contentWidth,
    height: metrics.height,
    rx: metrics.radius,
    ry: metrics.radius,
    fill: 'rgba(255,255,255,0.94)',
    originX: 'left',
    originY: 'top',
    shadow: new Shadow({
      color: 'rgba(0,0,0,0.22)',
      blur: metrics.height * 0.2,
      offsetX: 0,
      offsetY: metrics.height * 0.05,
    }),
    selectable: false,
    evented: false,
  });

  label.set({ left: left + metrics.padding, top: top + metrics.height / 2 });

  const pieces: FabricObject[] = [pill, label];
  if (logo) {
    const scale = metrics.logoHeight / (logo.height || 1);
    logo.set({
      scaleX: scale,
      scaleY: scale,
      left: left + metrics.padding + label.width + metrics.gap,
      top: top + metrics.height / 2,
      originX: 'left',
      originY: 'center',
    });
    pieces.push(logo);
  }

  canvas.add(...pieces);
}
