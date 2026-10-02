/**
 * Qui porte le badge « Créé avec Campagnes ».
 *
 * Une seule règle, un seul endroit. L'écran participant, l'export PNG, l'export
 * vidéo et les vignettes de galerie l'appellent tous : si la décision était
 * recopiée, l'aperçu finirait par montrer un visuel sans marque là où le fichier
 * en porterait une — exactement le mensonge que `lib/watermark.ts` interdit.
 *
 * Deux causes, indépendantes :
 *
 *   1. **La formule du créateur.** Un compte Free marque ses visuels ; un compte
 *      payant les en fournit sans marque. C'est le principe du produit.
 *
 *   2. **L'absence de lien de distribution.** Un visuel obtenu depuis la galerie
 *      publique (`/c/[slug]`) porte toujours la marque, quelle que soit la
 *      formule du créateur. Sans cela, un compte Pro publierait un cadre dans la
 *      galerie et offrirait à tout venant un visuel sans marque : la distribution
 *      payante ne se distinguerait plus de la publication ouverte.
 *
 * Le lien privé (`/d/[token]`) n'est pas concerné par la seconde cause : il
 * *est* la distribution choisie par le créateur, donc il suit sa formule.
 *
 * Ce module ne connaît ni React ni Fabric : il ne prend que des booléens et
 * renvoie un booléen, ce qui le rend vérifiable sans navigateur.
 * (`npm run check:watermark`)
 */

import type { PlanId } from './plans';

/** Origine de l'accès au cadre. */
export type AccessKind =
  /** Galerie publique, `/c/[slug]` — aucune distribution choisie. */
  | 'public'
  /** Lien de distribution privé, `/d/[token]` — distribué par le créateur. */
  | 'distributed';

export interface WatermarkInput {
  /** Origine de l'accès. */
  access: AccessKind;
  /** Effet visible de la formule du créateur : `true` ⇒ son compte est marqué. */
  creatorWatermark: boolean;
}

/**
 * Le badge doit-il être posé ?
 *
 * Vrai si la formule du créateur marque, **ou** si l'accès se fait sans lien de
 * distribution.
 */
export function shouldWatermark({ access, creatorWatermark }: WatermarkInput): boolean {
  return creatorWatermark || access === 'public';
}

/**
 * La formule à passer à l'export.
 *
 * `exportPng` / `exportVideo` raisonnent par droit (`no_watermark`), pas par
 * badge. On traduit donc la décision en formule : dès que le badge est requis on
 * exporte sous `free`, seule formule qui n'a pas le droit de le retirer.
 */
export function exportPlanFor(input: WatermarkInput): PlanId {
  return shouldWatermark(input) ? 'free' : 'creator';
}
