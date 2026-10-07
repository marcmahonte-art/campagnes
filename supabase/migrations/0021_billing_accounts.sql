-- =====================================================================
-- Campagnes — Migration 0021 : commandes, crédits de compte et factures
-- =====================================================================
--
-- Les paiements existants restent valides :
--   - un ancien paiement de campagne conserve campaign_id ;
--   - un abonnement conserve plan ;
--   - un nouvel achat de crédits de compte utilise purchase_type = account_credits.
--
-- Aucun navigateur ne peut écrire dans ces tables. Les mutations passent par
-- les fonctions réservées à service_role et sont idempotentes par deposit_id.
-- =====================================================================

-- 1. Nature explicite d'une commande
alter table public.payments
  add column if not exists purchase_type text;

update public.payments
   set purchase_type = case
     when campaign_id is not null then 'campaign_topup'
     when plan is not null then 'plan'
     else 'account_credits'
   end
 where purchase_type is null;

alter table public.payments
  alter column purchase_type set default 'plan',
  alter column purchase_type set not null;

alter table public.payments
  drop constraint if exists payments_purchase_type_check,
  add constraint payments_purchase_type_check
    check (purchase_type in ('plan', 'campaign_topup', 'account_credits'));

alter table public.payments
  drop constraint if exists payments_target_present,
  add constraint payments_target_present
    check (
      (purchase_type = 'plan' and plan is not null and campaign_id is null)
      or (purchase_type = 'campaign_topup' and plan is null and campaign_id is not null)
      or (purchase_type = 'account_credits' and plan is null and campaign_id is null)
    );

comment on column public.payments.purchase_type is
  'Nature immuable de la commande : formule, recharge d''une campagne existante ou crédits du compte.';

-- 2. Portefeuille de crédits achetés au niveau du compte
create table if not exists public.account_credit_balances (
  user_id uuid primary key references public.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.account_credit_balances enable row level security;

drop policy if exists "users_select_own_account_credit_balance" on public.account_credit_balances;
create policy "users_select_own_account_credit_balance"
  on public.account_credit_balances
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.account_credit_balances from public, anon, authenticated;
grant select on public.account_credit_balances to authenticated;
grant all on public.account_credit_balances to service_role;

create table if not exists public.account_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  amount integer not null check (amount <> 0),
  kind text not null check (kind in ('purchase', 'allocation', 'refund', 'adjustment')),
  balance_after integer not null check (balance_after >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_account_credit_ledger_payment_purchase
  on public.account_credit_ledger(payment_id)
  where payment_id is not null and kind = 'purchase';

create index if not exists idx_account_credit_ledger_user_created
  on public.account_credit_ledger(user_id, created_at desc);

alter table public.account_credit_ledger enable row level security;

drop policy if exists "users_select_own_account_credit_ledger" on public.account_credit_ledger;
create policy "users_select_own_account_credit_ledger"
  on public.account_credit_ledger
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.account_credit_ledger from public, anon, authenticated;
grant select on public.account_credit_ledger to authenticated;
grant all on public.account_credit_ledger to service_role;

-- 3. Factures immuables, une par paiement confirmé
create sequence if not exists public.invoice_number_seq;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'issued' check (status in ('issued', 'void')),
  currency text not null default 'XOF',
  subtotal numeric(12, 2) not null,
  total numeric(12, 2) not null,
  seller jsonb not null,
  buyer jsonb not null,
  lines jsonb not null,
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoices_user_created
  on public.invoices(user_id, created_at desc);

alter table public.invoices enable row level security;

drop policy if exists "users_select_own_invoices" on public.invoices;
create policy "users_select_own_invoices"
  on public.invoices
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.invoices from public, anon, authenticated;
grant select on public.invoices to authenticated;
grant all on public.invoices to service_role;

-- 4. Créditer un achat de crédits de compte, une seule fois
create or replace function public.credit_account_credits(
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
  v_increment integer;
  v_balance integer;
  v_payment_id uuid;
begin
  select * into v_payment
    from public.payments
   where deposit_id = p_deposit_id
   for update;

  if not found then
    raise exception 'Paiement introuvable pour deposit_id: %', p_deposit_id;
  end if;

  if v_payment.status = 'completed' then
    return v_payment;
  end if;

  if v_payment.purchase_type <> 'account_credits' then
    raise exception 'Paiement % sans portefeuille de crédits de compte.', p_deposit_id;
  end if;

  v_increment := nullif((v_payment.metadata ->> 'credit_amount')::integer, 0);
  if v_increment is null or v_increment <= 0 then
    raise exception 'Quantité de crédits invalide pour deposit_id: %', p_deposit_id;
  end if;

  v_payment_id := v_payment.id;

  insert into public.account_credit_balances(user_id, balance)
  values (v_payment.user_id, 0)
  on conflict (user_id) do nothing;

  select balance into v_balance
    from public.account_credit_balances
   where user_id = v_payment.user_id
   for update;

  v_balance := v_balance + v_increment;

  insert into public.account_credit_ledger(
    user_id, payment_id, amount, kind, balance_after, metadata
  ) values (
    v_payment.user_id,
    v_payment_id,
    v_increment,
    'purchase',
    v_balance,
    jsonb_build_object('deposit_id', p_deposit_id)
  ) on conflict (payment_id) where kind = 'purchase' do nothing;

  update public.account_credit_balances
     set balance = v_balance, updated_at = now()
   where user_id = v_payment.user_id;

  update public.payments
     set status = 'completed',
         provider = coalesce(p_provider, provider),
         phone_number = coalesce(p_phone, phone_number),
         updated_at = now()
   where deposit_id = p_deposit_id
   returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.credit_account_credits(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.credit_account_credits(uuid, text, text) to service_role;

-- 5. Émettre une facture à partir du snapshot de commande
create or replace function public.issue_invoice_for_payment(p_deposit_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_existing public.invoices;
  v_invoice public.invoices;
  v_meta jsonb;
  v_year text;
begin
  select * into v_payment from public.payments
   where deposit_id = p_deposit_id
   for update;

  if not found or v_payment.status <> 'completed' then
    return null;
  end if;

  select * into v_existing from public.invoices where payment_id = v_payment.id;
  if found then
    return v_existing;
  end if;

  v_meta := coalesce(v_payment.metadata, '{}'::jsonb);
  v_year := to_char(coalesce(v_payment.updated_at, now()), 'YYYY');

  insert into public.invoices(
    invoice_number,
    payment_id,
    user_id,
    currency,
    subtotal,
    total,
    seller,
    buyer,
    lines,
    issued_at,
    paid_at
  ) values (
    'FAC-' || v_year || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0'),
    v_payment.id,
    v_payment.user_id,
    coalesce(v_payment.currency, 'XOF'),
    v_payment.amount,
    v_payment.amount,
    coalesce(v_meta -> 'seller', '{}'::jsonb),
    coalesce(v_meta -> 'buyer', '{}'::jsonb),
    coalesce(v_meta -> 'invoice_lines', '[]'::jsonb),
    coalesce(v_payment.updated_at, now()),
    coalesce(v_payment.updated_at, now())
  )
  on conflict (payment_id) do nothing
  returning * into v_invoice;

  if v_invoice.id is null then
    select * into v_invoice from public.invoices where payment_id = v_payment.id;
  end if;

  return v_invoice;
end;
$$;

revoke all on function public.issue_invoice_for_payment(uuid)
  from public, anon, authenticated;
grant execute on function public.issue_invoice_for_payment(uuid) to service_role;

-- 6. Affecter volontairement des crédits du compte à une campagne
create unique index if not exists idx_account_credit_ledger_allocation_reference
  on public.account_credit_ledger((metadata ->> 'reference'))
  where kind = 'allocation' and metadata ? 'reference';

create or replace function public.allocate_account_credits(
  p_user_id uuid,
  p_campaign_id uuid,
  p_amount integer,
  p_reference uuid
)
returns public.account_credit_balances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance public.account_credit_balances;
  v_campaign_owner uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Le nombre de crédits doit être supérieur à zéro.';
  end if;

  select * into v_balance
    from public.account_credit_balances
   where user_id = p_user_id
   for update;

  if not found or v_balance.balance < p_amount then
    raise exception 'Solde de crédits insuffisant.';
  end if;

  select owner_id into v_campaign_owner
    from public.campaigns
   where id = p_campaign_id
   for update;

  if v_campaign_owner is null or v_campaign_owner <> p_user_id then
    raise exception 'Campagne introuvable ou non autorisée.';
  end if;

  if exists (
    select 1 from public.account_credit_ledger
     where kind = 'allocation'
       and metadata ->> 'reference' = p_reference::text
  ) then
    return v_balance;
  end if;

  update public.campaigns
     set participants_granted = participants_granted + p_amount
   where id = p_campaign_id;

  v_balance.balance := v_balance.balance - p_amount;
  v_balance.updated_at := now();

  update public.account_credit_balances
     set balance = v_balance.balance, updated_at = v_balance.updated_at
   where user_id = p_user_id;

  insert into public.account_credit_ledger(
    user_id, amount, kind, balance_after, metadata
  ) values (
    p_user_id,
    -p_amount,
    'allocation',
    v_balance.balance,
    jsonb_build_object('campaign_id', p_campaign_id, 'reference', p_reference)
  );

  return v_balance;
end;
$$;

revoke all on function public.allocate_account_credits(uuid, uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.allocate_account_credits(uuid, uuid, integer, uuid) to service_role;

notify pgrst, 'reload schema';
