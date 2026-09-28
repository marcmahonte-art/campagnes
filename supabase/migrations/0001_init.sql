-- =====================================================================
--  Campagnes — Migration 0001 : socle (Phase A)
--  Tables : users, frames, campaigns
--  Cible  : Supabase / Postgres 15+
--
--  À exécuter dans Supabase → SQL Editor, ou :
--    supabase db push   (avec la CLI)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1. Types énumérés (contraintes lisibles et versionnables)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_kind') then
    create type plan_kind as enum ('free', 'pro', 'org');
  end if;
  if not exists (select 1 from pg_type where typname = 'campaign_status') then
    create type campaign_status as enum ('draft', 'published');
  end if;
  if not exists (select 1 from pg_type where typname = 'frame_ratio') then
    create type frame_ratio as enum ('1:1', '16:9', '9:16');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

-- 2.1 users — le créateur. Le participant n'a JAMAIS de compte (Phase A).
create table if not exists public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text        not null unique,
  username     text        not null unique,
  org_name     text,
  logo_url     text,
  plan         plan_kind   not null default 'free',
  -- Ajout justifié au modèle du brief : permet de router un créateur fraîchement
  -- inscrit vers /onboarding sans deviner l'état à partir du pseudo.
  onboarded_at timestamptz,
  created_at   timestamptz not null default now(),

  constraint users_username_format check (username ~ '^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$')
);

comment on table  public.users is 'Créateur d''une campagne. Un seul compte : celui de l''organisation.';
comment on column public.users.username is 'Pseudo public, sert d''URL : campagnes.app/@username.';

-- 2.2 frames — le descripteur JSON versionné produit par le Frame Engine.
create table if not exists public.frames (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid        not null references public.users (id) on delete cascade,
  name            text        not null default 'Cadre',
  descriptor_json jsonb       not null default jsonb_build_object(
                                'version', 1,
                                'ratio',   '1:1',
                                'layers',  jsonb_build_array()
                              ),
  thumbnail_url   text,
  created_at      timestamptz not null default now(),

  -- Le descripteur doit toujours porter sa version et son ratio : c'est le
  -- contrat de rejouabilité exigé par le brief.
  constraint frames_descriptor_shape check (
    jsonb_typeof(descriptor_json) = 'object'
    and descriptor_json ? 'version'
    and descriptor_json ? 'ratio'
    and descriptor_json ? 'layers'
    and jsonb_typeof(descriptor_json -> 'layers') = 'array'
    and (descriptor_json ->> 'ratio') in ('1:1', '16:9', '9:16')
  )
);

comment on table  public.frames is 'Cadre multi-calques. descriptor_json est rejouable à l''identique.';
comment on column public.frames.descriptor_json is 'Descripteur versionné : { version, ratio, layers[] }.';

-- 2.3 campaigns — la campagne diffusée.
create table if not exists public.campaigns (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid            not null references public.users (id) on delete cascade,
  name       text            not null,
  slug       text            not null unique,
  frame_id   uuid            references public.frames (id) on delete set null,
  ratio      frame_ratio     not null default '1:1',
  status     campaign_status not null default 'draft',
  created_at timestamptz     not null default now(),

  constraint campaigns_name_len check (char_length(trim(name)) between 1 and 120),
  constraint campaigns_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$')
);

comment on table public.campaigns is 'Campagne publiée ou brouillon. Le slug compose l''URL publique /c/<slug>.';

-- ---------------------------------------------------------------------
-- 3. Index
-- ---------------------------------------------------------------------
create index if not exists users_username_idx       on public.users (username);
create index if not exists frames_owner_idx         on public.frames (owner_id);
create index if not exists campaigns_owner_idx      on public.campaigns (owner_id);
create index if not exists campaigns_status_idx     on public.campaigns (status);
create index if not exists campaigns_frame_idx      on public.campaigns (frame_id);

-- ---------------------------------------------------------------------
-- 4. Création automatique du profil à l'inscription
--    (couvre email/mot de passe ET Google : on ne peut pas intercepter OAuth)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base     text;
  candidate text;
  n        int := 0;
begin
  -- Pseudo provisoire dérivé de l'email ; /onboarding le remplace.
  base := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]', '', 'g'));
  if base is null or char_length(base) < 3 then
    base := 'createur';
  end if;
  base := left(base, 20);

  candidate := base;
  while exists (select 1 from public.users u where u.username = candidate) loop
    n := n + 1;
    candidate := left(base, 20) || n::text;
  end loop;

  insert into public.users (id, email, username)
  values (new.id, new.email, candidate)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------
alter table public.users     enable row level security;
alter table public.frames    enable row level security;
alter table public.campaigns enable row level security;

-- 5.1 users ----------------------------------------------------------
-- Lecture : chacun ne lit QUE sa propre ligne complète (email, plan, …).
drop policy if exists "users_select_self" on public.users;
create policy "users_select_self" on public.users
  for select to authenticated
  using (id = auth.uid());

-- Création : uniquement sa propre ligne (le trigger la crée déjà).
drop policy if exists "users_insert_self" on public.users;
create policy "users_insert_self" on public.users
  for insert to authenticated
  with check (id = auth.uid());

-- Mise à jour : uniquement sa propre ligne.
drop policy if exists "users_update_self" on public.users;
create policy "users_update_self" on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Suppression de compte : uniquement la sienne.
drop policy if exists "users_delete_self" on public.users;
create policy "users_delete_self" on public.users
  for delete to authenticated
  using (id = auth.uid());

-- 5.2 frames ---------------------------------------------------------
-- Lecture : le propriétaire, OU n'importe qui si le cadre est utilisé par une
-- campagne publiée (nécessaire pour le rendu participant des phases suivantes).
drop policy if exists "frames_select_owner_or_published" on public.frames;
create policy "frames_select_owner_or_published" on public.frames
  for select to anon, authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.campaigns c
      where c.frame_id = frames.id and c.status = 'published'
    )
  );

drop policy if exists "frames_insert_owner" on public.frames;
create policy "frames_insert_owner" on public.frames
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "frames_update_owner" on public.frames;
create policy "frames_update_owner" on public.frames
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "frames_delete_owner" on public.frames;
create policy "frames_delete_owner" on public.frames
  for delete to authenticated
  using (owner_id = auth.uid());

-- 5.3 campaigns ------------------------------------------------------
-- Lecture : le propriétaire voit tout ; le public ne voit que le publié.
drop policy if exists "campaigns_select_owner_or_published" on public.campaigns;
create policy "campaigns_select_owner_or_published" on public.campaigns
  for select to anon, authenticated
  using (owner_id = auth.uid() or status = 'published');

drop policy if exists "campaigns_insert_owner" on public.campaigns;
create policy "campaigns_insert_owner" on public.campaigns
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "campaigns_update_owner" on public.campaigns;
create policy "campaigns_update_owner" on public.campaigns
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "campaigns_delete_owner" on public.campaigns;
create policy "campaigns_delete_owner" on public.campaigns
  for delete to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. Vue publique du créateur
--    RLS ne sait pas filtrer des colonnes : on expose donc une vue qui ne
--    contient QUE les champs publics. `email` et `plan` restent privés.
--
--    `watermark` est un booléen DÉRIVÉ de la formule, pas la formule elle-même :
--    le parcours participant doit savoir s'il doit marquer le visuel qu'il
--    produit, et rien de plus. Exposer `plan` révélerait le niveau d'abonnement.
-- ---------------------------------------------------------------------
drop view if exists public.creator_profiles;
create view public.creator_profiles
with (security_invoker = off)   -- la vue s'exécute avec les droits de son propriétaire
as
  select id, username, org_name, logo_url, created_at,
         (plan = 'free') as watermark
  from public.users;

revoke all on public.creator_profiles from anon, authenticated;
grant select on public.creator_profiles to anon, authenticated;

comment on view public.creator_profiles is
  'Projection publique d''un créateur : username, org_name, logo_url et l''effet visible de la formule (watermark). Aucune donnée privée.';

-- ---------------------------------------------------------------------
-- 7. Storage — bucket `media` (logos créateur, PNG de cadre, vignettes)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true, 10485760,
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do nothing;

-- Lecture publique (les images de campagne sont servies à des anonymes).
drop policy if exists "media_read_public" on storage.objects;
create policy "media_read_public" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'media');

-- Écriture : chaque créateur n'écrit que dans son dossier <uid>/…
drop policy if exists "media_insert_own_folder" on storage.objects;
create policy "media_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_update_own_folder" on storage.objects;
create policy "media_update_own_folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_delete_own_folder" on storage.objects;
create policy "media_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------
-- 8. Realtime (le dashboard affiche les statuts à jour)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'campaigns'
  ) then
    alter publication supabase_realtime add table public.campaigns;
  end if;
end $$;
