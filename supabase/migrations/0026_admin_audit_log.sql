-- =====================================================================
--  Campagnes — Migration 0026 : journal d'audit administratif
--  Cible : Supabase / Postgres 15+
--
--  Objet :
--    Un dashboard d'administration sans trace de ses propres actions ne vaut
--    pas mieux qu'un accès direct à la base : on peut y lire, exporter et
--    corriger sans que personne ne sache qui a fait quoi.
--
--    Ce journal est donc **append-only** :
--      - aucune policy n'autorise `update` ni `delete` ;
--      - un trigger les refuse même pour un super administrateur, car un
--        droit applicatif ne doit pas pouvoir effacer l'histoire ;
--      - `service_role` peut écrire (c'est le seul chemin d'écriture),
--        `anon` et `authenticated` n'ont strictement aucun privilège.
--
--  Ce qui est enregistré, et ce qui ne l'est pas :
--    - `actor_email` est une commodité de lecture : un UUID seul oblige à
--      ouvrir la table `users` pour savoir de qui l'on parle ;
--    - `metadata_safe` est un jsonb **minimisé** : filtres appliqués, nombre
--      de lignes exportées, nature de l'action. Jamais de payload de
--      paiement, jamais de jeton, jamais de photo.
--
--  À exécuter après 0025_super_admin_access.sql.
-- =====================================================================

create table if not exists public.admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid not null,
  actor_email   text,
  action        text not null,
  resource_type text not null default '-',
  resource_id   text,
  reason        text,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),

  constraint admin_audit_log_action_len check (char_length(action) between 2 and 120),
  constraint admin_audit_log_resource_type_len check (
    char_length(resource_type) between 1 and 60
  )
);

comment on table public.admin_audit_log is
  'Journal des actions administratives sensibles. Append-only : aucune modification ni suppression autorisée.';
comment on column public.admin_audit_log.metadata_safe is
  'Données de contexte minimisées (filtres, volumes). Aucun secret, aucun contenu personnel.';

-- Les lectures du journal se font par période décroissante : l'index la
-- porte dans cet ordre, l'écriture reste en queue.
create index if not exists idx_admin_audit_log_created_at
  on public.admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_log_actor
  on public.admin_audit_log (actor_id, created_at desc);

-- ---------------------------------------------------------------------
-- 1. RLS — fermée à tous les rôles clients
--
--    La consultation du journal se fait côté serveur, avec `service_role`,
--    depuis la page d'administration. Exposer la table à `authenticated`
--    reviendrait à donner la liste des actions de support à n'importe quel
--    compte qui en devinerait le nom.
-- ---------------------------------------------------------------------

alter table public.admin_audit_log enable row level security;

revoke all on public.admin_audit_log from public, anon, authenticated;
grant insert, select on public.admin_audit_log to service_role;

-- ---------------------------------------------------------------------
-- 2. Immuabilité
--
--    `service_role` contourne RLS : sans ce trigger, un super administrateur
--    pourrait « corriger » un export sensible après coup. Le journal est une
--    preuve, pas un brouillon.
-- ---------------------------------------------------------------------

create or replace function public.admin_audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Journal d''audit immuable : une entrée ne se modifie ni ne se supprime.';
end;
$$;

comment on function public.admin_audit_log_immutable() is
  'Refuse toute modification ou suppression dans admin_audit_log, y compris pour service_role.';

drop trigger if exists admin_audit_log_no_update on public.admin_audit_log;
create trigger admin_audit_log_no_update
  before update on public.admin_audit_log
  for each row execute function public.admin_audit_log_immutable();

drop trigger if exists admin_audit_log_no_delete on public.admin_audit_log;
create trigger admin_audit_log_no_delete
  before delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_immutable();

-- ---------------------------------------------------------------------
-- 3. Écriture — une seule fonction, un seul point d'entrée
--
--    Réservée à `service_role` : le client n'écrit jamais son propre journal,
--    sinon l'action et sa trace pourraient diverger.
--
--    `p_metadata_safe` est vidé de son contenu si l'appelant passe null, et
--    la fonction n'accepte aucun champ libre au-delà de ce qui est prévu.
-- ---------------------------------------------------------------------

create or replace function public.log_admin_action(
  p_actor_id      uuid,
  p_actor_email   text,
  p_action        text,
  p_resource_type text default '-',
  p_resource_id   text default null,
  p_reason        text default null,
  p_metadata_safe jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.admin_audit_log (
    actor_id,
    actor_email,
    action,
    resource_type,
    resource_id,
    reason,
    metadata_safe
  ) values (
    p_actor_id,
    p_actor_email,
    p_action,
    coalesce(nullif(trim(p_resource_type), ''), '-'),
    p_resource_id,
    p_reason,
    coalesce(p_metadata_safe, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.log_admin_action(uuid, text, text, text, text, text, jsonb) is
  'Ajoute une entrée au journal d''audit administratif. Réservée à service_role.';

revoke all on function
  public.log_admin_action(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function
  public.log_admin_action(uuid, text, text, text, text, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
