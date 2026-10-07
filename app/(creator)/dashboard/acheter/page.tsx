import type { Metadata } from 'next';
import { CheckoutPage } from '@/components/billing/checkout-page';

export const metadata: Metadata = {
  title: 'Acheter — Campagnes',
  description: 'Gérez votre formule, vos crédits et vos factures depuis votre compte Campagnes.',
};

export default function AcheterPage() {
  return <CheckoutPage />;
}
