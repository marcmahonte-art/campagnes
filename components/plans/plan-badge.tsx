import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { planOf, type PlanId } from '@/lib/plans';

/**
 * Pastille de formule.
 *
 * Composant **sans état** : il ne fait que rendre un nom de formule. Il vit
 * hors de `plan-card.tsx` (qui est client) pour que les écrans serveur — layout
 * du tableau de bord, page réglages — puissent l'afficher sans entraîner tout
 * leur sous-arbre dans le rendu client.
 */
export function PlanBadge({
  plan,
  className,
}: {
  plan: PlanId | string | null;
  className?: string;
}) {
  const spec = planOf(plan);

  if (spec.id === 'free') {
    return (
      <Badge tone="neutral" className={className}>
        Gratuit
      </Badge>
    );
  }

  return (
    <span
      className={cn(
        'ring-brand-gradient inline-flex items-center rounded-pill bg-white px-2.5 py-1 text-xs font-semibold text-ink',
        className,
      )}
    >
      {spec.name}
    </span>
  );
}
