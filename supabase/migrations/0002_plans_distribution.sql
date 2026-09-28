-- =====================================================================
--  Campagnes — Migration 0002 : formules et grille de distribution
--  Cible : Supabase / Postgres 15+
--
--  Objet :
--    * aligner les valeurs de `plan_kind` sur les formules commerciales
--      (FREE / CREATOR / ORGANISATION) ;
--    * porter la grille tarifaire de la distribution ;
--    * permettre l'activation d'une formule.
--
--  Décision produit : la distribution est facturée à l'usage, **sur devis**.
--  Il n'y a donc ni solde, ni compteur, ni journal de mouvements : la grille
--  ci-dessous est une base de devis, pas un système de consommation.
--  (Une version antérieure de cette migration portait un système de crédits ;
--  il a été retiré sur décision produit. La base n'ayant jamais été
--  provisionnée, le fichier a été réécrit plutôt que corrigé par une 0003.)
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
-- 2. Grille tarifaire de la distribution
--    Le prix vit ici, pas seulement dans lib/distribution.ts : c'est la
--    base qui fait foi au moment d'établir un devis. Le fichier TypeScript
--    n'est que le miroir d'affichage.
-- ---------------------------------------------------------------------
create table if not exists public.distribution_offers (
  id           text primary key,
  name         text    not null,
  participants integer not null,      -- volume de participations
  price_fcfa   integer not null,
  sort_order   integer not null default 0,

  constraint distribution_offers_participants_positive check (participants > 0),
  constraint distribution_offers_price_positive       check (price_fcfa >= 0)
);

comment on table public.distribution_offers is
  'Grille de distribution. Base de devis, modifiable sans redéploiement du site.';

-- Lecture publique : la grille est affichée sur la page tarifs, sans compte.
alter table public.distribution_offers enable row level security;

drop policy if exists "distribution_offers_read_all" on public.distribution_offers;
create policy "distribution_offers_read_all" on public.distribution_offers
  for select to anon, authenticated
  using (true);

-- Aucune policy d'écriture : la grille se modifie depuis le tableau de bord
-- Supabase (service_role), jamais depuis le client.

insert into public.distribution_offers (id, name, participants, price_fcfa, sort_order) values
  ('starter',    'Starter',      100,   2500,  1),
  ('popular',    'Popular',      500,   5000,  2),
  ('growth',     'Growth',       1000,  7500,  3),
  ('large',      'Large',        5000,  20000, 4)
on conflict (id) do update
  set name         = excluded.name,
      participants = excluded.participants,
      price_fcfa   = excluded.price_fcfa,
      sort_order   = excluded.sort_order;

-- Le palier « 10 000 et plus » (Grand volume) n'est pas dans la table : il se
-- traite sur devis, cas par cas. Un identifiant absent est simplement proposé
-- comme « sur devis » par l'interface.

-- ---------------------------------------------------------------------
-- 3. Activation d'une formule
--    ATTENTION — en production, cette fonction doit être révoquée pour
--    `authenticated` : seul le webhook de paiement (service_role) doit
--    pouvoir activer une formule payante. Elle reste ouverte ici pour
--    permettre la recette de bout en bout sans prestataire branché.
-- ---------------------------------------------------------------------
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

revoke all on function public.set_own_plan(plan_kind) from public, anon;
grant execute on function public.set_own_plan(plan_kind) to authenticated;

comment on function public.set_own_plan(plan_kind) is
  'Active une formule pour le compte courant. À révoquer pour `authenticated` en production : seul le webhook de paiement doit pouvoir activer une formule payante.';
