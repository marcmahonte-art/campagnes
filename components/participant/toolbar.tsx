import Link from 'next/link';
import { ArrowLeft, Menu } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';

/**
 * Toolbar affiché sous l'en‑tête de la page participant.
 * Il utilise le gradient de marque du système Campagnes.
 */
export function Toolbar() {
  return (
    <div className="border-b border-gray-200 bg-gradient-to-r from-[#7B61FF] via-[#FF6B6B] to-[#FFD93D] py-2">
      <div className="container-shell flex items-center justify-between gap-4">
        {/* Retour à l'accueil */}
        <Link href="/" className="flex items-center gap-1.5 text-sm text-white hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Retour
        </Link>
        {/* Logo central */}
        <Logo size="sm" className="text-white" />
        {/* Menu placeholder (peut être étendu) */}
        <Button variant="ghost" size="sm" className="text-white">
          <Menu className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
