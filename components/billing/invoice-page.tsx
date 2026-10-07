'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/ui/feedback';
import { formatFcfaPrice } from '@/lib/pricing/config';

type Invoice = {
  id: string;
  invoice_number: string;
  currency: string;
  subtotal: number | string;
  total: number | string;
  status: string;
  seller: Record<string, unknown>;
  buyer: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  issued_at: string;
  paid_at: string | null;
};

function text(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : 'À COMPLÉTER';
}

function dateLabel(value: string | null): string {
  if (!value) return 'À COMPLÉTER';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'À COMPLÉTER';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Ouagadougou',
  }).format(date);
}

export function InvoicePage({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/invoices?id=${encodeURIComponent(invoiceId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as { invoice?: Invoice; error?: string };
        if (!response.ok || !data.invoice) throw new Error(data.error ?? 'Facture introuvable.');
        if (alive) setInvoice(data.invoice);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : 'Impossible de charger la facture.');
      });
    return () => {
      alive = false;
    };
  }, [invoiceId]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <InlineError>{error}</InlineError>
        <Link href="/dashboard/acheter" className="mt-5 inline-flex text-[13px] font-medium text-ink underline underline-offset-4">
          Retour aux achats
        </Link>
      </div>
    );
  }

  if (!invoice) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="size-5 animate-spin text-gray-400" /></div>;
  }

  const seller = invoice.seller ?? {};
  const buyer = invoice.buyer ?? {};
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/acheter" className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-ink">
          <ArrowLeft className="size-3.5" aria-hidden />
          Retour aux achats
        </Link>
        <Button variant="secondary" onClick={() => window.print()}>
          <Download className="size-4" aria-hidden />
          Imprimer / enregistrer en PDF
        </Button>
      </div>

      <article className="invoice-paper rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:p-10">
        <header className="flex flex-col gap-7 border-b border-gray-200 pb-7 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[22px] font-bold text-ink">Campagnes</p>
            <p className="mt-1 text-[12px] text-gray-500">{text(seller.product)}</p>
            <p className="mt-4 max-w-xs text-[12px] leading-relaxed text-gray-600">
              {text(seller.name)}<br />
              {text(seller.address)}<br />
              {text(seller.email)}<br />
              RCCM : {text(seller.rccm)}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Facture</p>
            <p className="mt-2 text-[21px] font-bold text-ink">{invoice.invoice_number}</p>
            <p className="mt-2 text-[12px] text-gray-500">Émise le {dateLabel(invoice.issued_at)}</p>
            <p className="text-[12px] font-medium text-success">Paiement confirmé</p>
          </div>
        </header>

        <section className="grid gap-5 border-b border-gray-200 py-7 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Facturé à</p>
            <p className="mt-2 text-[13px] font-semibold text-ink">{text(buyer.name)}</p>
            <p className="mt-1 text-[12px] text-gray-600">{text(buyer.email)}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Référence</p>
            <p className="mt-2 text-[12px] text-gray-600">Document généré après confirmation serveur.</p>
          </div>
        </section>

        <section className="py-7">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="pb-3">Désignation</th>
                <th className="pb-3 text-right">Qté</th>
                <th className="pb-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className="border-b border-gray-100">
                  <td className="py-4 font-medium text-ink">{text(line.description)}</td>
                  <td className="py-4 text-right text-gray-600">{String(line.quantity ?? 1)}</td>
                  <td className="py-4 text-right font-medium tabular-nums text-ink">{formatFcfaPrice(Number(line.total ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 ml-auto max-w-xs space-y-2 text-[13px]">
            <div className="flex justify-between gap-4 text-gray-600"><span>Sous-total</span><span className="tabular-nums">{formatFcfaPrice(Number(invoice.subtotal))}</span></div>
            <div className="flex justify-between gap-4 border-t border-gray-200 pt-3 text-[16px] font-bold text-ink"><span>Total payé</span><span className="tabular-nums">{formatFcfaPrice(Number(invoice.total))}</span></div>
          </div>
        </section>

        <footer className="border-t border-gray-200 pt-5 text-[11px] leading-relaxed text-gray-500">
          Devise : {invoice.currency}. Cette facture correspond à un paiement Mobile Money confirmé. Aucun prélèvement automatique n’est associé à cet achat.
        </footer>
      </article>
    </div>
  );
}
