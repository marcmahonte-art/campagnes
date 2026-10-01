/**
 * Informations officielles de l'exploitant de Campagnes.
 *
 * Source unique : le footer, les pages légales et la page de signalement les
 * lisent toutes ici. Aucune de ces valeurs ne doit être recopiée ailleurs —
 * une adresse qui diverge entre deux pages est un défaut de transparence.
 *
 * RÈGLE ABSOLUE : ne rien inventer. Un champ absent de la liasse reste `null`
 * et s'affiche comme « à compléter ». Jamais une valeur plausible, jamais un
 * exemple, jamais un trou comblé par déduction.
 */
export const COMPANY = {
  /** Raison sociale telle qu'elle figure au RCCM. */
  legalName: 'MPIXEL AGENCY',
  legalForm: 'Société à Responsabilité Limitée Unipersonnelle (SARLU)',
  shareCapital: '1 000 000 FCFA',
  address:
    'Ouagadougou, Secteur 39, Section 384, Lot 10, Parcelle 15, S/C 01 BP 5294 Ouagadougou 01',
  city: 'Ouagadougou',
  country: 'Burkina Faso',
  rccm: 'BF-OUA-01-2023-B13-06427',
  email: 'mpixelagency@gmail.com',
} as const;

/** Le service lui-même, tel qu'il est nommé dans les documents. */
export const PRODUCT = {
  name: 'Campagnes',
  tagline: 'Créez. Animez. Partagez.',
} as const;

/**
 * Marqueur des informations qui manquent.
 *
 * Il est visible à l'écran, volontairement. Une page légale qui tait une
 * obligation renseigne moins bien son lecteur qu'une page qui montre ce qu'il
 * reste à valider — et une valeur inventée serait pire que les deux.
 */
export const TO_COMPLETE = 'À COMPLÉTER';

/** Formate une valeur absente pour l'affichage. */
export function orToComplete(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : TO_COMPLETE;
}
