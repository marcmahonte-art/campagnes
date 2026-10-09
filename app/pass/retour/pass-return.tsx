'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Loader2, TriangleAlert } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { Button, ButtonLink } from '@/components/ui/button';

/**
 * Confirmation du pass, après retour de la page de paiement.
 *
 * Pourquoi une page dédiée plutôt qu'un simple message : en Mobile Money,
 * l'utilisateur valide un PIN sur son téléphone, puis revient — parfois avant que
 * la notification serveur (webhook) ne soit arrivée. Cette page **re-vérifie**
 * donc l'état chez la passerelle, à plusieurs reprises, jusqu'à la confirmation.
 * Le pass s'active alors côté serveur, exactement comme s'il l'avait été par le
 * webhook : une seule et même fonction porte l'activation.
 *
 * Elle ne montre jamais de montant ni de référence technique : uniquement l'état
 * du droit et, le cas échéant, l'échéance.
 */

type Phase = 'checking' | 'active' | 'failed' | 'expired' | 'timeout' | 'invalid';

/** Rythme et durée d'attente : ~1 minute, assez pour un PIN Mobile Money lent. */
const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 20;

export function PassReturn({
  checkoutId,
  campaignSlug,
}: {
  checkoutId: string | null;
  campaignSlug: string | null;
}) {
  const [phase, setPhase] = useState<Phase>(checkoutId ? 'checking' : 'invalid');
  const attempts = useRef(0);

  useEffect(() => {
    if (!checkoutId) return;

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      attempts.current += 1;
      try {
        const res = await fetch('/api/passes/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkoutId }),
          cache: 'no-store',
        });
        const data = (await res.json().catch(() => ({}))) as {
          active?: boolean;
          status?: string;
        };
        if (cancelled) return;

        if (data.active) {
          setPhase('active');
          return;
        }
        if (data.status === 'failed' || data.status === 'cancelled') {
          setPhase('failed');
          return;
        }
        if (data.status === 'expired') {
          setPhase('expired');
          return;
        }
      } catch {
        // On réessaie : un aller-retour réseau raté n'est pas un échec de paiement.
      }

      if (cancelled) return;
      if (attempts.current >= MAX_ATTEMPTS) {
        setPhase('timeout');
        return;
      }
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [checkoutId]);

  const backHref = campaignSlug ? `/c/${campaignSlug}` : '/';

  const copy: Record<Phase, { tone: 'ok' | 'warn' | 'error'; title: string; text: string }> = {
    checking: {
      tone: 'warn',
      title: 'Vérification de votre paiement…',
      text: 'Nous interrogeons l’opérateur. Cela prend quelques instants — ne fermez pas cette page.',
    },
    active: {
      tone: 'ok',
      title: 'Votre pass est actif',
      text: 'Le filigrane est retiré pour 24 heures sur ce navigateur. Retournez à la campagne pour télécharger votre visuel.',
    },
    failed: {
      tone: 'error',
      title: 'Le paiement n’a pas abouti',
      text: 'Aucun montant n’a été débité par Campagnes. Vous pouvez réessayer depuis la campagne.',
    },
    expired: {
      tone: 'error',
      title: 'Le paiement a expiré',
      text: 'Le délai de validation est dépassé. Aucun montant n’a été débité. Vous pouvez relancer l’achat.',
    },
    timeout: {
      tone: 'warn',
      title: 'Paiement en cours de vérification',
      text: 'La confirmation n’est pas encore arrivée. Si vous avez validé le paiement, le pass s’activera automatiquement — vous pouvez fermer cette page et revenir plus tard.',
    },
    invalid: {
      tone: 'error',
      title: 'Lien incomplet',
      text: 'Cette page doit être ouverte depuis le retour de paiement. Reprenez l’achat depuis la campagne.',
    },
  };

  const current = copy[phase];
  const Icon =
    current.tone === 'ok' ? CheckCircle2 : current.tone === 'error' ? TriangleAlert : phase === 'checking' ? Loader2 : Clock;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-white px-4 py-10 text-center">
      <Logo size="lg" asLink={false} />

      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <span
          className={
            'mx-auto flex size-12 items-center justify-center rounded-full ' +
            (current.tone === 'ok'
              ? 'bg-success/10 text-success'
              : current.tone === 'error'
                ? 'bg-error/10 text-error'
                : 'bg-gray-100 text-gray-500')
          }
        >
          <Icon
            className={'size-6 ' + (phase === 'checking' ? 'animate-spin' : '')}
            strokeWidth={1.75}
            aria-hidden
          />
        </span>

        <h1 className="mt-4 text-[18px] font-bold leading-snug text-ink">{current.title}</h1>
        <p role="status" className="mt-2 text-[13px] leading-relaxed text-gray-500">
          {current.text}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <ButtonLink href={backHref} variant={phase === 'active' ? 'primary' : 'secondary'} size="md">
            {campaignSlug ? 'Retour à la campagne' : 'Retour à l’accueil'}
          </ButtonLink>
          {(phase === 'failed' || phase === 'expired' || phase === 'timeout') && (
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                attempts.current = 0;
                setPhase(checkoutId ? 'checking' : 'invalid');
              }}
            >
              Vérifier à nouveau
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
