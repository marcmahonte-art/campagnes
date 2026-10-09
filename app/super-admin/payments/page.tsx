import type { Metadata } from 'next';
import { PaymentsView } from './payments-view';

export const metadata: Metadata = {
  title: 'Paiements — Administration Campagnes',
  robots: { index: false, follow: false },
};

export default function SuperAdminPaymentsPage() {
  return <PaymentsView />;
}
