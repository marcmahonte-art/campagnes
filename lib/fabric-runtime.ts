/**
 * Quelle implémentation de Fabric utiliser.
 *
 * Pourquoi ce module existe
 * ------------------------
 * Les fabriques partagées (`lib/fabric-*.ts`, `lib/watermark.ts`) chargent
 * Fabric **à l'intérieur** de leurs fonctions, jamais par un import statique.
 * C'était fait pour alléger le bundle ; c'est aussi ce qui permet aujourd'hui de
 * rendre un cadre **côté serveur**, condition pour qu'un droit payé (retirer le
 * filigrane) soit décidé hors du navigateur.
 *
 * Le build navigateur de Fabric mesure le texte avec un canvas caché dans le
 * `document`. Hors navigateur, il lève `document is not defined`. Le build
 * `fabric/node`, lui, s'appuie sur node-canvas et n'a besoin d'aucun DOM.
 *
 * Le choix est donc un **registre**, pas une détection automatique :
 *
 *   - dans le navigateur, rien n'est enregistré et `importFabric()` rend le build
 *     navigateur — comportement inchangé, aucun risque de régression ;
 *   - côté serveur, la route de rendu enregistre une fois pour toutes
 *     `fabric/node` avant de composer.
 *
 * Une détection automatique (`typeof document === 'undefined'`) aurait été plus
 * courte et plus fragile : elle ferait dépendre le rendu d'un détail
 * d'environnement au lieu d'une décision explicite, et un bundler qui prérend
 * côté serveur changerait silencieusement d'implémentation.
 */

/** Ce que les fabriques consomment réellement : un jeu de classes. */
export type FabricRuntime = Record<string, any>;

let runtime: FabricRuntime | null = null;

/**
 * Enregistre l'implémentation à utiliser.
 *
 * Réservé au serveur. Appelé une seule fois, au premier rendu : après cela,
 * toutes les fabriques partagées rendent le même cadre que l'aperçu, sans qu'une
 * seule ligne de géométrie soit dupliquée.
 */
export function setFabricRuntime(implementation: FabricRuntime): void {
  runtime = implementation;
}

/** L'implémentation enregistrée, s'il y en a une. */
export function currentFabricRuntime(): FabricRuntime | null {
  return runtime;
}

/**
 * Les classes Fabric, pour l'environnement courant.
 *
 * À remplacer partout où une fabrique écrivait `await import('fabric')`.
 */
export async function importFabric(): Promise<FabricRuntime> {
  if (runtime) return runtime;
  return (await import('fabric')) as unknown as FabricRuntime;
}
