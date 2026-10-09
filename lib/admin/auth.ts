import { supabaseServer } from '@/lib/supabase/server';

/**
 * Garde d'accès du Super Admin — **source unique de vérité**.
 *
 * Trois règles, dans cet ordre :
 *
 *   1. **Connaître l'URL ne suffit pas.** La session est relue côté serveur
 *      puis comparée à `admin_members`. Aucune page ni aucune API
 *      d'administration ne se fie à un état client.
 *   2. **Le plan n'est pas un droit.** `users.plan` (`creator`,
 *      `organization`) est une offre commerciale : un client payant n'est pas
 *      administrateur pour autant.
 *   3. **Échec fermé.** Table absente, requête en erreur, session expirée :
 *      le verdict est « non admin ». Un droit qui s'ouvre à la moindre panne
 *      serait plus grave que la panne elle-même.
 *
 * Le `service_role` n'intervient **jamais** ici : la vérification se fait avec
 * la session de l'utilisateur, sous RLS. C'est la base qui dit qui est
 * administrateur, pas le code.
 */

export type AdminRole = 'super_admin' | 'support_readonly' | 'finance_readonly';
export type AdminStatus = 'active' | 'suspended';

export type AdminPermission =
  | 'admin:access'
  | 'admin:read'
  | 'admin:export'
  | 'admin:audit:read'
  | 'admin:write';

export interface AdminContext {
  userId: string;
  email: string | null;
  role: AdminRole;
  status: AdminStatus;
}

/** Droits accordés à chaque rôle — matrice explicite, jamais implicite. */
const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: [
    'admin:access',
    'admin:read',
    'admin:export',
    'admin:audit:read',
    'admin:write',
  ],
  finance_readonly: ['admin:access', 'admin:read', 'admin:export'],
  support_readonly: ['admin:access', 'admin:read'],
};

interface AdminMemberRow {
  role: AdminRole;
  status: AdminStatus;
}

/**
 * Résout l'identité administrative de l'utilisateur courant.
 *
 * Renvoie `null` dès qu'un maillon manque : pas de session, table absente,
 * rôle inconnu ou administrateur suspendu. Aucune exception n'est propagée —
 * une API qui lèverait donnerait un 500 là où il faut un 403.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  try {
    const supabase = await supabaseServer();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) return null;

    /*
     * Lecture sous RLS : la policy `admin_members_select_self` ne laisse
     * voir que sa propre ligne. Un compte non administrateur ne récupère
     * donc rien — il n'a pas à savoir qui d'autre est administrateur.
     */
    const { data, error } = await supabase
      .from('admin_members')
      .select('role, status')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as AdminMemberRow;
    if (row.status !== 'active') return null;
    if (!isAdminRole(row.role)) return null;

    return {
      userId: userData.user.id,
      email: userData.user.email ?? null,
      role: row.role,
      status: row.status,
    };
  } catch {
    // Session illisible ou Supabase non configuré : aucun droit.
    return null;
  }
}

export function isAdminRole(value: unknown): value is AdminRole {
  return value === 'super_admin' || value === 'support_readonly' || value === 'finance_readonly';
}

export function can(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function assertPermission(
  context: AdminContext | null,
  permission: AdminPermission,
): boolean {
  if (!context) return false;
  return can(context.role, permission);
}

/** Libellés d'affichage, pour que l'interface ne réinvente pas ses textes. */
export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super administrateur',
  finance_readonly: 'Lecture financière',
  support_readonly: 'Lecture seule',
};
