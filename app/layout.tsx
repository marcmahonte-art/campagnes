import type { Metadata, Viewport } from 'next';
import { Inter, Satisfy } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/lib/backend/session';
import { DemoBanner } from '@/components/ui/feedback';
import { isDemoMode } from '@/lib/backend';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Réservée au wordmark — jamais utilisée comme police d'interface (§4).
const satisfy = Satisfy({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-satisfy',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Campagnes — Créez. Animez. Partagez.',
    template: '%s · Campagnes',
  },
  description:
    'Créez des campagnes visuelles que votre communauté peut utiliser en quelques secondes. Un lien, un cadre, aucune installation.',
  applicationName: 'Campagnes',
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${satisfy.variable}`}>
      <body className="min-h-dvh bg-white text-ink">
        <SessionProvider>
          {isDemoMode && <DemoBanner />}
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
