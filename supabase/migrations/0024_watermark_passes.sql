-- =====================================================================
--  Campagnes — Migration 0024 : pass « Sans filigrane » (PawaPay Checkouts)
--  Cible : Supabase / Postgres 15+
--
--  Objet :
--    * Table des commandes de pass anonymes, liées à un **navigateur** et non
--      à un compte : c'est ce qui reproduit « achat sans compte, valable sur ce
--      navigateur uniquement » (modèle Twibbonix).
--    * Aucune colonne `user_id` : le droit ne dépend jamais d'une identité.
--    * Un seul pass actif par navigateur (index unique partiel).
--    * Activation idempotente à la confirmation du paiement pawaPay.
--
--  À exécuter après 0023_free_campaign_limit.sql.
--
--  Sécurité : RLS activée, **aucune** policy publique. Seul `service_role`
--  (les route handlers serveur) lit et écrit. L'`anon key` ne peut rien.
-- =====================================================================

create table if not exists public.watermark_pass_orders (
  id              uuid primary key default gen_random_uuid(),
  -- UUID aléatoire porté par le cookie httpOnly `cn_bid`.
  browser_id      text        not null,
  -- sha256(User-Agent) : rend un cookie copié inutilisable ailleurs.
  ua_hash         text        not null,
  provider        text        not null default 'pawapay',
  -- Identifiant de checkout PawaPay, généré par nous (UUIDv4), unique.
  checkout_id     uuid        not null unique,
  -- Une seule durée offerte : 24 h. Contrainte plutôt que convention.
  duration_h      integer     not null default 24 check (duration_h = 24),
  amount          numeric(12, 2) not null,
  currency        text        not null default 'XOF',
  country         text,
  status          text        not null default 'pending'
                  check (status in ('pending', 'waiting_payment', 'processing',
                                    'active', 'expired', 'failed', 'cancelled')),
  starts_at       timestamptz,
  ends_at         timestamptz,
  completed_at    timestamptz,
  failure_code    text,
  failure_message text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_wpo_browser on public.watermark_pass_orders (browser_id, ends_at desc);
create index if not exists idx_wpo_status  on public.watermark_pass_orders (status);

-- Un seul pass actif par navigateur. Index partiel : Postgres refuse `now()`
-- dans un prédicat, donc `activate_watermark_pass` expire d'abord les pass
-- périmés du même navigateur avant d'en activer un nouveau.
create unique index if not exists wpo_one_active_per_browser
  on public.watermark_pass_orders (browser_id)
  where status = 'active';

alter table public.watermark_pass_orders enable row level security;

revoke all on public.watermark_pass_orders from public, anon, authenticated;
grant all on public.watermark_pass_orders to service_role;

-- ---------------------------------------------------------------------
-- Expiration : libère l'index partiel des pass dont l'échéance est passée.
-- ---------------------------------------------------------------------
create or replace function public.expire_watermark_passes()
returns void
language sql
security definer
set search_path = public
as $$
  update public.watermark_pass_orders
     set status = 'expired', updated_at = now()
   where status = 'active'
     and ends_at is not null
     and ends_at < now();
$$;

-- ---------------------------------------------------------------------
-- Activation idempotente, appelée par le webhook **et** par la route de
-- synchronisation. Un rejeu (webhook dupliqué, retour navigateur après le
-- webhook) ne prolonge jamais un pass déjà actif.
--
-- La fonction vérifie aussi le **montant** et la **devise** encaissés contre
-- ceux fixés par le serveur à la création de la commande : un paiement partiel,
-- ou dans une autre devise, n'active rien. Le prix n'a jamais été choisi par le
-- client ; on refuse ici tout ce qui ne correspond pas à la ligne enregistrée.
-- ---------------------------------------------------------------------
drop function if exists public.activate_watermark_pass(uuid, text);
drop function if exists public.activate_watermark_pass(uuid, text, numeric, text);

create or replace function public.activate_watermark_pass(
  p_checkout_id uuid,
  p_provider    text    default null,
  p_amount      numeric default null,
  p_currency    text    default null
)
returns public.watermark_pass_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.watermark_pass_orders;
begin
  select * into v_order
    from public.watermark_pass_orders
   where checkout_id = p_checkout_id
   for update;

  if not found then
    raise exception 'Commande de pass introuvable pour checkout_id: %', p_checkout_id;
  end if;

  -- Déjà actif : idempotent, on ne prolonge pas.
  if v_order.status = 'active' then
    return v_order;
  end if;

  -- Un pass échoué ou annulé ne peut pas être activé a posteriori.
  if v_order.status in ('failed', 'cancelled') then
    return v_order;
  end if;

  -- Montant encaissé différent du prix serveur : on n'active pas.
  if p_amount is not null and p_amount <> v_order.amount then
    return v_order;
  end if;

  -- Devise différente : on n'active pas.
  if p_currency is not null and upper(p_currency) <> upper(v_order.currency) then
    return v_order;
  end if;

  -- Libère l'index partiel : expire les pass périmés du même navigateur.
  update public.watermark_pass_orders
     set status = 'expired', updated_at = now()
   where browser_id = v_order.browser_id
     and status = 'active'
     and ends_at is not null
     and ends_at < now();

  update public.watermark_pass_orders
     set status        = 'active',
         provider      = coalesce(p_provider, provider),
         starts_at     = now(),
         ends_at       = now() + (v_order.duration_h || ' hours')::interval,
         completed_at  = now(),
         updated_at    = now()
   where checkout_id = p_checkout_id
   returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.expire_watermark_passes() from public, anon, authenticated;
revoke all on function public.activate_watermark_pass(uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.expire_watermark_passes() to service_role;
grant execute on function public.activate_watermark_pass(uuid, text, numeric, text) to service_role;

comment on table public.watermark_pass_orders is
  'Pass « Sans filigrane » 24 h, anonyme, lié à un navigateur (cookie cn_bid). Écriture réservée à service_role.';

-- Recharger le cache PostgREST
notify pgrst, 'reload schema';
