/**
 * Résolution des assets publics, selon l'environnement.
 *
 * Le badge « Créé avec Campagnes » charge son logo par `/logo-dark.png`. Cette
 * URL relative est parfaite dans un navigateur et **n'a aucun sens côté
 * serveur** : `FabricImage.fromURL('/logo-dark.png')` y échoue, et le badge se
 * rendait alors sans son logo — c'est-à-dire différemment de l'aperçu, ce que
 * `lib/watermark.ts` interdit explicitement.
 *
 * Même principe que `lib/fabric-runtime.ts` : un registre, pas une détection. Le
 * serveur enregistre son résolveur au démarrage ; le navigateur n'enregistre
 * rien et l'URL reste telle quelle.
 */

/** Traduit un chemin public (`/logo-dark.png`) en source chargeable. */
export type AssetResolver = (src: string) => string | Promise<string>;

let resolver: AssetResolver | null = null;

export function setAssetResolver(next: AssetResolver): void {
  resolver = next;
}

export function resolveAsset(src: string): string | Promise<string> {
  return resolver ? resolver(src) : src;
}

/** Variante asynchrone, pour les appelants qui attendent déjà une promesse. */
export async function resolveAssetAsync(src: string): Promise<string> {
  return resolver ? await resolver(src) : src;
}
