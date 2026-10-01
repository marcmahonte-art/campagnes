import { supabaseBackend } from '@/lib/backend';
import { SITE_URL } from '@/lib/backend/config';
import type { Result } from '@/lib/backend/types';

/**
 * Service for handling private distribution links.
 * The token is stored in the `distribution_links` table (see migration 0008).
 */
export const distributionService = {
  /**
   * Create a private distribution link for a campaign.
   * @param campaignId - UUID of the campaign.
   * @param quota - Number of allowed HD exports for this link.
   * @param expiresAt - Optional expiration date (ISO string).
   * @returns Result containing the token string.
   */
  async createDistributionLink(
    campaignId: string,
    quota: number,
    expiresAt?: string,
  ): Promise<Result<string>> {
    const { data, error } = await supabaseBackend.rpc('create_distribution_link', {
      p_campaign_id: campaignId,
      p_quota: quota,
      p_expires_at: expiresAt ?? null,
    });
    if (error) return { error: error.message ?? 'Impossible de créer le lien de distribution.' };
    return { data: data as string };
  },

  /**
   * Claim a private distribution token.
   * Returns the campaign and usage info.
   */
  async claimDistribution(token: string): Promise<Result<{ campaignId: string; usage: number }>> {
    const { data, error } = await supabaseBackend.rpc('claim_distribution', { p_token: token });
    if (error) return { error: error.message ?? 'Le lien de distribution est invalide ou expiré.' };
    return { data: data as { campaignId: string; usage: number } };
  },
};
