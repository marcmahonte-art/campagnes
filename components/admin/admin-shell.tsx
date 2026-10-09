import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/logo';

/**
 * Coquille du Super Admin — composant **serveur**.
 *
 * Rien ici n'a besoin du navigateur : pas de hook, pas d'état, pas de clé. La
 * garde d'accès et les textes restent donc côté serveur, et seuls les éléments
 * réellement interactifs (navigation active) sont expédiés au client.
 *
 * Le style reste sobre : fond clair, bordures fines, aucune animation. Un
 * outil interne n'a pas à distraire de ce qu'il mesure.
 */

export function AdminHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight">{title}</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-gray-500">
            {description}
          </p>
        </div>
        {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
      </div>
    </header>
  );
}

export function AdminBrand() {
  return (
    <div className="flex items-center justify-between gap-3">
      <Logo size="sm" />
      <span className="rounded-pill bg-gray-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">
        Admin
      </span>
    </div>
  );
}
