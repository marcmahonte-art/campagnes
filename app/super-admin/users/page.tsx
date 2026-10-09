import type { Metadata } from 'next';
import { UsersView } from './users-view';

export const metadata: Metadata = {
  title: 'Utilisateurs — Administration Campagnes',
  robots: { index: false, follow: false },
};

export default function SuperAdminUsersPage() {
  return <UsersView />;
}
