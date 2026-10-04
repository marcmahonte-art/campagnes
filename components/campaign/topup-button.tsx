'use client';

import { useCallback, useState } from 'react';
import { TopupConfirmModal } from '@/components/campaign/topup-confirm-modal';
import { DISTRIBUTION_PACKS } from '@/lib/pricing/config';
import type { TopupTier } from '@/lib/quota';

/**
 * Bouton d'achat d'une extension de quota — paiement Mobile Money en ligne.
 *
 * Un bouton, un palier, une action : **acheter**. Il ouvre la confirmation,
 * puis appelle la route serveur (qui seule connaît pawaPay et le jeton d'API)
 * et redirige vers la page de paiement hébergée.
 *
 * Ce que ce composant ne fait **pas** :
 *   - il ne crédite rien : le quota est écrit par `credit_campaign_quota`, côté
 *     serveur, à la confirmation. Le navigateur ne peut pas s'auto-créditer ;
 *   - il ne réconcilie pas le retour de paiement : c'est le rôle de
 *     `TopupReturnNotice`, monté **une seule fois** par page. Quatre boutons
 *     portant la réconciliation enverraient quatre requêtes concurrentes pour
 *     un seul paiement.
 */
export function TopupButton({
  campaignId,
  campaignName,
  tier,
  className,
  children,
}: {
  campaignId: string;
  campaignName: string;
  tier: TopupTier;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/pawapay/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packId: packIdFromTier(tier),
          campaignId,
        }),
      });

      const data = (await res.json()) as { redirectUrl?: string; error?: string };
      if (!res.ok || !data.redirectUrl) {
        setError(data.error ?? 'L’initiation du paiement a échoué. Réessayez dans un instant.');
        return;
      }
      // Redirection vers la page de paiement hébergée par pawaPay.
      window.location.href = data.redirectUrl;
    } catch {
      setError('Connexion impossible au service de paiement. Vérifiez votre réseau.');
    } finally {
      setBusy(false);
    }
  }, [tier, campaignId]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      <TopupConfirmModal
        open={open}
        onClose={() => {
          if (!busy) {
            setOpen(false);
            setError(null);
          }
        }}
        onConfirm={handleConfirm}
        campaignName={campaignName}
        tier={tier}
        busy={busy}
        error={error}
      />
    </>
  );
}

/**
 * Le palier de quota → l'identifiant du pack de distribution.
 *
 * Les deux grilles partagent les mêmes volumes : `lib/quota.ts` (TOPUP_TIERS)
 * et `lib/pricing/config.ts` (DISTRIBUTION_PACKS). On relie par le **volume**,
 * seule clé commune. On lit l'identifiant dans le catalogue des packs au lieu de
 * le recomposer ici : si un identifiant change, on n'a qu'un endroit à corriger.
 *
 * Renvoie une chaîne vide si aucun pack ne correspond : l'API refusera alors la
 * requête (`packId` invalide), ce qui vaut mieux qu'un identifiant deviné.
 */
function packIdFromTier(tier: TopupTier): string {
  return DISTRIBUTION_PACKS.find((p) => p.distributions === tier.downloads)?.id ?? '';
}
