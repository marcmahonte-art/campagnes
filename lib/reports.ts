/**
 * Motifs de signalement — source unique.
 *
 * La même liste est verrouillée côté base : contrainte `CHECK` sur la table et
 * validation explicite dans `submit_report` (migration 0010). Un motif accepté
 * par le formulaire mais refusé par la base produirait, au moment de l'envoi,
 * une erreur que le visiteur ne pourrait pas comprendre. Les deux listes
 * doivent donc bouger ensemble.
 */
export const REPORT_REASONS = [
  { value: 'illegal', label: 'Contenu illégal' },
  { value: 'copyright', label: "Droits d'auteur" },
  { value: 'privacy', label: 'Vie privée' },
  { value: 'impersonation', label: 'Usurpation' },
  { value: 'hate', label: 'Contenu haineux' },
  { value: 'misleading', label: 'Contenu trompeur' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Autre' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export function isReportReason(value: string): value is ReportReason {
  return REPORT_REASONS.some((reason) => reason.value === value);
}

/**
 * Bornes partagées entre le formulaire et la base.
 *
 * Le navigateur les applique pour éviter un aller-retour inutile ; la base les
 * réapplique parce que la validation côté navigateur ne prouve rien — elle peut
 * être contournée en une ligne.
 */
export const REPORT_LIMITS = {
  descriptionMin: 10,
  descriptionMax: 4000,
  emailMax: 320,
  urlMax: 500,
  /** 5 Mo : suffisant pour une capture d'écran ou un PDF, pas pour un dump. */
  attachmentMaxBytes: 5 * 1024 * 1024,
  attachmentTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
} as const;

/** Une pièce jointe acceptable : type et taille vérifiés avant tout envoi. */
export function checkAttachment(file: File): string | null {
  if (file.size > REPORT_LIMITS.attachmentMaxBytes) {
    return 'La pièce jointe dépasse 5 Mo.';
  }
  if (!(REPORT_LIMITS.attachmentTypes as readonly string[]).includes(file.type)) {
    return 'Formats acceptés pour la pièce jointe : PNG, JPEG, WebP ou PDF.';
  }
  return null;
}
