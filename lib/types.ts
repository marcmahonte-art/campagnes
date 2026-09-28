/** Types partagés — miroir exact du schéma `supabase/migrations/`. */

import type { MotionPlan } from './motion';

export type PlanKind = 'free' | 'creator' | 'organization';
export type CampaignStatus = 'draft' | 'published';
export type Ratio = '1:1' | '16:9' | '9:16';

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
  font: string;
  size: number;
  color: string;
  align: TextAlign;
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
  status: CampaignStatus;
  created_at: string;
}

/** Campagne + son cadre, tel que renvoyé par le dashboard. */
export interface CampaignWithFrame extends Campaign {
  frame: Frame | null;
}

/** Campagne publiée telle qu'elle apparaît dans la galerie publique. */
export interface GalleryItem extends CampaignWithFrame {
  creator: CreatorProfile | null;
}
