import type { NextRequest } from 'next/server';
import { adminError, adminJson, requireAdmin } from '@/lib/admin/guard';
import { listUsers, normalizePeriod } from '@/lib/admin/repository';

/**
 * Liste des comptes — pagination serveur.
 *
 * L'e-mail est renvoyé parce que le support doit pouvoir retrouver un compte à
 * partir d'une demande reçue par e-mail. Il n'est en revanche jamais exporté
 * en CSV sans action explicite et journalisée.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin('admin:read');
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;

  try {
    const result = await listUsers({
      search: params.get('search'),
      plan: params.get('plan'),
      period: normalizePeriod(params.get('period')),
      page: params.get('page'),
    });

    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminError(
      error instanceof Error ? error.message : 'Lecture des comptes impossible.',
      500,
    );
  }
}
