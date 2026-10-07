import type { Metadata } from 'next';
import { InvoicePage } from '@/components/billing/invoice-page';

export const metadata: Metadata = {
  title: 'Facture — Campagnes',
};

export default async function InvoiceRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoicePage invoiceId={id} />;
}
