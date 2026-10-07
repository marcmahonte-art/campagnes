/**
 * Corridors de paiement Mobile Money — **un seul point de vérité**.
 *
 * Pourquoi ce fichier existe : le pays était codé en dur (`'BFA'`) dans
 * `lib/pawapay.ts` et la devise en dur (`'XOF'`) dans la route d'initiation.
 * Deux conséquences, toutes deux silencieuses :
 *
 *   1. un visiteur hors Burkina Faso voyait une page de paiement qui ne
 *      pouvait pas aboutir — le pays envoyé à la passerelle n'était pas le
 *      sien, et l'échec remontait comme un refus d'opérateur ;
 *   2. le pays venait du corps de la requête **sans être validé**, alors que la
 *      devise restait figée : un client pouvait annoncer un pays dont la devise
 *      n'est pas celle de la grille tarifaire.
 *
 * La liste ci-dessous ne sort pas d'une intuition : elle reprend les pays et
 * opérateurs **documentés** par la passerelle (page « Providers », consultée le
 * 2026-10-07), limités à l'Afrique de l'Ouest. Ce que le prestataire ne
 * documente pas n'est pas promis à l'utilisateur.
 *
 * Deux niveaux distincts, volontairement :
 *   - `priced: true` → une grille de prix existe dans cette devise, le pays est
 *     payable immédiatement ;
 *   - `priced: false` → le corridor est documenté par le prestataire, mais
 *     aucune grille n'a été arrêtée dans sa devise. On ne convertit rien : un
 *     taux inventé est une erreur d'argent. Le pays est listé, jamais facturé.
 *
 * Qu'un corridor soit **activé sur le compte marchand** ne se lit pas ici :
 * c'est le rôle de `scripts/check_pawapay_countries.ts`, qui interroge la
 * configuration réelle du compte en lecture seule.
 */

export interface PaymentCorridor {
  /** Code ISO 3166-1 alpha-3, tel qu'attendu par la passerelle. */
  countryCode: string;
  /** Libellé français, affiché à l'utilisateur. */
  country: string;
  /** Devise du corridor. XOF = franc CFA (BCEAO), aucune décimale. */
  currency: string;
  /** Indicatif téléphonique, pour l'aide à la saisie du numéro. */
  dialCode: string;
  /** Opérateurs tels qu'ils peuvent être annoncés à l'utilisateur. */
  operators: string[];
  /** Codes opérateurs documentés par la passerelle (jamais affichés). */
  providerCodes: string[];
  /** Décimales acceptées sur le montant — XOF : aucune. */
  decimalsSupported: boolean;
  /** Vrai si une grille de prix existe dans cette devise. */
  priced: boolean;
}

/**
 * Corridors d'Afrique de l'Ouest documentés par la passerelle.
 *
 * `priced` distingue « la passerelle sait faire » de « nous avons un prix ».
 */
export const PAYMENT_CORRIDORS: PaymentCorridor[] = [
  {
    countryCode: 'BEN',
    country: 'Bénin',
    currency: 'XOF',
    dialCode: '+229',
    operators: ['MTN', 'Moov'],
    providerCodes: ['MTN_MOMO_BEN', 'MOOV_BEN'],
    decimalsSupported: false,
    priced: true,
  },
  {
    countryCode: 'BFA',
    country: 'Burkina Faso',
    currency: 'XOF',
    dialCode: '+226',
    operators: ['Orange', 'Moov'],
    providerCodes: ['ORANGE_BFA', 'MOOV_BFA'],
    decimalsSupported: false,
    priced: true,
  },
  {
    countryCode: 'CIV',
    country: 'Côte d’Ivoire',
    currency: 'XOF',
    dialCode: '+225',
    operators: ['Orange', 'MTN', 'Wave'],
    providerCodes: ['ORANGE_CIV', 'MTN_MOMO_CIV', 'WAVE_CIV'],
    decimalsSupported: false,
    priced: true,
  },
  {
    countryCode: 'SEN',
    country: 'Sénégal',
    currency: 'XOF',
    dialCode: '+221',
    operators: ['Orange', 'Free', 'Wave'],
    providerCodes: ['ORANGE_SEN', 'FREE_SEN', 'WAVE_SEN'],
    decimalsSupported: false,
    priced: true,
  },
  // Corridors documentés, devise sans grille arrêtée : listés, jamais facturés.
  {
    countryCode: 'GHA',
    country: 'Ghana',
    currency: 'GHS',
    dialCode: '+233',
    operators: ['MTN', 'AirtelTigo', 'Vodafone'],
    providerCodes: ['MTN_MOMO_GHA', 'AIRTELTIGO_GHA', 'VODAFONE_GHA'],
    decimalsSupported: true,
    priced: false,
  },
  {
    countryCode: 'NGA',
    country: 'Nigéria',
    currency: 'NGN',
    dialCode: '+234',
    operators: ['MTN', 'Airtel'],
    providerCodes: ['MTN_MOMO_NGA', 'AIRTEL_NGA'],
    decimalsSupported: true,
    priced: false,
  },
  {
    countryCode: 'SLE',
    country: 'Sierra Leone',
    currency: 'SLE',
    dialCode: '+232',
    operators: ['Orange'],
    providerCodes: ['ORANGE_SLE'],
    decimalsSupported: true,
    priced: false,
  },
];

/**
 * Pays de référence : le marché historique de Campagnes.
 *
 * Ce défaut n'existe que pour les requêtes qui n'indiquent rien (anciens
 * clients, scripts). Il ne remplace pas un choix explicite de l'utilisateur.
 */
export const DEFAULT_PAYMENT_COUNTRY = 'BFA';

/** Corridors réellement payables — ceux qu'on propose au paiement. */
export function payableCorridors(): PaymentCorridor[] {
  return PAYMENT_CORRIDORS.filter((corridor) => corridor.priced);
}

/** Corridors documentés mais sans grille dans leur devise. */
export function upcomingCorridors(): PaymentCorridor[] {
  return PAYMENT_CORRIDORS.filter((corridor) => !corridor.priced);
}

export function findCorridor(countryCode: string | null | undefined): PaymentCorridor | null {
  if (!countryCode) return null;
  const wanted = countryCode.trim().toUpperCase();
  return PAYMENT_CORRIDORS.find((corridor) => corridor.countryCode === wanted) ?? null;
}

export type PaymentCountryResolution =
  | { ok: true; corridor: PaymentCorridor }
  | { ok: false; reason: 'unknown' | 'not-priced'; countryCode: string | null };

/**
 * Résout un pays reçu du client en corridor payable.
 *
 * Trois issues possibles, et elles ne veulent pas dire la même chose :
 *   - `unknown` : le code n'est pas un corridor que nous connaissons → on
 *     refuse plutôt que de transmettre une valeur non validée à la passerelle ;
 *   - `not-priced` : corridor réel, mais aucune grille dans sa devise → on ne
 *     fabrique pas un prix au taux du jour ;
 *   - `ok` : pays et devise cohérents avec la grille.
 */
export function resolvePaymentCountry(
  countryCode: string | null | undefined,
): PaymentCountryResolution {
  const normalized = typeof countryCode === 'string' && countryCode.trim()
    ? countryCode.trim().toUpperCase()
    : DEFAULT_PAYMENT_COUNTRY;

  const corridor = findCorridor(normalized);
  if (!corridor) return { ok: false, reason: 'unknown', countryCode: normalized };

  if (!corridor.priced) return { ok: false, reason: 'not-priced', countryCode: normalized };

  return { ok: true, corridor };
}

/**
 * Devise d'un corridor payable. `null` si le pays n'est pas payable :
 * l'appelant doit traiter le `null`, pas retomber sur une devise par défaut.
 */
export function currencyForCountry(countryCode: string | null | undefined): string | null {
  const resolved = resolvePaymentCountry(countryCode);
  return resolved.ok ? resolved.corridor.currency : null;
}

/** « Bénin, Burkina Faso, Côte d’Ivoire, Sénégal ». */
export function payableCountriesLabel(): string {
  const names = payableCorridors().map((corridor) => corridor.country);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/** Opérateurs annonçables, tous pays payables confondus, sans doublon. */
export function payableOperatorLabels(): string[] {
  const seen = new Set<string>();
  for (const corridor of payableCorridors()) {
    for (const operator of corridor.operators) seen.add(operator);
  }
  return [...seen];
}
