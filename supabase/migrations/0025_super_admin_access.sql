-- =====================================================================
--  Campagnes — Migration 0025 : accès Super Admin
--  Cible : Supabase / Postgres 15+
--
--  Objet :
--    Le produit n'a aucun rôle applicatif : `users.plan` est une offre
--    commerciale, jamais une permission. Le pilotage de la plateforme a donc
--    besoin de sa propre table, distincte du plan, fermée par défaut.
--
--    Trois décisions structurantes :
--
--      1. **Personne n'est admin par défaut.** La table est créée vide et
--         aucune migration, aucun trigger et aucun signup n'y écrit. Le
--         premier super administrateur est désigné à la main, par une
--         opération explicite tracée dans l'historique du projet.
--      2. **Aucune écriture cliente.** `anon` et `authenticated` ne peuvent
--         ni insérer, ni modifier, ni supprimer une ligne. Seul
--         `service_role` ou une opération SQL faite par l'exploitant écrit.
--      3. **Échec fermé.** `is_admin()` renvoie `false` si la table n'existe
--         pas encore ou si la requête échoue. Un droit d'administration qui
--         s'ouvre tout seul à la moindre erreur serait pire qu'une panne.
--
--  À exécuter après 0024_watermark_passes.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les rôles
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'admin_role') then
    create type public.admin_role as enum (
      'super_admin',        -- tous les droits d'administration
      'support_readonly',   -- consultation, aucun export sensible
      'finance_readonly'    -- consultation + exports financiers
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'admin_status') then
    create type public.admin_status as enum ('active', 'suspended');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. La table des administrateurs
--
--    `user_id` référence `auth.users` ET `public.users` : le profil public
--    peut être supprimé par son propriétaire (policy de 0001), la session
--    Supabase doit alors cesser d'être administrateur — d'où la référence
--    directe à `auth.users`, avec `on delete cascade`.
-- ---------------------------------------------------------------------

create table if not exists public.admin_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  role         public.admin_role not null default 'support_readonly',
  status       public.admin_status not null default 'active',
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  last_seen_at timestamptz
);

create index if not exists idx_admin_members_status on public.admin_members (status);

comment on table public.admin_members is
  'Administrateurs de la plateforme. Table volontairement vide à la création : aucun rôle n''est attribué automatiquement.';
comment on column public.admin_members.role is
  'Rôle d''administration. Indépendant de users.plan, qui reste une offre commerciale.';
comment on column public.admin_members.status is
  'Un administrateur suspendu perd ses droits sans perdre l''historique de ses actions.';

-- ---------------------------------------------------------------------
-- 3. RLS — fermée, avec une seule lecture : soi-même
--
--    Lire la liste des administrateurs depuis le client n'a aucun usage :
--    c'est une cible. Seule la ligne de l'utilisateur courant est lisible,
--    ce qui permet à l'interface de savoir si elle doit afficher le lien
--    d'administration.
-- ---------------------------------------------------------------------

alter table public.admin_members enable row level security;

drop policy if exists admin_members_select_self on public.admin_members;
create policy admin_members_select_self
  on public.admin_members
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.admin_members from public, anon, authenticated;
grant select on public.admin_members to authenticated;
grant select, insert, update on public.admin_members to service_role;

-- ---------------------------------------------------------------------
-- 4. `is_admin()` — la sonde utilisée par les API
--
--    `security invoker` : la fonction n'outrepasse pas RLS, elle lit la table
--    avec les droits de l'appelant. Un utilisateur non admin ne voit donc
--    aucune ligne et la fonction renvoie `false` — le droit n'est pas
--    « demandé », il est constaté.
--
--    Le bloc `exception` n'est pas un détail : si la migration n'a pas été
--    appliquée sur l'environnement, la requête lève `42P01` (relation
--    inexistante). Sans le garde-fou, l'erreur remonterait et pourrait être
--    confondue avec une panne ; avec lui, le verdict est `false`, sans
--    ambiguïté.
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_found boolean;
begin
  select true into v_found
    from public.admin_members
   where user_id = auth.uid()
     and status = 'active'
   limit 1;

  return coalesce(v_found, false);
exception
  when undefined_table then
    return false;
  when others then
    return false;
end;
$$;

comment on function public.is_admin() is
  'Vrai si l''utilisateur courant figure dans admin_members avec le statut actif. Renvoie false en cas d''erreur : aucun droit ne s''ouvre seul.';

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Désignation du premier super administrateur
--
--    Volontairement **commentée** : une migration ne doit jamais décider qui
--    dirige la plateforme. À exécuter une seule fois, à la main, avec
--    l'adresse e-mail réelle du fondateur :
--
--      insert into public.admin_members (user_id, role, status, created_by)
--      select id, 'super_admin', 'active', id
--        from auth.users
--       where email = 'ADRESSE_EMAIL_EXACTE';
--
--    Contrôle après coup, la table doit contenir exactement une ligne :
--
--      select user_id, role, status from public.admin_members;
--
--    Le premier administrateur peut ensuite en désigner d'autres depuis la
--    page Paramètres du Super Admin, chaque ajout étant journalisé.
-- ---------------------------------------------------------------------

notify pgrst, 'reload schema';
