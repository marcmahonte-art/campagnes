'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Coins, Info, Receipt } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PackCard } from '@/components/credits/pack-card';
import { ButtonLink } from '@/components/ui/button';
import { InlineError, Spinner } from '@/components/ui/feedback';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { CREDIT_PACKS, FREE_TEST_QUOTA, canCover } from '@/lib/credits';
import { formatFcfa } from '@/lib/plans';
import type { CampaignWithFrame, CreditReason, CreditTransaction } from '@/lib/types';

const REASON_LABELS: Record<CreditReason, string> = {
  pack_purchase: 'Achat de pack',
  free_quota: 'Dotation de bienvenue',
  campaign_budget: 'Budget de campagne',
  participation: 'Participation',
  refund: 'Remboursement',
};

const numberFormat = new Intl.NumberFormat('fr-FR');

export default function CreditsPage() {
  const { user, refresh } = useSession();

  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignWithFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingPack, setPendingPack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [tx, list] = await Promise.all([
      backend.listCreditTransactions(user.id),
      backend.listCampaigns(user.id),
    ]);
    setTransactions(tx);
    setCampaigns(list);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function buy(packId: string) {
    if (!user) return;
    setError(null);
    setPendingPack(packId);

    const result = await backend.purchasePack(user.id, packId);
    if (result.error) {
      setError(result.error);
      setPendingPack(null);
      return;
    }

    await refresh();
    await load();
    setPendingPack(null);
  }

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-5 text-gray-400" />
      </div>
    );
  }

  const balance = user.credits ?? 0;
  const engaged = campaigns.reduce(
    (sum, c) => sum + Math.max(0, c.distribution_budget - c.credits_consumed),
    0,
  );
  const consumed = campaigns.reduce((sum, c) => sum + c.credits_consumed, 0);

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-[28px] font-bold leading-tight md:text-[36px]">Distribution</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
          Vos crédits financent la diffusion de vos campagnes. Ils ne sont décomptés que lorsqu’un
          participant aboutit réellement — jamais à l’ouverture du lien.
        </p>
      </header>

      <InlineError>{error}</InlineError>

      {/* ---------------- Solde ---------------- */}
      <div className="grid gap-5 md:grid-cols-[1.2fr_1fr_1fr]">
        <Card className="flex flex-col justify-between p-6">
          <div className="flex items-center gap-2 text-[13px] font-medium text-gray-500">
            <Coins className="size-4 text-purple" strokeWidth={1.75} aria-hidden />
            Solde disponible
          </div>
          <p className="mt-4 text-[40px] font-bold leading-none">{numberFormat.format(balance)}</p>
          <p className="mt-2 text-[13px] text-gray-500">
            participations · soit {numberFormat.format(consumed)} déjà consommées
          </p>
        </Card>

        <Card className="flex flex-col justify-between p-6">
          <span className="text-[13px] font-medium text-gray-500">Engagé sur vos campagnes</span>
          <p className="mt-4 text-[32px] font-bold leading-none">{numberFormat.format(engaged)}</p>
          <p className="mt-2 text-[13px] text-gray-500">
            réservé par les budgets en cours, non encore consommé
          </p>
        </Card>

        <Card className="flex flex-col justify-between p-6">
          <span className="text-[13px] font-medium text-gray-500">Campagnes actives</span>
          <p className="mt-4 text-[32px] font-bold leading-none">
            {campaigns.filter((c) => c.status === 'published').length}
          </p>
          <Link
            href="/dashboard"
            className="mt-2 text-[13px] text-gray-500 underline underline-offset-4 transition-colors hover:text-ink"
          >
            Voir mes campagnes
          </Link>
        </Card>
      </div>

      {balance < engaged && (
        <p className="flex items-start gap-2 rounded-md border border-error/25 bg-error/5 px-3 py-2 text-[13px] text-error">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Vos budgets engagés ({numberFormat.format(engaged)}) dépassent votre solde (
            {numberFormat.format(balance)}). Rechargez pour honorer vos campagnes en cours.
          </span>
        </p>
      )}

      {/* ---------------- Packs ---------------- */}
      <section className="flex flex-col gap-5">
        <div>
          <h2 className="text-[18px] font-semibold">Recharger</h2>
          <p className="mt-1 text-[13px] text-gray-500">
            Plus le volume est important, plus le prix par participant baisse.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CREDIT_PACKS.map((pack) => {
            const onQuote = pack.participants === null;
            return (
              <PackCard
                key={pack.id}
                pack={pack}
                owned={balance}
                pending={pendingPack === pack.id}
                onBuy={onQuote ? undefined : () => void buy(pack.id)}
              />
            );
          })}
        </div>

        <p className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] leading-relaxed text-gray-500">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Aucun prestataire de paiement n’est branché à ce stade : l’achat est simulé et le solde
            est crédité immédiatement. C’est ici que viendra le guichet Mobile Money.
          </span>
        </p>
      </section>

      {/* ---------------- Comment ça marche ---------------- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-[18px] font-semibold">Comment le décompte fonctionne</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: 'Vous rechargez',
              text: 'Vous achetez un volume de participations. Les crédits restent sur votre compte.',
            },
            {
              title: 'Vous arbitrez',
              text: 'Sur chaque campagne, vous fixez un budget : le nombre de participations autorisées.',
            },
            {
              title: 'Nous décomptons',
              text: 'Un crédit part uniquement quand un participant repart avec son visuel.',
            },
          ].map((step, index) => (
            <Card key={step.title} className="p-5">
              <span className="text-xs font-medium text-gray-400">Étape {index + 1}</span>
              <h3 className="mt-1 text-[15px] font-semibold">{step.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-500">{step.text}</p>
            </Card>
          ))}
        </div>

        {balance < FREE_TEST_QUOTA && (
          <Card className="flex flex-col items-start gap-4 p-5 md:flex-row md:items-center">
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold">Besoin d’un volume sur mesure ?</h3>
              <p className="mt-1 text-[13px] text-gray-500">
                Au-delà de 10 000 participants, nous adaptons les conditions à votre campagne.
              </p>
            </div>
            <ButtonLink href="/tarifs" variant="ghost" size="sm" className="shrink-0">
              Voir la grille complète
            </ButtonLink>
          </Card>
        )}
      </section>

      {/* ---------------- Historique ---------------- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[18px] font-semibold">Historique</h2>
          <span className="text-[13px] text-gray-500">
            {transactions.length} mouvement{transactions.length > 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner className="size-5 text-gray-400" />
          </div>
        ) : transactions.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <Receipt className="size-6 text-gray-300" strokeWidth={1.5} aria-hidden />
            <p className="text-sm text-gray-500">Aucun mouvement pour le moment.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-gray-100 overflow-hidden">
            {transactions.map((tx) => {
              const positive = tx.amount > 0;
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50"
                >
                  <span
                    className={
                      positive
                        ? 'flex size-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success'
                        : 'flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500'
                    }
                  >
                    {positive ? (
                      <ArrowDownLeft className="size-4" strokeWidth={2} aria-hidden />
                    ) : (
                      <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{tx.label}</p>
                    <p className="mt-0.5 text-[12px] text-gray-500">
                      {REASON_LABELS[tx.reason]} ·{' '}
                      {new Date(tx.created_at).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>

                  <span
                    className={
                      positive
                        ? 'shrink-0 text-[13px] font-semibold text-success'
                        : 'shrink-0 text-[13px] font-semibold text-gray-700'
                    }
                  >
                    {positive ? '+' : '−'}
                    {numberFormat.format(Math.abs(tx.amount))}
                  </span>
                </div>
              );
            })}
          </Card>
        )}

        <p className="text-[12px] leading-relaxed text-gray-500">
          Total rechargé :{' '}
          {formatFcfa(
            transactions
              .filter((t) => t.reason === 'pack_purchase')
              .reduce((sum, t) => {
                const pack = CREDIT_PACKS.find((p) => p.participants === t.amount);
                return sum + (pack?.priceFcfa ?? 0);
              }, 0),
          )}{' '}
          — {canCover(balance, engaged) ? 'budgets couverts' : 'budgets non couverts'}.
        </p>
      </section>
    </div>
  );
}
