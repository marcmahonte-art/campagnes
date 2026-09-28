/** Joint des classes conditionnelles. Évite d'ajouter `clsx` comme dépendance. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
