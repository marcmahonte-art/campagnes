import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="container-shell flex h-16 items-center">
        <Logo size="sm" />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[440px] animate-fade-up">{children}</div>
      </main>

      <footer className="container-shell pb-8 text-center">
        <Link href="/" className="text-[13px] text-gray-500 transition-colors hover:text-ink">
          ← Retour à l’accueil
        </Link>
      </footer>
    </div>
  );
}
