import { backend } from '@/lib/backend';
import type { Result } from '@/lib/backend/types';

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
 * jeton sans consommer de quota), plus la RLS sur `distribution_links`. Tant que
 * cette migration n'est pas appliquée, l'appel échoue proprement — il ne renvoie
 * jamais un jeton que rien ne saurait ensuite résoudre.
 */
export const distributionService = {
  createDistributionLink(
    campaignId: string,
    quota: number,
    expiresAt?: string | null,
  ): Promise<Result<string>> {
    return backend.createDistributionLink(campaignId, quota, expiresAt);
  },
};
