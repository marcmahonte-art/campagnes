'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Facebook,
  Link2,
  MessageCircle,
  Music2,
  Share2,
} from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { backend } from '@/lib/backend';
import {
  TIKTOK_UPLOAD_URL,
  buildShareText,
  campaignHashtags,
  facebookShareUrl,
  publicCampaignUrl,
  whatsappShareUrl,
  type ShareEventType,
} from '@/lib/share';
import type { GalleryItem } from '@/lib/types';

/**
 * Étape de partage — la fin du parcours participant.
 *
 * Trois principes la gouvernent :
 *
 * 1. **Elle ne bloque rien.** Le visuel est déjà téléchargé quand elle
 *    apparaît, et elle reste entièrement facultative. Un participant qui ferme
 *    l'onglet à cet instant a obtenu exactement ce qu'il est venu chercher.
 * 2. **Elle ne partage que le lien public.** Jamais `/d/:token` — voir
 *    `lib/share.ts`.
 * 3. **Elle ne promet rien qu'elle ne puisse tenir.** TikTok n'offre aucun
 *    partage par lien : le bouton ouvre la page de dépôt, et le texte le dit.
 *
 * Aucun compteur n'est affiché ici. Les chiffres sont déclaratifs (voir la
 * migration 0011) : les montrer au participant lui donnerait l'illusion d'une
 * audience mesurée, alors que c'est le créateur qui consulte des ordres de
 * grandeur.
 */
export function SharePanel({
  campaign,
  downloaded,
}: {
  campaign: GalleryItem;
  /** Vrai une fois le visuel enregistré. Ne change que l'accroche. */
  downloaded: boolean;
}) {
  const [copied, setCopied] = useState<'text' | 'link' | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);
  /** Le presse-papiers a refusé : on affiche alors le texte à copier à la main. */
  const [manual, setManual] = useState<string | null>(null);

  const url = useMemo(() => publicCampaignUrl(campaign.slug), [campaign.slug]);
  const text = useMemo(() => buildShareText(campaign, url), [campaign, url]);
  const hashtags = useMemo(() => campaignHashtags(campaign), [campaign]);

  /*
   * `navigator.share` n'existe que sur mobile et uniquement en HTTPS. On le
   * détecte après le montage : lu pendant le rendu, il ferait diverger le HTML
   * du serveur et celui du navigateur.
   */
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  /**
   * Compteur de partage — volontairement silencieux.
   *
   * Le geste utile a déjà eu lieu quand cette fonction s'exécute : un compteur
   * en panne ne doit ni retarder le partage, ni afficher une erreur que le
   * participant ne pourrait pas résoudre. On avale donc l'échec, y compris
   * l'exception réseau — c'est le seul endroit du projet où c'est justifié.
   */
  const track = useCallback(
    (event: ShareEventType) => {
      void backend.recordShareEvent(campaign.id, event).catch(() => {});
    },
    [campaign.id],
  );

  const copy = useCallback(
    async (value: string, which: 'text' | 'link', event: ShareEventType) => {
      track(event);
      try {
        await navigator.clipboard.writeText(value);
        setCopied(which);
        setManual(null);
        setTimeout(() => setCopied((c) => (c === which ? null : c)), 1800);
      } catch {
        // Presse-papiers indisponible (contexte non sécurisé, permission
        // refusée). Plutôt que d'échouer en silence, on montre la valeur.
        setManual(value);
      }
    },
    [track],
  );

  const nativeShare = useCallback(() => {
    track('share_clicked');
    void navigator.share?.({ title: campaign.name, text, url }).catch(() => {});
  }, [campaign.name, text, url, track]);

  const waHref = whatsappShareUrl(text);
  const fbHref = facebookShareUrl(url);

  return (
    <section
      aria-labelledby="share-title"
      className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      {/*
        Partage secondaire, une seule ligne (spec §12).

        Les quatre destinations sur une rangée défilable, pas quatre grosses
        cartes : sur un téléphone, quatre cartes empilées repoussent le partage
        hors de l'écran et donnent au partage le poids d'une action principale
        alors qu'il ne l'est pas — le téléchargement l'est.
      */}
      <div className="flex items-center gap-2">
        <Share2 className="size-4 shrink-0 text-purple" strokeWidth={1.75} aria-hidden />
        <h2 id="share-title" className="text-[13px] font-semibold text-gray-700">
          {downloaded ? 'Votre visuel est enregistré' : 'Partager'}
        </h2>
      </div>

      {/* La feuille de partage native, quand elle existe. Elle donne accès à
          toutes les applications installées — c'est le meilleur chemin sur
          mobile, et il n'y a rien à réinventer. */}
      {canNativeShare && (
        <div className="mt-3">
          <Button variant="secondary" size="md" onClick={nativeShare} className="min-h-[44px] w-full">
            <Share2 className="size-4" strokeWidth={1.75} aria-hidden />
            Partager…
          </Button>
        </div>
      )}

      {/*
        Rangée défilable : `overflow-x-auto`. On ne masque jamais le débordement — un
        contenu coupé sans indication donne l'impression d'un bug, alors qu'un
        scroll latéral se comprend au pouce.
      */}
      {/*
        Rangée défilable.

        Le débordement est **contenu dans la rangée** : `overflow-x-auto` porte le
        scroll, mais ses propres boîtes ne doivent pas déborder de la section.
        Mesuré : à 375 px, la rangée poussait `scrollWidth` à 385 — dix pixels de
        débordement sur toute la page, qui fait apparaître une barre horizontale
        alors que la rangée est censée défiler toute seule.
      */}
      <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">
        <ButtonLink
          href={waHref}
          variant="secondary"
          size="sm"
          onClick={() => track('share_whatsapp')}
          className="min-h-[44px] shrink-0"
        >
          <MessageCircle className="size-4" strokeWidth={1.75} aria-hidden />
          WhatsApp
        </ButtonLink>

        <ButtonLink
          href={fbHref}
          variant="secondary"
          size="sm"
          onClick={() => track('share_facebook')}
          className="min-h-[44px] shrink-0"
        >
          <Facebook className="size-4" strokeWidth={1.75} aria-hidden />
          Facebook
        </ButtonLink>

        <ButtonLink
          href={TIKTOK_UPLOAD_URL}
          variant="secondary"
          size="sm"
          onClick={() => track('share_tiktok')}
          className="min-h-[44px] shrink-0"
        >
          <Music2 className="size-4" strokeWidth={1.75} aria-hidden />
          TikTok
        </ButtonLink>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void copy(text, 'text', 'share_copy_text')}
          className="min-h-[44px] shrink-0"
        >
          {copied === 'text' ? (
            <>
              <Check className="size-4 text-success" aria-hidden />
              Texte copié
            </>
          ) : (
            <>
              <Copy className="size-4" strokeWidth={1.75} aria-hidden />
              Copier
            </>
          )}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void copy(url, 'link', 'share_copy_link')}
          className="min-h-[44px] shrink-0"
        >
          {copied === 'link' ? (
            <>
              <Check className="size-4 text-success" aria-hidden />
              Lien copié
            </>
          ) : (
            <>
              <Link2 className="size-4" strokeWidth={1.75} aria-hidden />
              Copier le lien
            </>
          )}
        </Button>
      </div>

      {/* Le presse-papiers a refusé : on ne laisse pas l'utilisateur sans recours. */}
      {manual && (
        <div className="mt-4">
          <label htmlFor="share-manual" className="text-xs font-medium text-gray-700">
            Copiez ce texte manuellement
          </label>
          <textarea
            id="share-manual"
            readOnly
            value={manual}
            rows={4}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1.5 w-full rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-[12px] leading-relaxed text-gray-700"
          />
        </div>
      )}

      {/* TikTok ne reçoit aucun lien. On l'explique plutôt que de laisser croire
          à un bouton qui ne ferait rien. */}
      <p className="mt-4 text-xs leading-relaxed text-gray-400">
        TikTok n’accepte pas de lien de partage : le bouton ouvre la page de dépôt, et la
        publication reste manuelle. Copiez le texte pour l’utiliser comme légende.
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-gray-500 transition-colors hover:text-ink">
          Voir le texte qui sera partagé
        </summary>
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3">
          <p className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-gray-700">
            {text}
          </p>
          {hashtags.length > 0 && (
            <p className="mt-2 border-t border-gray-200 pt-2 text-[11px] text-gray-500">
              {hashtags.length} hashtag{hashtags.length > 1 ? 's' : ''} · le lien partagé est
              toujours l’adresse publique de la campagne.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
