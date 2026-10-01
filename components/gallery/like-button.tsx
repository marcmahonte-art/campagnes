'use client';

import { useState } from 'react';
import { Heart, Users } from 'lucide-react';
import { useSession } from '@/lib/backend/session';
import { backend } from '@/lib/backend';
import { compactCount } from '@/lib/gallery';
import { cn } from '@/lib/cn';
import type { GalleryItem } from '@/lib/types';

/**
 * Le cœur d'une campagne.
 *
 * Deux choses le séparent d'un simple bouton décoratif.
 *
 * **Le visiteur n'a pas de bouton.** Sans session, le cœur reste visible —
 * il montre que la campagne est populaire, ce qui est une information — mais
 * il ne se remplit jamais et ne fait rien d'autre qu'inviter à se connecter.
 * Un cœur qu'on peut appuyer sans effet teaches le geste et le perd dans la
 * même seconde.
 *
 * **La mise à jour est optimiste, avec retour arrière.** Le compteur change
 * avant la réponse du serveur : à l'échelle d'un réseau mobile, attendre un
 * aller-retour pour un cœur fait que l'interface paraît cassée. Mais si
 * l'appel échoue, on restaure l'état précédent et on le dit. Un compteur qui
 * ment cinq secondes est pire qu'un compteur qui ne bouge pas.
 */
export function LikeButton({
  campaignId,
  initialCount,
  initialLiked,
  connected,
  onChange,
}: {
  campaignId: string;
  /** Compteur au chargement. */
  initialCount: number;
  /** L'utilisateur avait-il aimé au chargement ? */
  initialLiked: boolean;
  /** Connecté ? Décidé par la page, qui connaît la session. */
  connected: boolean;
  /** Remonte l'état à la page, qui garde la source de vérité de la liste. */
  onChange: (count: number, liked: boolean) => void;
}) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLiked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!connected || busy) {
      if (!connected) setError('Connectez-vous pour aimer cette campagne.');
      return;
    }

    // Optimiste : on suppose que la base répondra, et on garde l'ancien état
    // pour pouvoir revenir en arrière.
    const previous = { count, liked };
    setBusy(true);
    setError(null);
    setLiked(!liked);
    setCount(count + (liked ? -1 : 1));
    onChange(count + (liked ? -1 : 1), !liked);

    const result = await backend.toggleCampaignLike(campaignId);

    setBusy(false);
    if (result.error || !result.data) {
      // Retour arrière : le compteur retrouve la valeur qu'il avait, parce
      // qu'on ne sait toujours pas si le like est passé.
      setLiked(previous.liked);
      setCount(previous.count);
      onChange(previous.count, previous.liked);
      setError(result.error ?? "L'enregistrement du like a échoué.");
      return;
    }

    // La base renvoie la vérité : on abandonne notre estimation.
    setLiked(result.data.liked);
    setCount(result.data.likesCount);
    onChange(result.data.likesCount, result.data.liked);
  }

  return (
    <span className="relative inline-flex flex-col items-start">
      <button
        type="button"
        onClick={(event) => {
          // La carte entière est cliquable : un like ne doit pas ouvrir
          // l'aperçu. C'est le bouton étiré (`absolute inset-0`) qui est en
          // dessous, et il faut donc arrêter la propagation explicitement.
          event.stopPropagation();
          event.preventDefault();
          void toggle();
        }}
        disabled={busy}
        aria-pressed={liked}
        aria-label={
          liked
            ? `Retirer votre like de cette campagne (${count})`
            : `Aimer cette campagne (${count})`
        }
        title={connected ? undefined : 'Connectez-vous pour aimer cette campagne'}
        className={cn(
          'flex items-center gap-1 rounded transition-colors',
          connected ? 'hover:text-coral' : 'cursor-default',
          busy && 'opacity-60',
        )}
      >
        {/* Le cœur rempli est l'accent du produit ; le contour reste gris. */}
        <Heart
          className={cn('size-3', liked ? 'fill-coral text-coral' : 'text-gray-400')}
          aria-hidden
        />
        <span>{compactCount(count)}</span>
      </button>

      {/*
        Le message d'erreur est un `status` : il est annoncé aux lecteurs
        d'écran sans interrupting la lecture en cours, et il disparaît au
        prochain clic.
      */}
      {error && (
        <span
          role="status"
          className="absolute left-0 top-full z-30 mt-1 w-max max-w-56 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] leading-snug text-gray-700 shadow-md"
        >
          {error}
          {connected && (
            <a
              href="/login"
              className="ml-1 font-medium text-purple underline underline-offset-2"
            >
              Se connecter
            </a>
          )}
        </span>
      )}
    </span>
  );
}

/**
 * Le compteur d'utilisations, à côté du cœur.
 *
 * Ce n'est pas un bouton : rien ne se passe dessus. Il est ici parce que les
 * deux chiffres se lisent ensemble — « 842 personnes ont aimé, 3 200 ont
 * téléchargé » — et qu'un compteur seul perdrait son sens.
 */
export function UsageCount({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-1">
      <Users className="size-3 text-gray-400" aria-hidden />
      {compactCount(count)} utilisations
    </span>
  );
}