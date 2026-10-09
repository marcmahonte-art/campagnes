import type { Metadata } from 'next';
import { SystemView } from './system-view';

export const metadata: Metadata = {
  title: 'Système — Administration Campagnes',
  robots: { index: false, follow: false },
};

export default function SuperAdminSystemPage() {
  return <SystemView />;
}
