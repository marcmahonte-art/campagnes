import type { CutoutFailureReason, CutoutRuntime } from './cutout';
import type { CampaignKind } from './types';

/**
 * Ce qu'on peut dire d'un parcours participant, et rien d'autre.
 *
 * POURQUOI CE MODULE EXISTE
 *
 *   Le parcours participant manipule la photo de quelqu'un. La mesure la plus
 *   utile — « combien de détourages échouent, et pourquoi ? » — se calcule
 *   exactement là où se trouve la donnée qu'il ne faut **jamais** transmettre.
 *   Écrire un appel `analytics.track({ photo: photo.src })` est une ligne ; s'en
 *   apercevoir en production n'en est pas une.
 *
 *   Ce module rend la fuite **structurellement impossible** plutôt que
 *   déconseillée. Il n'y a pas de champ libre : chaque clé a une liste fermée de
 *   valeurs, aucune n'est une chaîne quelconque, et un événement qui ne
 *   respecte pas ça n'est pas transmis — il est **abandonné**. Il n'y a donc rien
 *   à filtrer à l'arrivée, et rien à oublier de filtrer.
 *
 * CE QUI N'EST PAS ICI, ET POURQUOI
 *
 *   Aucun **destinataire**. Les événements sont construits, validés, puis
 *   déposés dans un puits qui vaut `null` par défaut : aujourd'hui, rien ne
 *   quitte l'appareil. Choisir où va la mesure (une table, un service, un
 *   endpoint interne) est une décision d'exploitation, pas une décision
 *   technique — et la prendre par défaut serait exactement la façon dont une
 *   donnée se met à circuler sans que personne ne l'ait décidé.
 *
 *   Ce module n'a **aucun import de valeur** : `CampaignKind` est un type, donc
 *   effacé à la compilation. Il se charge partout, y compris dans un harnais,
 *   sans entraîner de dépendance.
 */

export type TelemetryEventName =
  | 'journey_open'
  | 'photo_imported'
  | 'cutout_ok'
  | 'cutout_failed'
  | 'export_ok';

export type TelemetryVerdict = 'ok' | 'faible' | 'vide' | 'plein';
export type TelemetryOutcome = 'ok' | 'warn' | 'unusable';

/**
 * Un événement. **Tous** les champs sont facultatifs, et **aucun** n'accepte de
 * texte libre.
 *
 * C'est le point de conception : il n'existe pas de champ `message`, `label` ou
 * `detail` où glisser un nom, une adresse ou un morceau de source. Une panne se
 * décrit par une **raison normalisée**, jamais par le message qui l'a produite —
 * un message d'erreur est du texte libre, et du texte libre finit toujours par
 * contenir ce qu'on ne voulait pas envoyer.
 *
 * `runtime` et `reason` empruntent leurs types à `lib/cutout.ts` plutôt que de
 * redéclarer une liste parallèle : deux listes qui se ressemblent finissent par
 * diverger, et la divergence serait silencieuse — un moteur ajouté côté détourage
 * ne serait tout simplement jamais compté.
 */
export interface TelemetryEvent {
  name: TelemetryEventName;
  kind?: CampaignKind;
  runtime?: CutoutRuntime;
  verdict?: TelemetryVerdict;
  outcome?: TelemetryOutcome;
  reason?: CutoutFailureReason;
  /** Durée mesurée, en millisecondes, entière et bornée. */
  ms?: number;
}

const NOMS: readonly TelemetryEventName[] = [
  'journey_open',
  'photo_imported',
  'cutout_ok',
  'cutout_failed',
  'export_ok',
];

/** La liste **fermée** des valeurs admises, par clé. Rien d'autre ne passe. */
const VALEURS: Readonly<Record<string, readonly string[]>> = {
  kind: ['photo_frame', 'video_frame', 'background_frame'],
  runtime: ['mediapipe', 'transformers'],
  verdict: ['ok', 'faible', 'vide', 'plein'],
  outcome: ['ok', 'warn', 'unusable'],
  reason: ['memory', 'timeout', 'network', 'gpu', 'image', 'unknown'],
};

/*
 * Les deux listes ci-dessus recopient des types déclarés ailleurs. Recopier, en
 * soi, ne protège de rien : le jour où `CutoutRuntime` gagne un moteur, la
 * télémétrie cesserait de le compter — sans erreur, sans trace, et la mesure
 * serait simplement incomplète.
 *
 * Ces deux alias rendent la dérive **impossible à compiler**. Ils ne servent à
 * rien d'autre : ils n'existent que pour échouer.
 */
type _RuntimeCouvert = Exclude<CutoutRuntime, 'mediapipe' | 'transformers'>;
type _RaisonCouverte = Exclude<
  CutoutFailureReason,
  'memory' | 'timeout' | 'network' | 'gpu' | 'image' | 'unknown'
>;
const _runtimeCouvert: _RuntimeCouvert extends never ? true : never = true;
const _raisonCouverte: _RaisonCouverte extends never ? true : never = true;
void _runtimeCouvert;
void _raisonCouverte;

/** Les clés numériques admises, et leur borne. */
const NOMBRES: Readonly<Record<string, number>> = {
  ms: 600_000,
};

/**
 * Les marqueurs qu'aucun événement sérialisé ne doit contenir.
 *
 * Seconde garde, **indépendante** de la liste blanche : même si quelqu'un
 * élargissait un jour les valeurs admises, une charge utile qui ressemble à une
 * image, à un blob ou à une URL ne passerait pas. Deux serrures pour la même
 * porte, parce que c'est la seule porte du module.
 */
const MARQUEURS_INTERDITS: readonly string[] = ['data:', 'blob:', '://', '@'];

/** Longueur maximale d'un événement sérialisé. Un événement est court, ou absent. */
export const TELEMETRY_MAX_BYTES = 200;

/**
 * Pose un champ validé sur l'événement.
 *
 * Le cast est **local et commenté** : la clé vient d'être confrontée à la liste
 * fermée, donc l'écriture est sûre, mais le compilateur ne peut pas le déduire
 * d'un `Object.entries`. Le concentrer ici évite d'éparpiller des casts dans la
 * fonction de validation, qui est précisément celle qu'il faut pouvoir relire.
 */
function affecter(event: TelemetryEvent, cle: string, valeur: string | number): void {
  (event as unknown as Record<string, string | number>)[cle] = valeur;
}

/**
 * Construit un événement, ou renvoie `null`.
 *
 * `null` n'est pas un cas d'erreur à gérer : c'est la réponse normale à une
 * charge utile qui sort du cadre. Un appelant qui se trompe n'obtient pas un
 * événement partiel — il n'obtient rien, et la faute est visible au harnais.
 */
export function buildEvent(
  name: TelemetryEventName,
  fields: Readonly<Record<string, unknown>> = {},
): TelemetryEvent | null {
  if (!NOMS.includes(name)) return null;

  const event: TelemetryEvent = { name };

  for (const [cle, valeur] of Object.entries(fields)) {
    if (valeur === undefined) continue;

    const admises = VALEURS[cle];
    if (admises) {
      // Une valeur qui n'est pas une chaîne, ou qui n'est pas dans la liste,
      // est refusée : c'est ce qui interdit `{ reason: photo.src }`.
      if (typeof valeur !== 'string' || !admises.includes(valeur)) return null;
      affecter(event, cle, valeur);
      continue;
    }

    const borne = NOMBRES[cle];
    if (borne !== undefined) {
      if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return null;
      if (valeur < 0 || valeur > borne) return null;
      affecter(event, cle, Math.round(valeur));
      continue;
    }

    // Clé inconnue : refus. C'est ici que `{ src }`, `{ photo }` ou `{ email }`
    // s'arrêtent — et ils s'arrêtent avant d'avoir été écrits nulle part.
    return null;
  }

  return event;
}

/**
 * La forme transmissible d'un événement, ou `null`.
 *
 * Le contrôle de taille et celui des marqueurs portent sur la **chaîne
 * produite**, pas sur l'objet : c'est la seule chose qui parte réellement.
 */
export function serializeEvent(event: TelemetryEvent): string | null {
  const texte = JSON.stringify(event);
  if (texte.length > TELEMETRY_MAX_BYTES) return null;
  for (const marqueur of MARQUEURS_INTERDITS) {
    if (texte.includes(marqueur)) return null;
  }
  return texte;
}

/** Où va un événement. `null` = nulle part, et c'est le défaut. */
export type TelemetrySink = (event: TelemetryEvent, texte: string) => void;

let sink: TelemetrySink | null = null;

/**
 * Branche — ou débranche — le destinataire.
 *
 * Aucun destinataire n'est branché par défaut, et ce n'est pas un oubli : c'est
 * la seule façon d'être certain qu'aucune donnée ne circule tant que la
 * destination n'a pas été décidée.
 */
export function setTelemetrySink(next: TelemetrySink | null): void {
  sink = next;
}

/**
 * Émet un événement. Ne lève jamais, et ne fait rien si le puits est absent.
 *
 * La télémétrie est un **effet de bord** : elle ne doit jamais pouvoir casser le
 * parcours du participant, donc l'appel au puits est protégé.
 */
export function emit(name: TelemetryEventName, fields: Readonly<Record<string, unknown>> = {}): void {
  const event = buildEvent(name, fields);
  if (!event) return;

  const texte = serializeEvent(event);
  if (texte === null) return;

  if (!sink) return;
  try {
    sink(event, texte);
  } catch {
    /* Un puits qui échoue n'est pas une panne du parcours. */
  }
}

/** Vrai si un destinataire est branché. Sert au diagnostic, jamais à décider. */
export function hasTelemetrySink(): boolean {
  return sink !== null;
}
