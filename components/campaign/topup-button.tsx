'use client';

import { useCallback, useState } from 'react';
import { TopupConfirmModal } from '@/components/campaign/topup-confirm-modal';
import { CountryPickerModal } from '@/components/payments/country-picker-modal';
import { DISTRIBUTION_PACKS } from '@/lib/pricing/config';
import { formatFcfaTier, type TopupTier } from '@/lib/quota';

/**
 * Bouton d'achat d'une extension de quota — paiement Mobile Money en ligne.
 *
 * Un bouton, un palier, une action : **acheter**. Il ouvre la confirmation du
 * montant, puis le choix du pays, puis appelle la route serveur (qui seule
 * connaît le prestataire et le jeton d'API) et redirige vers la page de paiement
 * hébergée.
 *
 * Le pays est demandé ici pour la même raison que sur le tunnel d'achat : sans
 * lui, la route retombait sur le corridor burkinabè par défaut, et un acheteur
 * d'ailleurs se voyait opposer un refus d'opérateur qui n'était pas le sien.
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
  /** Confirmation du montant. */
  const [open, setOpen] = useState(false);
  /** Choix du pays de paiement. */
  const [countryOpen, setCountryOpen] = useState(false);
  const [country, setCountry] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * La confirmation ne paie pas : elle cède la main au choix du pays, seule
   * étape qui déclenche réellement l'initiation.
   */
  const handleConfirm = useCallback(() => {
    setOpen(false);
    setError(null);
    setCountryOpen(true);
  }, []);

  const runPayment = useCallback(
    async (countryCode: string) => {
      setBusy(true);
      setError(null);
      setCountry(countryCode);
      try {
        const res = await fetch('/api/payments/pawapay/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            packId: packIdFromTier(tier),
            campaignId,
            country: countryCode,
          }),
        });

        const data = (await res.json()) as { redirectUrl?: string; error?: string };
        if (!res.ok || !data.redirectUrl) {
          setError(data.error ?? 'L’initiation du paiement a échoué. Réessayez dans un instant.');
          setBusy(false);
          return;
        }
        // Redirection vers la page de paiement hébergée (Mobile Money).
        window.location.href = data.redirectUrl;
      } catch {
        setError('Connexion impossible au service de paiement. Vérifiez votre réseau.');
        setBusy(false);
      }
    },
    [tier, campaignId],
  );

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

      <CountryPickerModal
        open={countryOpen}
        defaultCountry={country}
        loading={busy}
        error={error}
        summary={{
          label: `+${new Intl.NumberFormat('fr-FR').format(tier.downloads)} téléchargements`,
          amount: formatFcfaTier(tier.priceFcfa),
        }}
        onClose={() => {
          if (busy) return;
          setCountryOpen(false);
          setError(null);
        }}
        onConfirm={({ countryCode }) => {
          void runPayment(countryCode);
        }}
        onRetry={() => {
          if (country) void runPayment(country);
        }}
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
