import type { NextRequest } from 'next/server';
import { adminError, adminJson, requireAdmin } from '@/lib/admin/guard';
import {
  getOverviewMetrics,
  getOverviewSeries,
  normalizePeriod,
} from '@/lib/admin/repository';

/**
 * Vue d'ensemble du pilotage.
 *
 * Lecture seule, sous garde : aucune donnée ne sort sans rôle administrateur
 * vérifié côté serveur. La période est validée — une valeur arbitraire
 * retombe sur 30 jours au lieu d'être transmise à la base.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin('admin:read');
  if (!guard.ok) return guard.response;

  const period = normalizePeriod(request.nextUrl.searchParams.get('period'));
  const withSeries = request.nextUrl.searchParams.get('series') === '1';

  try {
    const metrics = await getOverviewMetrics(period);
    const series = withSeries ? await getOverviewSeries(period) : null;

    return adminJson({
      ok: true,
      period,
      metrics,
      series,
      definitions: {
        revenueFcfa: 'Somme des paiements confirmés (status = completed) sur la période. Montant brut : aucun frais ni remboursement n’est déduit.',
        newInPeriod: 'Lignes créées depuis le début de la période, horodatage de création.',
        exhausted: 'Campagnes dont participants_used >= participants_granted.',
        confirmedExports: 'Opérations d’export de distribution confirmées (état CONFIRMED).',
      },
    });
  } catch (error) {
    return adminError(
      error instanceof Error ? error.message : 'Lecture des indicateurs impossible.',
      500,
    );
  }
}
