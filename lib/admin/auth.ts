import { supabaseServer } from '@/lib/supabase/server';
import {
  can,
  isAdminRole,
  type AdminIdentity,
  type AdminPermission,
} from '@/lib/admin/roles';

/**
 * Garde d'accès du Super Admin — **code serveur uniquement**.
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
 *
 * Ce module importe `next/headers` : il ne doit jamais être atteint depuis un
 * composant client. Les types et libellés partagés vivent dans
 * `lib/admin/roles.ts`, précisément pour cela.
 */

export type { AdminRole, AdminStatus, AdminPermission } from '@/lib/admin/roles';
export type AdminContext = AdminIdentity;

interface AdminMemberRow {
  role: unknown;
  status: unknown;
}

/**
 * Résout l'identité administrative de l'utilisateur courant.
 *
 * Renvoie `null` dès qu'un maillon manque : pas de session, table absente,
 * rôle inconnu ou administrateur suspendu. Aucune exception n'est propagée —
 * une API qui lèverait donnerait un 500 là où il faut un 403.
 */
export async function getAdminContext(): Promise<AdminIdentity | null> {
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
      status: 'active',
    };
  } catch {
    // Session illisible ou Supabase non configuré : aucun droit.
    return null;
  }
}

export function assertPermission(
  context: AdminIdentity | null,
  permission: AdminPermission,
): boolean {
  if (!context) return false;
  return can(context.role, permission);
}
