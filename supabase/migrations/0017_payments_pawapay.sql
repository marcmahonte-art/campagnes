-- =====================================================================
--  Campagnes — Migration 0017 : paiements pawaPay & abonnements
--  Cible : Supabase / Postgres 15+
--
--  Objet :
--    * Table des paiements Mobile Money (pawaPay v2) ;
--    * Traçabilité de chaque transaction (deposit_id unique requis par pawaPay) ;
--    * Sécurisation RLS : lecture réservée au propriétaire, écritures à service_role ;
--    * Procédure atomique d'activation de la formule à la validation du paiement.
--
--  À exécuter après 0016_revoke_distribution_link.sql.
-- =====================================================================

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  deposit_id uuid not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  plan plan_kind not null,
  amount numeric(12, 2) not null,
  currency text not null default 'XOF',
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  failure_code text,
  failure_message text,
  provider text,
  phone_number text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index pour réconciliation pawaPay et historique utilisateur
create index if not exists idx_payments_deposit_id on public.payments(deposit_id);
create index if not exists idx_payments_user_id on public.payments(user_id);
create index if not exists idx_payments_status on public.payments(status);

-- RLS
alter table public.payments enable row level security;

-- Un utilisateur ne peut que consulter ses propres paiements
create policy "users_select_own_payments"
  on public.payments
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Interdiction d'insertion/modification directe par le client
revoke insert, update, delete on public.payments from public, anon, authenticated;
grant select on public.payments to authenticated;
grant all on public.payments to service_role;

-- ---------------------------------------------------------------------
-- Procédure serveur d'achèvement de paiement et d'activation de plan
-- Réservée à service_role pour le webhook pawaPay
-- ---------------------------------------------------------------------
create or replace function public.complete_payment_and_activate_plan(
  p_deposit_id uuid,
  p_provider text default null,
  p_phone text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments
  where deposit_id = p_deposit_id
  for update;

  if not found then
    raise exception 'Paiement introuvable pour deposit_id: %', p_deposit_id;
  end if;

  if v_payment.status = 'completed' then
    return v_payment;
  end if;

  update public.payments
  set
    status = 'completed',
    provider = coalesce(p_provider, provider),
    phone_number = coalesce(p_phone, phone_number),
    updated_at = now()
  where deposit_id = p_deposit_id
  returning * into v_payment;

  -- Activation du plan pour l'utilisateur
  perform public.set_user_plan(v_payment.user_id, v_payment.plan);

  return v_payment;
end;
$$;

revoke all on function public.complete_payment_and_activate_plan(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_payment_and_activate_plan(uuid, text, text) to service_role;

comment on table public.payments is
  'Historique des paiements Mobile Money via pawaPay v2. Écriture réservée à service_role.';

-- Recharger le cache PostgREST
notify pgrst, 'reload schema';
