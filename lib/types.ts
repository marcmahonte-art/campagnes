/** Types partagés — miroir exact du schéma `supabase/migrations/`. */

import type { MotionPlan } from './motion';

export type PlanKind = 'free' | 'creator' | 'organization';
export type CampaignStatus = 'draft' | 'published';
export type Ratio = '1:1' | '16:9' | '9:16';

/**
 * Comment une campagne accueille le média du participant. Choisi à la création,
 * stocké sur la campagne : la page publique doit savoir ce qu'elle attend
 * AVANT de lire le cadre.
 *
 * - `photo_frame`     la photo couvre tout le cadre (mode Cadre du descripteur)
 * - `video_frame`     un cadre animé appliqué à une vidéo
 * - `background_frame` la photo est posée dans une zone, le décor reste visible
 *                      autour (mode Fond : le descripteur porte un `photo_anchor`)
 */
export type CampaignKind = 'photo_frame' | 'video_frame' | 'background_frame';

/** Créateur. Le participant n'a jamais de compte (Phase A). */
export interface User {
  id: string;
  email: string;
  username: string;
  org_name: string | null;
  logo_url: string | null;
  plan: PlanKind;
  onboarded_at: string | null;
  created_at: string;
}

/** Projection publique d'un créateur — jamais d'email ni de plan. */
export interface CreatorProfile {
  id: string;
  username: string;
  org_name: string | null;
  logo_url: string | null;
  created_at: string;
  /**
   * Vrai si les visuels issus des campagnes de ce créateur portent le filigrane.
   * Dérivé de la formule, sans révéler laquelle : c'est exactement — et seulement —
   * ce dont le parcours participant a besoin pour composer son export.
   */
  watermark: boolean;
}

/* ------------------------------------------------------------------ */
/* Descripteur de cadre — contrat de rejouabilité                      */
/* ------------------------------------------------------------------ */

export type LayerType = 'image' | 'text';
export type TextAlign = 'left' | 'center' | 'right';

/** Polices disponibles dans l'éditeur — toutes libres de droits (Google Fonts). */
export type FontFamily =
  | 'Inter'
  | 'Playfair Display'
  | 'Montserrat'
  | 'Poppins'
  | 'Roboto'
  | 'Lora'
  | 'Bebas Neue';

export type FontWeight = 'normal' | 'bold';

/** Italique. Toutes les polices ne possèdent pas la variante (voir `lib/fonts.ts`). */
export type FontStyle = 'normal' | 'italic';

/** Où poser un texte dans la hauteur du cadre. */
export type VerticalAlign = 'top' | 'middle' | 'bottom';

interface LayerBase {
  id: string;
  /** Coordonnées exprimées dans le repère du ratio, pas dans celui de l'écran. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  /** Ordre d'empilement : plus grand = plus devant. */
  z: number;
  opacity: number;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  src: string;
  /** Nom d'origine, purement informatif. */
  label?: string;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  font: FontFamily;
  size: number;
  color: string;
  align: TextAlign;
  /** Graisse du texte. */
  weight: FontWeight;
  /** Italique. */
  style: FontStyle;
  /**
   * Espacement des lettres, en millièmes de cadratin (convention Fabric
   * `charSpacing` : 1000 = un cadratin). 0 = espacement naturel.
   */
  letterSpacing: number;
  /** Multiplicateur d'interligne. 1.16 est la valeur par défaut de Fabric. */
  lineHeight: number;
  /**
   * Courbure du texte : -100 (arc vers le bas) → 0 (droit) → +100 (arc vers le
   * haut). Rendue par un chemin d'arc natif de Fabric : le texte reste du texte,
   * jamais une image aplatie.
   */
  curve: number;
}

export type Layer = ImageLayer | TextLayer;

export const DESCRIPTOR_VERSION = 1;

export interface Descriptor {
  version: number;
  ratio: Ratio;
  background: 'transparent' | string;
  layers: Layer[];
  /**
   * Mode d'accueil de la photo du participant.
   *
   * Absent → **mode Cadre** : la photo couvre tout le cadre et n'apparaît qu'à
   * travers les zones transparentes du visuel.
   *
   * Présent → **mode Fond** : identifiant du calque qui délimite la zone photo.
   * La photo est découpée à son emprise et posée **juste au-dessus** de lui ;
   * elle masque donc ce calque dans la zone, tandis que son décor reste visible
   * tout autour.
   *
   * Le calque désigné n'est pas un conteneur : c'est un repère. Rien n'est
   * déplacé, rien n'est modifié dans les calques du créateur.
   */
  photo_anchor?: string;
  /**
   * Animation du cadre (Motion Engine). Absent = cadre statique.
   * Stocké ici pour que le cadre reste rejouable à l'identique, aperçu comme rendu.
   */
  motion?: MotionPlan | null;
}

/* ------------------------------------------------------------------ */

export interface Frame {
  id: string;
  owner_id: string;
  name: string;
  descriptor_json: Descriptor;
  thumbnail_url: string | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  frame_id: string | null;
  ratio: Ratio;
  kind: CampaignKind;
  status: CampaignStatus;
  /** Téléchargements consommés par les participants. */
  participants_used: number;
  /** Téléchargements autorisés : 10 à la création, puis +100 / 500 / 1 000 / 5 000 par extension. */
  participants_granted: number;
  created_at: string;
}

/** Campagne + son cadre, tel que renvoyé par le dashboard. */
export interface CampaignWithFrame extends Campaign {
  frame: Frame | null;
}

/**
 * Catégories de galerie. Liste volontairement courte : une taxonomie large
 * n'est jamais renseignée, et un filtre qui ne renvoie rien vaut moins que pas
 * de filtre du tout.
 */
export type GalleryCategory =
  | 'evenements'
  | 'associations'
  | 'marques'
  | 'education'
  | 'sport'
  | 'communaute'
  | 'fetes'
  | 'autres';

/** Campagne publiée telle qu'elle apparaît dans la galerie publique. */
export interface GalleryItem extends CampaignWithFrame {
  creator: CreatorProfile | null;

  /*
   * Champs d'enrichissement, tous **optionnels**.
   *
   * Ils ne sont renseignés que lorsque la base les porte réellement. Un
   * compteur absent reste absent : la galerie n'affiche jamais « ♡ 1,2 k » sur
   * une campagne dont personne n'a jamais mesuré l'usage. Tant que les colonnes
   * n'existent pas, l'interface se contente de ce qu'elle sait — le type de
   * campagne, le format, le créateur et la date.
   */

  /** Classement éditorial. Absent → non classée. */
  category?: GalleryCategory | null;
  /** Mise en avant officielle Campagnes. */
  isOfficial?: boolean;
  /** Réservée aux formules payantes. */
  isPremium?: boolean;
  /** Aperçu vidéo dédié, quand la campagne en fournit un. */
  previewVideo?: string | null;
  /** Nombre d'utilisations réelles. Absent → jamais compté. */
  usageCount?: number;
  /** Nombre de mises en favori réelles. Absent → jamais compté. */
  likesCount?: number;
}

/* ------------------------------------------------------------------ */
/* Quota de téléchargements — 0007                                     */
/* ------------------------------------------------------------------ */

/**
 * Résultat d'une réservation de téléchargement par un participant.
 *
 * `granted: false` signifie que le quota est atteint — **pas** qu'il y a une
 * panne. Les deux cas doivent rester distinguables jusqu'à l'écran : c'est
 * pour cela que la fonction SQL renvoie `granted: false` au lieu de lever une
 * exception, qu'un client PostgREST ne pourrait pas interpréter.
 */
export interface ParticipationClaim {
  granted: boolean;
  used: number;
  quota: number;
}

/**
 * État du quota tel qu'un participant peut le lire.
 *
 * La vue `campaign_quota` n'expose ni nom, ni slug, ni propriétaire : le
 * participant doit voir que la limite est atteinte, pas savoir qui est le
 * créateur ni où sont ses autres campagnes.
 */
export interface CampaignQuota {
  used: number;
  quota: number;
  /** Vrai tant qu'un téléchargement reste possible. */
  open: boolean;
}
