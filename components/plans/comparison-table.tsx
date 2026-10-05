import { Check, Minus } from 'lucide-react';
import { COMPARISON, type ComparisonRow } from '@/lib/plans';
import { cn } from '@/lib/cn';

/** Ordre des groupes — celui de `COMPARISON`, donc l'ordre de lecture du lecteur. */
const GROUPS: ComparisonRow['group'][] = ['Général', 'Création', 'Modules', 'Distribution'];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex justify-center">
        <Check className="size-4 text-purple" strokeWidth={2.25} aria-hidden />
        <span className="sr-only">Inclus</span>
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex justify-center">
        <Minus className="size-4 text-gray-300" strokeWidth={2} aria-hidden />
        <span className="sr-only">Non inclus</span>
      </span>
    );
  }
  return <span className="text-[13px] text-gray-700">{value}</span>;
}

/**
 * Matrice comparative. Sur mobile elle se replie en trois blocs empilés plutôt
 * que de forcer un défilement horizontal illisible.
 */
export function ComparisonTable() {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* ---------- En-tête (desktop) ---------- */}
      <div className="hidden grid-cols-[1.6fr_repeat(3,1fr)] items-center border-b border-gray-200 bg-gray-50 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-gray-500 md:grid">
        <span>Fonctionnalité</span>
        <span className="text-center">Gratuit</span>
        <span className="text-center">Créateur</span>
        <span className="text-center">Organisations &amp; ONG</span>
      </div>

      {GROUPS.map((group) => {
        const rows = COMPARISON.filter((r) => r.group === group);
        if (rows.length === 0) return null;

        return (
          <div key={group}>
            <div className="border-b border-gray-200 bg-gray-50/60 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
              {group}
            </div>

            {rows.map((row) => (
              <div
                key={`${group}-${row.label}`}
                className="border-b border-gray-100 px-5 py-3 last:border-b-0"
              >
                {/* Desktop : une ligne, quatre colonnes */}
                <div className="hidden grid-cols-[1.6fr_repeat(3,1fr)] items-center md:grid">
                  <span className="pr-4 text-[13px] leading-snug text-gray-900">{row.label}</span>
                  <span className="text-center">
                    <Cell value={row.free} />
                  </span>
                  <span className="text-center">
                    <Cell value={row.creator} />
                  </span>
                  <span className="text-center">
                    <Cell value={row.organization} />
                  </span>
                </div>

                {/* Mobile : la fonctionnalité, puis ses trois réponses */}
                <div className="md:hidden">
                  <p className="text-[13px] font-medium text-gray-900">{row.label}</p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
                    <div>
                      <dt className="text-gray-400">Gratuit</dt>
                      <dd className={cn('mt-0.5', typeof row.free === 'boolean' && 'flex')}>
                        <Cell value={row.free} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">Créateur</dt>
                      <dd className={cn('mt-0.5', typeof row.creator === 'boolean' && 'flex')}>
                        <Cell value={row.creator} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">Organisations &amp; ONG</dt>
                      <dd className={cn('mt-0.5', typeof row.organization === 'boolean' && 'flex')}>
                        <Cell value={row.organization} />
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
