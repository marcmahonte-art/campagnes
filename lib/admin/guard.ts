import { NextResponse } from 'next/server';
import {
  assertPermission,
  getAdminContext,
  type AdminContext,
  type AdminPermission,
} from '@/lib/admin/auth';

/**
 * Garde-fou des routes `/api/admin/*`.
 *
 * Chaque route administrative commence par `requireAdmin()`. Sans cela, une
 * route « cachée » ne serait protégée que par le fait qu'on ignore son
 * existence — ce n'est pas une protection.
 *
 * Le corps JSON est volontairement pauvre : `forbidden` ne dit pas si le
 * compte existe, s'il est suspendu ou si la table est absente. Décrire
 * l'échec à un inconnu, c'est lui donner une carte du système.
 */

export interface AdminRouteResult {
  ok: true;
  admin: AdminContext;
}

export interface AdminRouteFailure {
  ok: false;
  response: NextResponse;
}

export type AdminRoute = AdminRouteResult | AdminRouteFailure;

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error,
      checkedAt: new Date().toISOString(),
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    },
  );
}

/**
 * Vérifie la session, le rôle et la permission demandée.
 *
 * `permission` vaut `admin:read` par défaut : la plupart des routes ne font
 * que lire. Les exports et les écritures doivent le demander explicitement,
 * sinon un compte en lecture seule obtiendrait des droits qu'il n'a pas.
 */
export async function requireAdmin(
  permission: AdminPermission = 'admin:read',
): Promise<AdminRoute> {
  const admin = await getAdminContext();

  if (!admin) {
    return { ok: false, response: jsonError(401, 'Session administrateur absente.') };
  }

  if (!assertPermission(admin, permission)) {
    return { ok: false, response: jsonError(403, 'Permission administrative refusée.') };
  }

  return { ok: true, admin };
}

export function adminJson(data: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: {
      // Les chiffres d'administration ne sont jamais mis en cache : un
      // intermédiaire qui les gèlerait afficherait un état périmé du business.
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

export function adminError(message: string, status = 500): NextResponse {
  return jsonError(status, message);
}
