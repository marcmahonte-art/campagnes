import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { adminError, requireAdmin } from '@/lib/admin/guard';
import { exportFilename, toCsv } from '@/lib/admin/csv';
import {
  EXPORT_ROW_LIMIT,
  listCampaigns,
  listPayments,
  listUsers,
  normalizePeriod,
  normalizeText,
  writeAuditLog,
} from '@/lib/admin/repository';

/**
 * Export CSV administratif.
 *
 * Trois garde-fous :
 *
 *   1. **Permission explicite.** `admin:export` : un compte en lecture seule
 *      peut consulter, il ne peut pas extraire.
 *   2. **Motif obligatoire.** Un export sans motif n'est pas tracé de façon
 *      utile : on ne saurait jamais pourquoi ces lignes sont sorties. Le motif
 *      est donc exigé et enregistré avec l'action.
 *   3. **Volume borné.** `EXPORT_ROW_LIMIT` évite qu'un export vide la base
 *      dans un fichier ; au-delà, il faudra un export différé.
 */

const RESOURCES = ['users', 'payments', 'campaigns'] as const;
type ExportResource = (typeof RESOURCES)[number];

const COLUMNS: Record<ExportResource, string[]> = {
  users: [
    'id',
    'username',
    'org_name',
    'plan',
    'created_at',
    'onboarded_at',
    'plan_expires_at',
    'campaign_count',
    'paid_total_fcfa',
  ],
  payments: [
    'deposit_id',
    'username',
    'purchase_type',
    'plan',
    'amount',
    'currency',
    'status',
    'provider',
    'country',
    'failure_code',
    'created_at',
    'updated_at',
  ],
  campaigns: [
    'id',
    'name',
    'slug',
    'username',
    'kind',
    'status',
    'ratio',
    'participants_used',
    'participants_granted',
    'created_at',
  ],
};

export async function GET(request: NextRequest) {
  const guard = await requireAdmin('admin:export');
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  const resource = params.get('resource') as ExportResource | null;
  const reason = normalizeText(params.get('reason'), 200);

  if (!resource || !RESOURCES.includes(resource)) {
    return adminError('Ressource d’export invalide.', 400);
  }

  if (!reason) {
    return adminError('Un motif d’export est obligatoire et sera journalisé.', 400);
  }

  const filters = {
    search: params.get('search'),
    period: params.get('period'),
    status: params.get('status'),
    plan: params.get('plan'),
    type: params.get('type'),
    kind: params.get('kind'),
  };

  try {
    let rows: Record<string, unknown>[] = [];

    if (resource === 'users') {
      const result = await listUsers({
        search: filters.search,
        plan: filters.plan,
        period: normalizePeriod(filters.period),
        page: 1,
      });
      rows = result.rows as unknown as Record<string, unknown>[];
    } else if (resource === 'payments') {
      const result = await listPayments({
        status: filters.status,
        type: filters.type,
        search: filters.search,
        period: normalizePeriod(filters.period),
        page: 1,
      });
      rows = result.rows as unknown as Record<string, unknown>[];
    } else {
      const result = await listCampaigns({
        status: filters.status,
        kind: filters.kind,
        search: filters.search,
        period: normalizePeriod(filters.period),
        page: 1,
      });
      rows = result.rows as unknown as Record<string, unknown>[];
    }

    const limited = rows.slice(0, EXPORT_ROW_LIMIT);

    await writeAuditLog({
      actorId: guard.admin.userId,
      actorEmail: guard.admin.email,
      action: `export:${resource}`,
      resourceType: resource,
      reason,
      role: guard.admin.role,
      metadata: {
        rows: limited.length,
        truncated: rows.length > limited.length,
        filters,
      },
    });

    // Le BOM : sans lui, Excel lit l'UTF-8 en ANSI et casse les accents.
    const csv = `\uFEFF${toCsv(limited, COLUMNS[resource])}`;
    const filename = exportFilename(resource, filters);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        // Le BOM : Excel sans lui lit l'UTF-8 en ANSI et casse les accents.
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    });
  } catch (error) {
    return adminError(
      error instanceof Error ? error.message : 'Export impossible.',
      500,
    );
  }
}
