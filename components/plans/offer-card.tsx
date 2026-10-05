'use client';

import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  formatOfferPrice,
  formatOfferVolume,
  formatPricePerParticipant,
  quoteHref,
  type DistributionOffer,
} from '@/lib/distribution';

/**
 * Une ligne de la grille de distribution. Le prix par participant est mis en
 * avant : c'est le seul chiffre qui permette de comparer les volumes honnêtement.
 *
 * L'action historique reste un lien de contact pour les volumes hors grille.
 * Les packs publiés passent désormais par `TopupButton`, côté campagne, avec
 * paiement Mobile Money et confirmation serveur.
 */
export function OfferCard({ offer }: { offer: DistributionOffer }) {
  const highlight = offer.highlight ?? false;
  const onQuote = offer.priceFcfa === null;

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border bg-white p-5',
        highlight ? 'border-transparent ring-brand-gradient shadow-sm' : 'border-gray-200',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{offer.name}</h3>
        {highlight && (
          <span className="rounded-pill bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
            Meilleur rapport
          </span>
        )}
      </div>

      <p className="mt-3 text-[26px] font-bold leading-none">
        {formatOfferVolume(offer)}
        <span className="ml-1.5 text-[13px] font-medium text-gray-500">participants</span>
      </p>

      <p className="mt-3 text-[13px] leading-relaxed text-gray-500">{offer.description}</p>

      <dl className="mt-4 flex flex-1 flex-col gap-1.5 border-t border-gray-200 pt-4 text-[12px]">
        <div className="flex items-center justify-between">
          <dt className="text-gray-500">Prix</dt>
          <dd className="font-semibold text-gray-900">{formatOfferPrice(offer)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-gray-500">Par participant</dt>
          <dd className="text-gray-700">{formatPricePerParticipant(offer)}</dd>
        </div>
      </dl>

      <a
        href={quoteHref(offer)}
        className={cn(
          'mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-pill px-4 text-[13px] font-medium transition-all duration-200 ease-brand',
          highlight
            ? 'bg-brand-gradient text-white shadow-sm hover:shadow-md'
            : 'border border-gray-200 text-ink hover:border-ink hover:bg-gray-50',
        )}
      >
        {onQuote ? 'Nous contacter' : 'Demander un devis'}
        <ArrowRight className="size-4" aria-hidden />
      </a>
    </div>
  );
}
