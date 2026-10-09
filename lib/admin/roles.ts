/**
 * Rôles et permissions d'administration — **module client-safe**.
 *
 * Ce fichier ne doit importer **rien** de serveur : ni `next/headers`, ni le
 * client `service_role`. Un composant client a besoin de ces types et de ces
 * libellés (pour afficher le rôle, griser une action), et l'importer depuis
 * `lib/admin/auth.ts` entraînait `next/headers` dans le bundle navigateur —
 * ce que le build refuse, à raison.
 *
 * Règle : ce qui est pur et partagé vit ici ; ce qui touche la session ou la
 * base reste dans `auth.ts` et `repository.ts`.
 */

export type AdminRole = 'super_admin' | 'support_readonly' | 'finance_readonly';
export type AdminStatus = 'active' | 'suspended';

export type AdminPermission =
  | 'admin:access'
  | 'admin:read'
  | 'admin:export'
  | 'admin:audit:read'
  | 'admin:write';

export interface AdminIdentity {
  userId: string;
  email: string | null;
  role: AdminRole;
  status: AdminStatus;
}

/** Droits accordés à chaque rôle — matrice explicite, jamais implicite. */
const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: ['admin:access', 'admin:read', 'admin:export', 'admin:audit:read', 'admin:write'],
  finance_readonly: ['admin:access', 'admin:read', 'admin:export'],
  support_readonly: ['admin:access', 'admin:read'],
};

export function isAdminRole(value: unknown): value is AdminRole {
  return value === 'super_admin' || value === 'support_readonly' || value === 'finance_readonly';
}

export function can(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Libellés d'affichage, pour que l'interface ne réinvente pas ses textes. */
export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super administrateur',
  finance_readonly: 'Lecture financière',
  support_readonly: 'Lecture seule',
};
