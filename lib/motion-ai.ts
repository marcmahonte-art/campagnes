/**
 * Animation « IA » — le point de branchement.
 *
 * Règle d'honnêteté : aujourd'hui **aucun modèle n'est branché**. Le bouton
 * « ✦ Animer avec l'IA » ne prétend donc pas appeler un service distant : il
 * traduit la description avec l'interpréteur local de `lib/motion.ts`, et
 * l'interface **dit ce qu'elle a compris** plutôt que d'annoncer un résultat
 * venu d'ailleurs.
 *
 * La signature est asynchrone et porte un `engine` explicite pour qu'un vrai
 * modèle puisse être branché plus tard **sans toucher aux écrans** : seul le
 * corps de `generateAnimation()` changerait.
 */

import {
  DEFAULT_MOTION_DURATION,
  interpretPrompt,
  type MotionPlan,
} from './motion';

/** D'où vient réellement le plan. `remote` n'est encore jamais renvoyé. */
export type MotionEngine = 'local';

export interface GenerateAnimationInput {
  /** Description en français, telle que saisie par le créateur. */
  prompt: string;
  /** Nombre de calques à animer. */
  layerCount: number;
  durationMs?: number;
}

export interface GeneratedAnimation {
  plan: MotionPlan;
  /** Ce que le moteur a compris — affiché tel quel, pour rester honnête. */
  understood: string[];
  /** Vrai si aucun mot-clé n'a été reconnu : on est retombé sur l'automatique. */
  fallback: boolean;
  engine: MotionEngine;
  /** Une phrase, jamais un argument marketing. */
  note: string;
}

/**
 * Traduit une description en plan d'animation.
 *
 * Le délai simulé n'est pas cosmétique : il laisse le temps à l'interface
 * d'afficher un état de chargement, pour que le jour où un vrai modèle répond
 * en deux secondes, l'écran soit déjà prêt.
 */
export async function generateAnimation(
  input: GenerateAnimationInput,
): Promise<GeneratedAnimation> {
  const result = interpretPrompt(
    input.prompt,
    input.layerCount,
    input.durationMs ?? DEFAULT_MOTION_DURATION,
  );

  await new Promise((resolve) => setTimeout(resolve, 450));

  return {
    plan: result.plan,
    understood: result.understood,
    fallback: result.fallback,
    engine: 'local',
    note: result.fallback
      ? "Aucun mouvement reconnu dans votre description : le moteur a appliqué son animation automatique."
      : 'Animation calculée ici, dans votre navigateur — aucun envoi de votre texte.',
  };
}

/** Exemples proposés sous le champ, pour démarrer sans réfléchir. */
export const MOTION_PROMPT_SUGGESTIONS: string[] = [
  'Le cadre apparaît doucement',
  'Flottement lent et élégant',
  'Zoom avant énergique',
  'Glissement latéral discret',
  'Pulsation rapide',
];

/**
 * Vrai si un vrai modèle est branché.
 *
 * Sert uniquement à ce qu'un écran ne promette rien de faux : tant que c'est
 * faux, l'interface affiche la mention « calculé ici ».
 */
export function isRemoteMotionAvailable(): boolean {
  return false;
}
