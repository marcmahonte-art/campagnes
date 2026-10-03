import { backend } from '@/lib/backend';
import type { DistributionLink, ParticipationClaim, Result } from '@/lib/backend/types';

/**
 * Point d'entrée des liens privés de distribution.
 *
 * Il ne fait que **déléguer à la façade `backend`** : c'est elle qui choisit
 * l'implémentation (Supabase ou mode démonstration). Importer `supabaseBackend`
 * directement ici contournerait l'invariant « une seule porte d'accès aux
 * données » — et ne compilerait même pas, `supabaseBackend` étant typé `Backend`,
 * qui n'expose pas `rpc()`.
 *
 * Le côté base vit dans la migration 0009 : `create_distribution_link` (création
 * du jeton, contrôle du propriétaire) et `resolve_distribution` (résolution du
 * jeton sans consommer de quota), plus la RLS sur `distribution_links`. Ces
 * trois pièces sont appliquées et vérifiées par `npm run check:distribution` :
 * la création refuse un anonyme, la résolution rend `null` pour un jeton
 * inconnu, et la table n'est lisible par personne d'autre que son propriétaire.
 */
export const distributionService = {
  createDistributionLink(
    campaignId: string,
    quota: number,
    expiresAt?: string | null,
  ): Promise<Result<string>> {
    return backend.createDistributionLink(campaignId, quota, expiresAt);
  },

  /**
   * Les liens déjà créés pour une campagne, du plus récent au plus ancien.
   *
   * C'est la lecture qui fait qu'un lien **existe après un rechargement** : le
   * jeton n'est pas une valeur d'affichage conservée dans le composant, il est
   * relu depuis la base à chaque ouverture de l'écran. Le composant n'a donc
   * qu'à demander, jamais à retenir.
   *
   * N'écrit rien : ouvrir la page de gestion ne doit pas créer de lien.
   */
  listDistributionLinks(campaignId: string): Promise<Result<DistributionLink[]>> {
    return backend.listDistributionLinks(campaignId);
  },

  /**
   * Réserve une unité sur le quota d'un lien privé.
   *
   * Appelé au moment où le participant **produit réellement son visuel**, pas à
   * l'ouverture de la page : le quota vendu est un quota d'images livrées, pas
   * de vues. Un simple coup d'œil ne doit rien coûter.
   *
   * La fonction SQL écrit la trace d'usage dans la même transaction. Le
   * navigateur ne peut ni tricher sur le compteur ni écrire la trace lui-même.
   */
  claimDistribution(token: string): Promise<Result<ParticipationClaim>> {
    return backend.claimDistribution(token);
  },

  /**
   * Modifie le logo client d'un lien existant.
   *
   * L'URL pointe vers le bucket `media` public : le participant la charge sans
   * session. Une URL absente ou vide retire le logo.
   */
  updateClientLogo(token: string, url: string | null): Promise<Result<void>> {
    return backend.updateDistributionLink(token, { client_logo_url: url });
  },
};
