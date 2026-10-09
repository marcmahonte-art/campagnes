/**
 * Environnement de rendu **serveur**.
 *
 * Les fabriques partagées (`lib/fabric-*.ts`, `lib/watermark.ts`) chargent
 * Fabric via le registre `lib/fabric-runtime.ts` et résolvent les assets via
 * `lib/render/assets.ts`. Dans le navigateur, rien n'est enregistré : le build
 * navigateur est utilisé, comportement inchangé.
 *
 * Côté serveur, il faut enregistrer `fabric/node` (adossé à node-canvas, sans
 * DOM) **et** un résolveur d'assets (les URL publiques `/logo-dark.png` n'ont
 * pas de sens hors navigateur). C'est le rôle de ce module, appelé une fois par
 * la route d'export avant tout rendu.
 *
 * La règle du projet est tenue : l'aperçu et le fichier partagent **le même**
 * code de composition. Le serveur ne redessine rien à la main.
 */

import { join } from 'node:path';
import { setFabricRuntime } from '@/lib/fabric-runtime';
import { setAssetResolver } from '@/lib/render/assets';

type RuntimeState = 'idle' | 'ready' | 'failed';

let state: RuntimeState = 'idle';

/**
 * Traduit un chemin public (`/logo-dark.png`) en source chargeable par
 * node-canvas. Le chemin absolu seul échoue (schéma `c:` invalide) : il faut un
 * `file://`.
 */
export function serverAssetResolver(src: string): string {
  if (!src.startsWith('/')) return src;
  return `file:///${join(process.cwd(), 'public', src).replace(/\\/g, '/')}`;
}

/**
 * Enregistre le runtime serveur, une seule fois.
 *
 * Renvoie `false` si `fabric/node` n'est pas disponible (binaire natif absent) :
 * l'appelant doit alors refuser le rendu plutôt que de produire une image
 * différente de l'aperçu.
 */
export async function ensureServerRenderRuntime(): Promise<boolean> {
  if (state === 'ready') return true;
  if (state === 'failed') return false;

  try {
    const fabric = (await import('fabric/node')) as unknown as Record<string, any>;
    setFabricRuntime(fabric);
    setAssetResolver(serverAssetResolver);
    state = 'ready';
    return true;
  } catch (error) {
    state = 'failed';
    console.error('[render] fabric/node indisponible côté serveur :', error);
    return false;
  }
}
