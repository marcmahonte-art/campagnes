import type { Metadata } from 'next';
import { CampaignsView } from './campaigns-view';

export const metadata: Metadata = {
  title: 'Campagnes — Administration Campagnes',
  robots: { index: false, follow: false },
};

export default function SuperAdminCampaignsPage() {
  return <CampaignsView />;
}
