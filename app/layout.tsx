import type { Metadata, Viewport } from 'next';
import {
  Inter,
  Satisfy,
  Playfair_Display,
  Montserrat,
  Poppins,
  Roboto,
  Lora,
  Bebas_Neue,
} from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/lib/backend/session';
import { DemoBanner } from '@/components/ui/feedback';
import { isDemoMode } from '@/lib/backend';
import { SITE_URL } from '@/lib/backend/config';

/*
 * Polices de l'éditeur. Chaque police déclare les variantes qu'elle possède
 * réellement (voir `lib/fonts.ts`) : sans `style: ['normal', 'italic']`, le
 * bouton Italique ne produirait qu'un faux italique fabriqué par le navigateur.
 */

const inter = Inter({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});

const montserrat = Montserrat({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-montserrat',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-poppins',
  display: 'swap',
});

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-roboto',
  display: 'swap',
});

const lora = Lora({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-lora',
  display: 'swap',
});

// Bebas Neue n'existe qu'en graisse 400, sans italique : rien à charger de plus.
const bebas = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-bebas',
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
  // Sans `metadataBase`, Next.js résout les URL canoniques et Open Graph en
  // `localhost:3000` — y compris en production. Les pages légales déclarent une
  // canonique : elles seraient donc annoncées à la mauvaise adresse.
  metadataBase: new URL(SITE_URL),
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
    <html
      lang="fr"
      className={`${inter.variable} ${playfair.variable} ${montserrat.variable} ${poppins.variable} ${roboto.variable} ${lora.variable} ${bebas.variable} ${satisfy.variable}`}
    >
      <body className="min-h-dvh bg-white text-ink">
        <SessionProvider>
          {isDemoMode && <DemoBanner />}
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
