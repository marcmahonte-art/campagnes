-- =====================================================================
--  Campagnes — Migration 0002 : formules, crédits et distribution
--  Cible : Supabase / Postgres 15+
--
--  Objet :
--    * aligner les valeurs de `plan_kind` sur les formules commerciales
--      (FREE / CREATOR / ORGANISATION) ;
--    * porter le solde de crédits du créateur et le budget de chaque
--      campagne ;
--    * journaliser chaque mouvement de crédits ;
--    * centraliser en SQL toute la logique d'argent (achat, dotation,
--      décompte), pour qu'aucun solde ne soit modifiable depuis le client.
--
--  À exécuter après 0001_init.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. `plan_kind` : 'pro' → 'creator', 'org' → 'organization'
--    Les valeurs de la 0001 étaient des brouillons ; la grille tarifaire
--    fixe les noms définitifs. On renomme au lieu de recréer le type,
--    pour ne pas perdre les lignes existantes.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'plan_kind' and e.enumlabel = 'pro'
  ) then
    alter type plan_kind rename value 'pro' to 'creator';
  end if;

  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'plan_kind' and e.enumlabel = 'org'
  ) then
    alter type plan_kind rename value 'org' to 'organization';
  end if;
end $$;

-- Filet de sécurité si la 0001 n'avait pas encore été appliquée.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_kind') then
    create type plan_kind as enum ('free', 'creator', 'organization');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Nature d'un mouvement de crédits
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'credit_reason') then
    create type credit_reason as enum (
      'pack_purchase',    -- achat d'un pack de distribution
      'free_quota',       -- dotation de bienvenue du plan Free
      'campaign_budget',  -- arbitrage d'un budget sur une campagne
      'participation',    -- consommation réelle par un participant
      'refund'            -- remboursement / annulation
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Colonnes ajoutées
-- ---------------------------------------------------------------------

-- 3.1 Solde de crédits du créateur. 1 participant = 1 crédit.
alter table public.users
  add column if not exists credits integer not null default 0;

alter table public.users
  drop constraint if exists users_credits_non_negative;
alter table public.users
  add constraint users_credits_non_negative check (credits >= 0);

comment on column public.users.credits is
  'Solde de participations disponibles. Débité uniquement quand un participant aboutit.';

-- 3.2 Budget de distribution de la campagne et compteur consommé.
alter table public.campaigns
  add column if not exists distribution_budget integer not null default 0;
alter table public.campaigns
  add column if not exists credits_consumed integer not null default 0;

alter table public.campaigns
  drop constraint if exists campaigns_distribution_budget_non_negative;
alter table public.campaigns
  add constraint campaigns_distribution_budget_non_negative check (distribution_budget >= 0);

alter table public.campaigns
  drop constraint if exists campaigns_credits_within_budget;
alter table public.campaigns
  add constraint campaigns_credits_within_budget
  check (credits_consumed >= 0 and credits_consumed <= distribution_budget);

comment on column public.campaigns.distribution_budget is
  'Nombre de participations que la campagne est autorisée à servir. 0 = non défini.';
comment on column public.campaigns.credits_consumed is
  'Participations réellement abouties — c''est ce qui a été décompté du solde.';

-- ---------------------------------------------------------------------
-- 4. Catalogue des packs de distribution
--    Le prix vit ici, pas seulement dans lib/credits.ts : c'est la base
--    qui fait foi au moment d'un achat. Le fichier TypeScript n'est que
--    le miroir d'affichage.
-- ---------------------------------------------------------------------
create table if not exists public.credit_packs (
  id           text primary key,
  name         text    not null,
  participants integer not null,      -- volume de participations
  price_fcfa   integer not null,
  sort_order   integer not null default 0,

  constraint credit_packs_participants_positive check (participants > 0),
  constraint credit_packs_price_positive       check (price_fcfa >= 0)
);

comment on table public.credit_packs is
  'Grille des packs de distribution. Modifiable sans redéploiement du site.';

insert into public.credit_packs (id, name, participants, price_fcfa, sort_order) values
  ('test',       'Test',         20,    0,     0),
  ('starter',    'Starter',      100,   2500,  1),
  ('popular',    'Popular',      500,   5000,  2),
  ('growth',     'Growth',       1000,  7500,  3),
  ('large',      'Large',        5000,  20000, 4)
on conflict (id) do update
  set name         = excluded.name,
      participants = excluded.participants,
      price_fcfa   = excluded.price_fcfa,
      sort_order   = excluded.sort_order;

-- Le pack « 10 000 et plus » (Enterprise) n'est pas dans la table : il se traite
-- sur devis. Un identifiant absent de cette table est refusé par
-- `purchase_credit_pack`.

-- ---------------------------------------------------------------------
-- 5. Journal des mouvements de crédits
-- ---------------------------------------------------------------------
create table if not exists public.credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid          not null references public.users (id) on delete cascade,
  amount      integer       not null,      -- positif = crédit, négatif = débit
  reason      credit_reason not null,
  label       text          not null default '',
  campaign_id uuid          references public.campaigns (id) on delete set null,
  created_at  timestamptz   not null default now(),

  constraint credit_transactions_amount_not_zero check (amount <> 0)
);

comment on table public.credit_transactions is
  'Historique des mouvements de crédits. Écrit uniquement par les fonctions SQL de cette migration.';

create index if not exists credit_transactions_owner_idx
  on public.credit_transactions (owner_id, created_at desc);
create index if not exists credit_transactions_campaign_idx
  on public.credit_transactions (campaign_id);

alter table public.credit_transactions enable row level security;

-- Lecture : chacun lit son propre journal. Personne n'écrit directement :
-- les seules écritures passent par les fonctions `security definer` ci-dessous.
drop policy if exists "credit_transactions_select_self" on public.credit_transactions;
create policy "credit_transactions_select_self" on public.credit_transactions
  for select to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. Dotation de bienvenue : 20 participations de test, à l'inscription
--    On remplace `handle_new_user` pour créditer dès la création du profil.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base       text;
  candidate  text;
  n          int := 0;
  bonus      constant int := 20;   -- miroir de FREE_TEST_QUOTA (lib/credits.ts)
begin
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

  insert into public.users (id, email, username, credits)
  values (new.id, new.email, candidate, bonus)
  on conflict (id) do nothing;

  insert into public.credit_transactions (owner_id, amount, reason, label)
  values (new.id, bonus, 'free_quota',
          'Dotation de bienvenue — ' || bonus || ' participations de test');

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Fonctions d'argent
--    Toutes sont `security definer` : elles seules ont le droit de toucher
--    au solde. Le client ne fait qu'appeler, il ne calcule jamais.
-- ---------------------------------------------------------------------

-- 7.1 Dotation de bienvenue (idempotente) — utile si le trigger n'a pas pu
--     tourner, ou pour rattraper un compte créé avant cette migration.
create or replace function public.grant_free_quota()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  bonus  constant int := 20;
  solde  integer;
begin
  if uid is null then
    raise exception 'Authentification requise.';
  end if;

  if exists (
    select 1 from public.credit_transactions
    where owner_id = uid and reason = 'free_quota'
  ) then
    select credits into solde from public.users where id = uid;
    return coalesce(solde, 0);
  end if;

  update public.users set credits = credits + bonus where id = uid
  returning credits into solde;

  insert into public.credit_transactions (owner_id, amount, reason, label)
  values (uid, bonus, 'free_quota',
          'Dotation de bienvenue — ' || bonus || ' participations de test');

  return coalesce(solde, 0);
end;
$$;

-- 7.2 Achat d'un pack de distribution.
--     En production, cette fonction est appelée par le webhook du prestataire
--     de paiement (CinetPay / FedaPay) avec la clé service_role, après
--     vérification de la transaction. L'exécution par `authenticated` est
--     ouverte uniquement pour la phase de recette.
create or replace function public.purchase_credit_pack(p_pack_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  pack  public.credit_packs;
  solde integer;
begin
  if uid is null then
    raise exception 'Authentification requise.';
  end if;

  select * into pack from public.credit_packs where id = p_pack_id;
  if not found then
    raise exception 'Pack de distribution inconnu : %', p_pack_id;
  end if;

  update public.users set credits = credits + pack.participants where id = uid
  returning credits into solde;

  insert into public.credit_transactions (owner_id, amount, reason, label)
  values (uid, pack.participants, 'pack_purchase',
          'Pack ' || pack.name || ' — ' || pack.participants || ' participations');

  return coalesce(solde, 0);
end;
$$;

-- 7.3 Décompte d'une participation réelle.
--     Jamais à l'ouverture du lien : uniquement quand le visuel est produit.
--     Vérifie le solde global ET le budget restant de la campagne.
create or replace function public.consume_participation(
  p_campaign_id uuid,
  p_count       integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  camp      public.campaigns;
  solde     integer;
begin
  if uid is null then
    raise exception 'Authentification requise.';
  end if;
  if p_count is null or p_count < 1 then
    raise exception 'Nombre de participations invalide.';
  end if;

  -- Verrouille la ligne le temps du décompte : deux participations
  -- simultanées ne peuvent pas lire le même solde.
  select * into camp from public.campaigns
  where id = p_campaign_id and owner_id = uid
  for update;

  if not found then
    raise exception 'Campagne introuvable.';
  end if;
  if camp.distribution_budget <= 0 then
    raise exception 'Aucun budget de distribution défini pour cette campagne.';
  end if;
  if camp.distribution_budget - camp.credits_consumed < p_count then
    raise exception 'Budget de distribution épuisé pour cette campagne.';
  end if;

  select credits into solde from public.users where id = uid for update;
  if coalesce(solde, 0) < p_count then
    raise exception 'Solde de crédits insuffisant.';
  end if;

  update public.campaigns
     set credits_consumed = credits_consumed + p_count
   where id = p_campaign_id;

  update public.users set credits = credits - p_count where id = uid
  returning credits into solde;

  insert into public.credit_transactions (owner_id, amount, reason, label, campaign_id)
  values (uid, -p_count, 'participation',
          p_count || ' participation' || case when p_count > 1 then 's' else '' end
          || ' — ' || camp.name,
          p_campaign_id);

  return coalesce(solde, 0);
end;
$$;

-- 7.4 Changement de formule.
--     ATTENTION — en production, cette fonction doit être révoquée pour
--     `authenticated` : seul le webhook de paiement (service_role) doit
--     pouvoir activer une formule payante. Elle reste ouverte ici pour
--     permettre la recette de bout en bout sans prestataire branché.
create or replace function public.set_own_plan(p_plan plan_kind)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentification requise.';
  end if;

  update public.users set plan = p_plan where id = uid;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Droits d'exécution
-- ---------------------------------------------------------------------
revoke all on function public.grant_free_quota()                from public, anon;
revoke all on function public.purchase_credit_pack(text)        from public, anon;
revoke all on function public.consume_participation(uuid, int)  from public, anon;
revoke all on function public.set_own_plan(plan_kind)           from public, anon;

grant execute on function public.grant_free_quota()               to authenticated;
grant execute on function public.purchase_credit_pack(text)       to authenticated;
grant execute on function public.consume_participation(uuid, int) to authenticated;
grant execute on function public.set_own_plan(plan_kind)          to authenticated;

-- ---------------------------------------------------------------------
-- 9. Realtime — le solde et le compteur de distribution se rafraîchissent
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'credit_transactions'
  ) then
    alter publication supabase_realtime add table public.credit_transactions;
  end if;
end $$;
