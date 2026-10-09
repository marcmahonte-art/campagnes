import type { Metadata } from 'next';
import { OverviewView } from './overview-view';

export const metadata: Metadata = {
  title: 'Vue d’ensemble — Administration Campagnes',
  robots: { index: false, follow: false },
};

/**
 * La page reste un composant serveur : elle ne fait que poser le titre et
 * déléguer la lecture à la vue cliente, qui passe par `/api/admin/*`. La garde
 * d'accès, elle, vit dans `layout.tsx` — jamais dans la page.
 */
export default function SuperAdminOverviewPage() {
  return <OverviewView />;
}
