'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock3, FileText, Loader2, Receipt, Smartphone } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DismissibleNotice, InlineError } from '@/components/ui/feedback';
import { useSession } from '@/lib/backend/session';
import type { PlanId } from '@/lib/plans';
import {
  DISTRIBUTION_PACKS,
  PRICING_PLANS,
  PRICING_PERIODS,
  formatFcfaPrice,
  getPlanPeriodPrice,
  type BillingDuration,
} from '@/lib/pricing/config';

const PAID_PLANS: PlanId[] = ['creator', 'organization'];
const CREDIT_PACKS = DISTRIBUTION_PACKS.filter(
  (pack) => pack.priceFcfa !== null && pack.distributions !== null,
);

type BillingSummary = {
  balance: number;
  campaigns: Array<{
    id: string;
    name: string;
    participants_used: number;
    participants_granted: number;
  }>;
  invoices: Array<{
    id: string;
    invoice_number: string;
    total: number | string;
    currency: string;
    issued_at: string;
  }>;
};

function validPlan(value: string | null): PlanId {
  return value && PAID_PLANS.includes(value as PlanId) ? (value as PlanId) : 'creator';
}

function validDuration(value: string | null): BillingDuration {
  return value === '6m' || value === '12m' ? value : '1m';
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Ouagadougou',
  }).format(date);
}

export function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refresh } = useSession();
  const [plan, setPlan] = useState<PlanId>(() => validPlan(searchParams.get('plan')));
  const [duration, setDuration] = useState<BillingDuration>(() => validDuration(searchParams.get('duration')));
  const [packId, setPackId] = useState(CREDIT_PACKS[0]?.id ?? 'pack_100');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [allocationCampaignId, setAllocationCampaignId] = useState('');
  const [allocationAmount, setAllocationAmount] = useState('100');
  const [allocating, setAllocating] = useState(false);
  const handledDeposit = useRef<string | null>(null);

  const type = searchParams.get('type') === 'credits' ? 'credits' : 'plan';
  const depositId = searchParams.get('depositId');
  const period = useMemo(() => getPlanPeriodPrice(plan, duration), [plan, duration]);
  const selectedPack = CREDIT_PACKS.find((pack) => pack.id === packId) ?? CREDIT_PACKS[0];

  async function loadSummary() {
    try {
      const response = await fetch('/api/billing/summary', { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as BillingSummary;
      setSummary(data);
      setAllocationCampaignId((current) => current || data.campaigns?.[0]?.id || '');
    } catch {
      // L'achat reste possible même si le résumé est momentanément indisponible.
    }
  }

  useEffect(() => {
    if (user) void loadSummary();
  }, [user]);

  useEffect(() => {
    if (!depositId || handledDeposit.current === depositId) return;
    handledDeposit.current = depositId;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/payments/pawapay/check?depositId=${encodeURIComponent(depositId)}`,
        );
        const data = (await response.json()) as {
          status?: string;
          failureMessage?: string;
          error?: string;
          purchaseType?: string;
        };
        if (cancelled) return;

        if (data.status === 'completed') {
          await refresh();
          await loadSummary();
          setNotice(
            data.purchaseType === 'account_credits'
              ? 'Paiement confirmé. Vos crédits sont maintenant disponibles dans votre compte.'
              : 'Paiement confirmé. Votre formule est maintenant active dans votre compte.',
          );
        } else if (data.status === 'failed') {
          setError(
            data.failureMessage
              ? `Le paiement a échoué : ${data.failureMessage}`
              : 'Le paiement Mobile Money a été refusé ou annulé. Vous pouvez réessayer.',
          );
        } else if (data.error) {
          setError(
            'Votre paiement a bien été reçu, mais sa confirmation nécessite une vérification. ' +
              'Aucun achat n’a été crédité pour le moment.',
          );
        } else {
          setNotice(
            'Paiement en cours de confirmation par votre opérateur. Votre compte sera mis à jour dès la validation.',
          );
        }
      } catch {
        if (!cancelled) setError('Impossible de vérifier le paiement pour le moment. Rechargez la page dans un instant.');
      } finally {
        if (!cancelled) {
          const params = new URLSearchParams(searchParams.toString());
          params.delete('depositId');
          router.replace(`/dashboard/acheter${params.toString() ? `?${params}` : ''}`, { scroll: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [depositId, refresh, router, searchParams]);

  async function allocateCredits() {
    const amount = Number(allocationAmount);
    if (!allocationCampaignId || !Number.isInteger(amount) || amount <= 0) {
      setError('Sélectionnez une campagne et un nombre de crédits supérieur à zéro.');
      return;
    }
    if (!summary || amount > summary.balance) {
      setError('Votre solde de crédits est insuffisant.');
      return;
    }

    setAllocating(true);
    setError(null);
    try {
      const response = await fetch('/api/billing/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: allocationCampaignId, amount, reference: crypto.randomUUID() }),
      });
      const data = (await response.json()) as { balance?: number; error?: string };
      if (!response.ok) {
        setError(data.error ?? 'Impossible d’affecter les crédits.');
        return;
      }
      setSummary((current) => current ? { ...current, balance: Number(data.balance ?? 0) } : current);
      setNotice(` ${amount} crédits ont été affectés à votre campagne.`.trim());
    } catch {
      setError('Impossible de joindre le service de crédits. Réessayez.');
    } finally {
      setAllocating(false);
    }
  }

  async function startPayment() {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent('/dashboard/acheter')}`);
      return;
    }

    setPending(true);
    setError(null);
    setNotice(null);

    try {
      const body = type === 'credits' ? { packId } : { plan, duration };
      const response = await fetch('/api/payments/pawapay/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { success?: boolean; redirectUrl?: string; error?: string };

      if (!response.ok || !data.success || !data.redirectUrl) {
        setError(data.error ?? 'Le paiement n’a pas pu être initialisé. Réessayez.');
        return;
      }

      window.location.href = data.redirectUrl;
    } catch {
      setError('Impossible de joindre le service de paiement Mobile Money. Réessayez.');
    } finally {
      setPending(false);
    }
  }

  if (!user) return null;

  const isCurrentPlan = type === 'plan' && user.plan === plan;
  const selectedAmount = type === 'credits' ? selectedPack?.priceFcfa ?? 0 : period.totalFcfa;
  const selectedLabel = type === 'credits' ? selectedPack?.name ?? 'Crédits' : PRICING_PLANS[plan].name;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-3">
        <Link href="/dashboard" className="flex w-fit items-center gap-1.5 text-[13px] text-gray-500 hover:text-ink">
          <ArrowLeft className="size-3.5" aria-hidden />
          Retour au dashboard
        </Link>
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-purple">Achats du compte</p>
          <h1 className="mt-2 text-[28px] font-bold leading-tight md:text-[36px]">Choisissez votre achat</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
            Votre paiement, votre activation et votre facture restent rattachés à ce compte.
          </p>
        </div>
      </header>

      <InlineError>{error}</InlineError>
      {notice && <DismissibleNotice onDismiss={() => setNotice(null)}>{notice}</DismissibleNotice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="p-5 md:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-pill bg-gray-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              {type === 'credits' ? 'Crédits de compte' : 'Formule'}
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-gray-500">
              <Smartphone className="size-3.5" aria-hidden /> Paiement Mobile Money
            </span>
          </div>

          {type === 'plan' ? (
            <div className="mt-6 flex flex-col gap-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {PAID_PLANS.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => setPlan(candidate)}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      plan === candidate ? 'border-purple bg-purple/5 ring-1 ring-purple/20' : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <span className="block text-[15px] font-semibold text-ink">{PRICING_PLANS[candidate].name}</span>
                    <span className="mt-1 block text-[12px] leading-relaxed text-gray-500">{PRICING_PLANS[candidate].tagline}</span>
                  </button>
                ))}
              </div>

              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">Durée prépayée</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {PRICING_PERIODS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDuration(item.id)}
                      className={`min-h-11 rounded-md border px-3 py-2 text-[13px] font-medium ${
                        duration === item.id ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {item.label}{item.badge ? ` · ${item.badge}` : ''}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-[12px] text-gray-500">Formule sélectionnée</p>
                <p className="mt-1 text-lg font-semibold text-ink">{PRICING_PLANS[plan].name}</p>
                <p className="mt-1 text-[13px] text-gray-500">{PRICING_PLANS[plan].quotaLabel}</p>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">Pack de crédits</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {CREDIT_PACKS.map((pack) => (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => setPackId(pack.id)}
                      className={`rounded-lg border p-4 text-left ${
                        pack.id === packId ? 'border-purple bg-purple/5 ring-1 ring-purple/20' : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <span className="block text-[15px] font-semibold text-ink">{pack.name}</span>
                      <span className="mt-1 block text-[13px] font-medium text-gray-700">{formatFcfaPrice(pack.priceFcfa ?? 0)}</span>
                      <span className="mt-1 block text-[12px] leading-relaxed text-gray-500">{pack.tagline}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-purple/15 bg-purple/5 p-4 text-[13px] leading-relaxed text-gray-700">
                Ces crédits restent dans votre compte et ne sont pas liés à une seule campagne. Vous pourrez les affecter progressivement depuis votre espace.
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">Affecter des crédits</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
                  <label className="text-[12px] text-gray-600">
                    Campagne
                    <select
                      value={allocationCampaignId}
                      onChange={(event) => setAllocationCampaignId(event.target.value)}
                      className="mt-1 h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] text-ink"
                    >
                      <option value="">Choisir une campagne</option>
                      {summary?.campaigns?.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[12px] text-gray-600">
                    Quantité
                    <Input type="number" min={1} step={1} value={allocationAmount} onChange={(event) => setAllocationAmount(event.target.value)} className="mt-1" />
                  </label>
                  <Button variant="secondary" onClick={() => void allocateCredits()} disabled={allocating || !summary || summary.balance <= 0}>
                    {allocating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Affecter'}
                  </Button>
                </div>
                {summary?.campaigns?.length === 0 && <p className="mt-3 text-[12px] text-gray-500">Créez d’abord une campagne pour utiliser vos crédits.</p>}
              </div>
            </div>
          )}

          <div className="mt-7 flex flex-col gap-4 border-t border-gray-100 pt-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[12px] text-gray-500">Total à payer</p>
              <p className="mt-1 text-[30px] font-extrabold tracking-tight text-ink tabular-nums">{formatFcfaPrice(selectedAmount)}</p>
              <p className="mt-1 text-[12px] text-gray-500">Pas de reconduction automatique.</p>
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={() => void startPayment()}
              disabled={pending || selectedAmount <= 0}
            >
              {pending ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Connexion sécurisée…</> : <><Smartphone className="size-4" aria-hidden /> Payer avec Mobile Money</>}
            </Button>
          </div>

          {isCurrentPlan && (
            <p className="mt-3 text-right text-[12px] text-gray-500">Cette formule est déjà active : le paiement prolongera sa période.</p>
          )}
        </Card>

        <aside className="flex flex-col gap-5">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Receipt className="size-4 text-purple" aria-hidden />
              <h2 className="text-[14px] font-semibold">Votre compte</h2>
            </div>
            <p className="mt-4 text-[12px] text-gray-500">Solde de crédits achetés</p>
            <p className="mt-1 text-[26px] font-bold text-ink tabular-nums">{summary ? new Intl.NumberFormat('fr-FR').format(summary.balance) : '—'}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-gray-500">Les crédits achetés ne sont pas remis à zéro à l’échéance d’une formule.</p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-purple" aria-hidden />
              <h2 className="text-[14px] font-semibold">Mes factures</h2>
            </div>
            {!summary || summary.invoices.length === 0 ? (
              <p className="mt-3 text-[12px] leading-relaxed text-gray-500">Votre première facture apparaîtra ici après confirmation du paiement.</p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100">
                {summary.invoices.slice(0, 5).map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-ink">{invoice.invoice_number}</p>
                      <p className="text-[11px] text-gray-500">{formatDate(invoice.issued_at)}</p>
                    </div>
                    <ButtonLink href={`/dashboard/factures/${invoice.id}`} variant="ghost" size="sm">Voir</ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[12px] text-gray-500">
        <CheckCircle2 className="size-4 text-success" aria-hidden />
        <span>{selectedLabel} · {formatFcfaPrice(selectedAmount)} · confirmation serveur avant activation</span>
        <Clock3 className="ml-2 size-4" aria-hidden />
        <span>Une confirmation peut prendre quelques instants.</span>
      </div>
    </div>
  );
}
