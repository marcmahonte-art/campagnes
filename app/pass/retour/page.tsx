import type { Metadata } from 'next';
import { PassReturn } from './pass-return';

/**
 * Retour de paiement du pass « Sans filigrane ».
 *
 * Page **hors du parcours** : elle n'existe que le temps d'une confirmation.
 * Elle est en `noindex` — une adresse de retour de paiement n'a rien à faire
 * dans un moteur de recherche, et porte une référence de transaction qui ne
 * concerne que son acheteur.
 *
 * Elle ne décide rien : elle interroge `/api/passes/sync`, qui re-vérifie le
 * statut chez la passerelle et active le pass si — et seulement si — le paiement
 * est confirmé côté serveur.
 */

export const metadata: Metadata = {
  title: 'Votre pass sans filigrane',
  robots: { index: false, follow: false },
};

export default async function PassReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ checkoutId?: string; campaign?: string }>;
}) {
  const { checkoutId, campaign } = await searchParams;

  return (
    <PassReturn
      checkoutId={typeof checkoutId === 'string' && checkoutId ? checkoutId : null}
      campaignSlug={typeof campaign === 'string' && campaign ? campaign : null}
    />
  );
}
