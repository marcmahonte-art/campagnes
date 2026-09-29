-- =====================================================================
--  Campagnes — Migration 0004 : type de campagne
--  Cible : Supabase / Postgres 15+
--
--  Objet :
--    Distinguer les trois façons dont une campagne accueille le média du
--    participant, dès la création et non au moment du rendu :
--
--      'photo_frame'     la photo couvre tout le cadre (mode Cadre)
--      'video_frame'     un cadre animé appliqué à une vidéo (mode Cadre + Motion)
--      'background_frame' la photo est posée dans une zone, le décor reste
--                        visible tout autour (mode Fond)
--
--  Pourquoi une colonne et pas seulement le descripteur :
--    `photo_anchor` décrit déjà la zone photo, mais il ne dit rien du média
--    attendu (photo ou vidéo) ni de l'intention du créateur. La page publique
--    et le parcours participant ont besoin de ce choix AVANT de lire le cadre.
--
--  Le défaut est 'photo_frame' : c'est le seul mode que le produit sait déjà
--  rendre, et il correspond exactement à toutes les campagnes existantes.
--
--  À exécuter après 0001_init.sql, 0002_plans_distribution.sql et
--  0003_username_availability.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Le type
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_kind') then
    create type campaign_kind as enum (
      'photo_frame',       -- la photo couvre tout le cadre
      'video_frame',       -- cadre animé appliqué à une vidéo
      'background_frame'   -- la photo est posée dans une zone, décor visible
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. La colonne
--    `not null default 'photo_frame'` : une migration sûre, aucune ligne
--    existante ne peut rester sans type.
-- ---------------------------------------------------------------------
alter table public.campaigns
  add column if not exists kind campaign_kind not null default 'photo_frame';

comment on column public.campaigns.kind is
  'Comment la campagne accueille le média du participant : cadre photo, cadre vidéo ou photo sur fond.';

-- ---------------------------------------------------------------------
-- 3. La vue publique
--    `creator_profiles` ne porte que le créateur ; rien à y ajouter. Mais la
--    galerie publique lit `campaigns` en direct : `select *` renvoie donc
--    déjà `kind` sans aucune modification de policy.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 4. Recharger le cache de schéma de PostgREST
--    L'enum et la colonne sont utilisés par le client dès la première
--    requête : sans cela, `select *` peut ne pas les renvoyer.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
