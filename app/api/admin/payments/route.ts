import type { NextRequest } from 'next/server';
import { adminError, adminJson, requireAdmin } from '@/lib/admin/guard';
import { listPayments, normalizePeriod } from '@/lib/admin/repository';

/**
 * Liste des paiements.
 *
 * Aucune action de confirmation n'est exposée ici : un paiement n'est réussi
 * que parce que le serveur l'a vérifié auprès de la passerelle, jamais parce
 * qu'un écran d'administration l'affirme. Cette route est donc en lecture.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin('admin:read');
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;

  try {
    const result = await listPayments({
      status: params.get('status'),
      type: params.get('type'),
      search: params.get('search'),
      period: normalizePeriod(params.get('period')),
      page: params.get('page'),
    });

    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminError(
      error instanceof Error ? error.message : 'Lecture des paiements impossible.',
      500,
    );
  }
}
