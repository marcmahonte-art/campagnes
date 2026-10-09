import type { NextRequest } from 'next/server';
import { adminError, adminJson, requireAdmin } from '@/lib/admin/guard';
import { listCampaigns, normalizePeriod } from '@/lib/admin/repository';

/**
 * Liste des campagnes.
 *
 * Le `slug` sort volontairement : c'est l'identifiant public de la campagne,
 * celui que l'exploitant voit dans une URL signalée. Le jeton privé de
 * distribution (`/d/[token]`) ne sort jamais, lui — il ouvre un accès payant.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin('admin:read');
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;

  try {
    const result = await listCampaigns({
      status: params.get('status'),
      kind: params.get('kind'),
      search: params.get('search'),
      period: normalizePeriod(params.get('period')),
      page: params.get('page'),
    });

    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminError(
      error instanceof Error ? error.message : 'Lecture des campagnes impossible.',
      500,
    );
  }
}
