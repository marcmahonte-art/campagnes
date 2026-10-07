-- =====================================================================
-- Campagnes 0022: transactional distribution, historical cutover and ACLs.
-- Only database lots 1-4 are implemented; public visibility is unchanged.
-- Lock order: wallet (funding/revocation/refund only), campaign, link,
-- operation. Payment callbacks retain their existing independent contracts.
-- No included-plan allocation or automatic refund is introduced.
-- =====================================================================

begin;

-- Drain legacy writers before snapshotting; campaign reads remain possible
-- while an old claim finishes with its pre-existing link-first lock order.
lock table public.campaigns in share row exclusive mode;
lock table public.distribution_links in access exclusive mode;
lock table public.distribution_usages in share row exclusive mode;

alter table public.distribution_links
  add column history_used integer not null default 0,
  add column history_quota_total integer not null default 0,
  add column history_delta bigint not null default 0,
  add column bought_total integer not null default 0,
  add column refunded_count integer not null default 0,
  add column refund_closed_at timestamptz,
  add column funding_origin text not null default 'bought';

-- Preserve counters, URLs, and even historical counter/trace discrepancies.
-- Historical claims are not retrospectively described as delivered exports.
update public.distribution_links l
   set history_used = l.quota_used,
       history_quota_total = l.quota_total,
       history_delta = l.quota_used::bigint - (
         select count(*) from public.distribution_usages u
          where u.distribution_link_id = l.id
       ),
       funding_origin = 'historical';

alter table public.distribution_links
  add constraint distribution_links_history_valid
    check (history_used >= 0 and history_quota_total >= 0),
  add constraint distribution_links_funding_valid
    check (bought_total >= 0 and refunded_count between 0 and bought_total),
  add constraint distribution_links_envelope_valid
    check (quota_total::bigint = history_quota_total::bigint + bought_total::bigint),
  add constraint distribution_links_origin_valid
    check (funding_origin in ('historical', 'bought', 'mixed')),
  add constraint distribution_links_refund_closed
    check (refunded_count = 0 or refund_closed_at is not null);

create table public.distribution_export_operations (
  operation_id uuid primary key,
  distribution_link_id uuid references public.distribution_links(id) on delete set null,
  -- Creator ownership is not a participant identity. Account deletion retains
  -- its existing cascading policy; campaign/link deletion retains receipts.
  owner_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  format text not null check (format in ('png', 'video')),
  descriptor_hash text not null check (descriptor_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'RESERVED'
    check (state in ('RESERVED', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  expires_at timestamptz not null,
  receipt uuid unique,
  created_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  constraint distribution_export_duration_valid
    check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  constraint distribution_export_receipt_valid check (
    (state = 'CONFIRMED' and receipt is not null and confirmed_at is not null)
    or (state <> 'CONFIRMED' and receipt is null and confirmed_at is null)
  )
);

create index distribution_export_operations_link_state_idx
  on public.distribution_export_operations(distribution_link_id, state);
create index distribution_export_operations_live_idx
  on public.distribution_export_operations(distribution_link_id, expires_at, operation_id)
  where state = 'RESERVED';
create index distribution_export_operations_owner_idx
  on public.distribution_export_operations(owner_id, created_at desc);

alter table public.distribution_usages
  add column operation_id uuid unique
    references public.distribution_export_operations(operation_id) on delete set null;

-- Durable request bindings survive campaign/link deletion. No FK to a target
-- or a ledger row can silently delete financial evidence. Zero-unit refunds
-- are recorded here, not as forbidden zero-amount account ledger entries.
create table public.distribution_funding_requests (
  owner_id uuid not null references public.users(id) on delete cascade,
  reference uuid not null,
  action text not null check (action in ('create', 'recharge', 'refund')),
  campaign_id uuid not null,
  link_id uuid not null,
  token text not null,
  amount integer not null check (amount >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  primary key (owner_id, reference),
  constraint distribution_funding_amount_valid
    check (action = 'refund' or amount between 1 and 1000000)
);
create unique index distribution_funding_one_refund_idx
  on public.distribution_funding_requests(link_id) where action = 'refund';

-- Existing references were globally unique; retain their values but scope
-- future references to the owner, including allocations and refunds.
drop index public.idx_account_credit_ledger_allocation_reference;
create unique index idx_account_credit_ledger_allocation_reference
  on public.account_credit_ledger(user_id, (metadata ->> 'reference'))
  where kind in ('allocation', 'refund') and metadata ? 'reference';

alter table public.distribution_export_operations enable row level security;
alter table public.distribution_funding_requests enable row level security;

create policy distribution_export_operations_owner
  on public.distribution_export_operations for select to authenticated
  using (owner_id = auth.uid());
create policy distribution_funding_requests_owner
  on public.distribution_funding_requests for select to authenticated
  using (owner_id = auth.uid());

drop policy distribution_links_owner on public.distribution_links;
create policy distribution_links_owner on public.distribution_links
  for select to authenticated using (
    exists (select 1 from public.campaigns c
      where c.id = distribution_links.campaign_id and c.owner_id = auth.uid())
  );

-- Immutable baseline and terminal revocation also block legacy function
-- invocations that were already running when the cutover acquired its locks.
create function public.distribution_link_invariants_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_confirmed bigint;
begin
  if tg_op = 'UPDATE' then
    if new.history_used is distinct from old.history_used
       or new.history_quota_total is distinct from old.history_quota_total
       or new.history_delta is distinct from old.history_delta
       or new.id is distinct from old.id
       or new.campaign_id is distinct from old.campaign_id
       or new.token is distinct from old.token then
      raise exception 'Historical distribution binding is immutable.' using errcode = '23514';
    end if;
    if old.status = 'REVOKED' and new.status <> 'REVOKED' then
      raise exception 'Distribution revocation is terminal.' using errcode = '23514';
    end if;
    if old.refund_closed_at is not null and (
      new.refund_closed_at is distinct from old.refund_closed_at
      or new.refunded_count is distinct from old.refunded_count
      or new.bought_total is distinct from old.bought_total
    ) then
      raise exception 'Distribution refund is terminal.' using errcode = '23514';
    end if;
  end if;
  select count(*) into v_confirmed
    from public.distribution_export_operations o
   where o.distribution_link_id = new.id and o.state = 'CONFIRMED';
  if new.quota_used::bigint <> new.history_used::bigint + v_confirmed then
    raise exception 'Reload the distribution page before exporting.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger distribution_link_invariants_v1
  before insert or update on public.distribution_links
  for each row execute function public.distribution_link_invariants_v1();

create or replace function public.create_distribution_link(
  p_campaign_id uuid, p_quota integer, p_expires_at timestamptz default null
)
returns text language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Rechargez la page pour utiliser la distribution financée.' using errcode = '55000';
end;
$$;

create or replace function public.claim_distribution(p_token text)
returns table (granted boolean, used integer, quota integer, campaign_id uuid)
language sql stable security definer set search_path = pg_catalog, public
as $$ select false, 0, 0, null::uuid; $$;

-- Pure, stable resolution: no writes, no counters, no public campaign quota.
create or replace function public.resolve_distribution(p_token text)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object('campaign_id', l.campaign_id,
    'client_logo_url', l.client_logo_url, 'protocol_version', 1)
  from public.distribution_links l
  join public.campaigns c on c.id = l.campaign_id
  join public.frames f on f.id = c.frame_id and f.owner_id = c.owner_id
  where l.token = p_token and c.status = 'published'
    and l.status <> 'REVOKED' and l.refund_closed_at is null
    and (l.expires_at is null or l.expires_at > statement_timestamp())
    and l.quota_total::bigint > l.history_used::bigint
      + (select count(*) from public.distribution_export_operations o
           where o.distribution_link_id = l.id and o.state = 'CONFIRMED')
      + (select count(*) from public.distribution_export_operations o
           where o.distribution_link_id = l.id and o.state = 'RESERVED'
             and o.expires_at > statement_timestamp());
$$;

-- Une réponse perdue sur la dernière unité ne ferme pas l'opération autorisée.
-- Un reçu confirmé peut être repris ; cela n'autorise aucune nouvelle opération.
create function public.resolve_distribution_resume_v1(
  p_token text, p_operation_id uuid, p_secret text, p_format text, p_descriptor_hash text
) returns jsonb language sql stable security definer
set search_path = pg_catalog, public as $$
  select jsonb_build_object('campaign_id',l.campaign_id,'client_logo_url',l.client_logo_url,'protocol_version',1)
  from public.distribution_links l
  join public.campaigns c on c.id=l.campaign_id
  join public.frames f on f.id=c.frame_id and f.owner_id=c.owner_id
  join public.distribution_export_operations o on o.distribution_link_id=l.id
  where l.token=p_token and c.status='published' and o.operation_id=p_operation_id
    and o.secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex')
    and o.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
    and o.format=p_format and o.descriptor_hash=lower(p_descriptor_hash)
    and (o.state='CONFIRMED' or (o.state='RESERVED' and o.expires_at>statement_timestamp()
      and l.status<>'REVOKED' and l.refund_closed_at is null
      and (l.expires_at is null or l.expires_at>statement_timestamp())));
$$;
revoke all on function public.resolve_distribution_resume_v1(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_distribution_resume_v1(text,uuid,text,text,text) to anon,authenticated;

create function public.get_distribution_links_v1(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.campaigns c
     where c.id = p_campaign_id and c.owner_id = auth.uid()
  ) then
    raise exception 'Campaign not found or unauthorized.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'token', l.token, 'quota_total', l.quota_total,
    'quota_used', l.history_used::bigint + s.confirmed_count,
    'status', case
      when l.status = 'REVOKED' then 'REVOKED'
      when l.refund_closed_at is not null
        or (l.expires_at is not null and l.expires_at <= statement_timestamp()) then 'EXPIRED'
      when l.history_used::bigint + s.confirmed_count + s.reserved_count >= l.quota_total
        then 'QUOTA_EXCEEDED'
      else 'ACTIVE' end,
    'expires_at', l.expires_at, 'created_at', l.created_at,
    'client_logo_url', l.client_logo_url, 'history_used', l.history_used,
    'confirmed_count', s.confirmed_count, 'reserved_count', s.reserved_count,
    'history_delta', l.history_delta, 'funding_origin', l.funding_origin
  ) order by l.created_at, l.id), '[]'::jsonb) into v_result
  from public.distribution_links l
  cross join lateral (
    select count(*) filter (where o.state = 'CONFIRMED') as confirmed_count,
      count(*) filter (where o.state = 'RESERVED'
        and o.expires_at > statement_timestamp()) as reserved_count
    from public.distribution_export_operations o where o.distribution_link_id = l.id
  ) s
  where l.campaign_id = p_campaign_id;
  return v_result;
end;
$$;

-- Keep the old view's first four columns and their exact types. New history
-- is displayed separately; old claims are never fabricated or rewritten.
create or replace view public.distribution_stats with (security_invoker = on) as
select l.id as link_id, l.campaign_id, l.quota_total,
  (l.history_used::bigint + s.confirmed_count)::integer as uses_count,
  l.history_used, s.confirmed_count, s.reserved_count, l.history_delta,
  l.funding_origin
from public.distribution_links l
cross join lateral (
  select count(*) filter (where o.state = 'CONFIRMED') as confirmed_count,
    count(*) filter (where o.state = 'RESERVED'
      and o.expires_at > statement_timestamp()) as reserved_count
  from public.distribution_export_operations o where o.distribution_link_id = l.id
) s;

create function public.create_funded_distribution_link_v1(
  p_campaign_id uuid, p_quota integer, p_reference uuid,
  p_expires_at timestamptz default null
)
returns text language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer;
  v_request public.distribution_funding_requests;
  v_campaign public.campaigns;
  v_link_id uuid := gen_random_uuid();
  v_token text;
  v_now timestamptz;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_campaign_id is null or p_reference is null
     or p_quota is null or p_quota not between 1 and 1000000 then
    raise exception 'Invalid distribution request.' using errcode = '22023';
  end if;
  select b.balance into v_balance from public.account_credit_balances b
   where b.user_id = v_uid for update;
  select * into v_request from public.distribution_funding_requests r
   where r.owner_id = v_uid and r.reference = p_reference;
  if found then
    if v_request.action <> 'create'
       or v_request.campaign_id is distinct from p_campaign_id
       or v_request.amount is distinct from p_quota
       or v_request.expires_at is distinct from p_expires_at then
      raise exception 'Reference payload mismatch.' using errcode = '22023';
    end if;
    return v_request.token;
  end if;
  if exists (select 1 from public.account_credit_ledger e
    where e.user_id = v_uid and e.kind in ('allocation', 'refund')
      and e.metadata ->> 'reference' = p_reference::text) then
    raise exception 'Reference already bound to another request.' using errcode = '22023';
  end if;
  select * into v_campaign from public.campaigns c
   where c.id = p_campaign_id for update;
  if not found or v_campaign.owner_id is distinct from v_uid
     or v_campaign.status <> 'published' or not exists (
       select 1 from public.frames f
        where f.id = v_campaign.frame_id and f.owner_id = v_uid
     ) then
    raise exception 'Published framed campaign required.' using errcode = '42501';
  end if;
  v_now := clock_timestamp();
  if p_expires_at is not null and (not isfinite(p_expires_at) or p_expires_at <= v_now) then
    raise exception 'Expiration must be in the future.' using errcode = '22023';
  end if;
  if v_balance is null or v_balance < p_quota then
    raise exception 'Solde de crédits du compte insuffisant.' using errcode = '22023';
  end if;
  -- Three random UUIDs supply more than 256 input bits; SHA-256 makes a
  -- fixed-size opaque token using built-ins, independent of extension schema.
  v_token := encode(sha256(convert_to(gen_random_uuid()::text
    || gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex');
  insert into public.distribution_links(
    id, campaign_id, token, quota_total, bought_total, expires_at, funding_origin
  ) values (v_link_id, p_campaign_id, v_token, p_quota, p_quota, p_expires_at, 'bought');
  update public.account_credit_balances
     set balance = v_balance - p_quota, updated_at = v_now where user_id = v_uid;
  insert into public.account_credit_ledger(user_id, amount, kind, balance_after, metadata)
  values (v_uid, -p_quota, 'allocation', v_balance - p_quota,
    jsonb_build_object('reference', p_reference, 'target', 'distribution_link',
      'action', 'create', 'campaign_id', p_campaign_id, 'link_id', v_link_id,
      'quota', p_quota, 'expires_at', p_expires_at));
  insert into public.distribution_funding_requests(
    owner_id, reference, action, campaign_id, link_id, token, amount, expires_at
  ) values (v_uid, p_reference, 'create', p_campaign_id, v_link_id, v_token, p_quota, p_expires_at);
  return v_token;
end;
$$;

create function public.recharge_distribution_v1(p_token text, p_amount integer, p_reference uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer;
  v_request public.distribution_funding_requests;
  v_campaign public.campaigns;
  v_link public.distribution_links;
  v_campaign_id uuid;
  v_now timestamptz;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_token is null or p_reference is null
     or p_amount is null or p_amount not between 1 and 1000000 then
    raise exception 'Invalid recharge request.' using errcode = '22023';
  end if;
  select b.balance into v_balance from public.account_credit_balances b
   where b.user_id = v_uid for update;
  select * into v_request from public.distribution_funding_requests r
   where r.owner_id = v_uid and r.reference = p_reference;
  if found then
    if v_request.action <> 'recharge' or v_request.token is distinct from p_token
       or v_request.amount is distinct from p_amount then
      raise exception 'Reference payload mismatch.' using errcode = '22023';
    end if;
    return true;
  end if;
  if exists (select 1 from public.account_credit_ledger e
    where e.user_id = v_uid and e.kind in ('allocation', 'refund')
      and e.metadata ->> 'reference' = p_reference::text) then
    raise exception 'Reference already bound to another request.' using errcode = '22023';
  end if;
  select l.campaign_id into v_campaign_id from public.distribution_links l where l.token = p_token;
  select * into v_campaign from public.campaigns c where c.id = v_campaign_id for update;
  if not found or v_campaign.owner_id is distinct from v_uid then return false; end if;
  select * into v_link from public.distribution_links l
   where l.token = p_token and l.campaign_id = v_campaign.id for update;
  if not found then return false; end if;
  v_now := clock_timestamp();
  if v_link.status = 'REVOKED' or v_link.refund_closed_at is not null
     or (v_link.expires_at is not null and v_link.expires_at <= v_now)
     or v_campaign.status <> 'published' or not exists (
       select 1 from public.frames f where f.id = v_campaign.frame_id and f.owner_id = v_uid
     ) then return false; end if;
  if v_balance is null or v_balance < p_amount then
    raise exception 'Solde de crédits du compte insuffisant.' using errcode = '22023';
  end if;
  if v_link.quota_total::bigint + p_amount > 2147483647 then
    raise exception 'Distribution capacity overflow.' using errcode = '22023';
  end if;
  update public.distribution_links
     set quota_total = quota_total + p_amount, bought_total = bought_total + p_amount,
         funding_origin = case when history_quota_total > 0 then 'mixed' else 'bought' end,
         updated_at = v_now
   where id = v_link.id;
  update public.account_credit_balances
     set balance = v_balance - p_amount, updated_at = v_now where user_id = v_uid;
  insert into public.account_credit_ledger(user_id, amount, kind, balance_after, metadata)
  values (v_uid, -p_amount, 'allocation', v_balance - p_amount,
    jsonb_build_object('reference', p_reference, 'target', 'distribution_link',
      'action', 'recharge', 'campaign_id', v_campaign.id, 'link_id', v_link.id, 'amount', p_amount));
  insert into public.distribution_funding_requests(
    owner_id, reference, action, campaign_id, link_id, token, amount
  ) values (v_uid, p_reference, 'recharge', v_campaign.id, v_link.id, p_token, p_amount);
  return true;
end;
$$;

create or replace function public.revoke_distribution_link(p_token text)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_campaign_id uuid;
  v_campaign public.campaigns;
  v_link public.distribution_links;
  v_now timestamptz;
begin
  if v_uid is null then return false; end if;
  -- A historical owner may not have a wallet row. No wallet is provisioned
  -- merely to revoke; the campaign lock still serializes all link operations.
  perform 1 from public.account_credit_balances b where b.user_id = v_uid for update;
  select l.campaign_id into v_campaign_id from public.distribution_links l where l.token = p_token;
  select * into v_campaign from public.campaigns c where c.id = v_campaign_id for update;
  if not found or v_campaign.owner_id is distinct from v_uid then return false; end if;
  select * into v_link from public.distribution_links l
   where l.token = p_token and l.campaign_id = v_campaign.id for update;
  if not found then return false; end if;
  v_now := clock_timestamp();
  update public.distribution_links set status = 'REVOKED', updated_at = v_now where id = v_link.id;
  update public.distribution_export_operations set state = 'CANCELLED'
   where distribution_link_id = v_link.id and state = 'RESERVED';
  -- Refunds are explicit and separate; historical credits never reach wallet.
  return true;
end;
$$;

create function public.refund_distribution_v1(p_token text, p_reference uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer;
  v_request public.distribution_funding_requests;
  v_campaign_id uuid;
  v_campaign public.campaigns;
  v_link public.distribution_links;
  v_confirmed bigint;
  v_refund integer;
  v_now timestamptz;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_token is null or p_reference is null then
    raise exception 'Invalid refund request.' using errcode = '22023';
  end if;
  select b.balance into v_balance from public.account_credit_balances b
   where b.user_id = v_uid for update;
  select * into v_request from public.distribution_funding_requests r
   where r.owner_id = v_uid and r.reference = p_reference;
  if found then
    if v_request.action <> 'refund' or v_request.token is distinct from p_token then
      raise exception 'Reference payload mismatch.' using errcode = '22023';
    end if;
    return true;
  end if;
  if exists (select 1 from public.account_credit_ledger e
    where e.user_id = v_uid and e.kind in ('allocation', 'refund')
      and e.metadata ->> 'reference' = p_reference::text) then
    raise exception 'Reference already bound to another request.' using errcode = '22023';
  end if;
  select l.campaign_id into v_campaign_id from public.distribution_links l where l.token = p_token;
  select * into v_campaign from public.campaigns c where c.id = v_campaign_id for update;
  if not found or v_campaign.owner_id is distinct from v_uid then return false; end if;
  select * into v_link from public.distribution_links l
   where l.token = p_token and l.campaign_id = v_campaign.id for update;
  if not found then return false; end if;
  v_now := clock_timestamp();
  if v_link.status <> 'REVOKED'
     and (v_link.expires_at is null or v_link.expires_at > v_now) then return false; end if;
  -- A new caller reference cannot refund the same closed envelope twice.
  if v_link.refund_closed_at is not null then return true; end if;
  select count(*) into v_confirmed from public.distribution_export_operations o
   where o.distribution_link_id = v_link.id and o.state = 'CONFIRMED';
  v_refund := greatest(0::bigint, v_link.bought_total::bigint - greatest(0::bigint,
    v_confirmed - greatest(0::bigint, v_link.history_quota_total::bigint - v_link.history_used)))::integer;
  if v_refund > 0 and v_balance is null then
    raise exception 'Funded distribution wallet missing.' using errcode = '23514';
  end if;
  if v_refund > 0 and v_balance::bigint + v_refund > 2147483647 then
    raise exception 'Account balance overflow.' using errcode = '22023';
  end if;
  update public.distribution_export_operations set state = 'CANCELLED'
   where distribution_link_id = v_link.id and state = 'RESERVED';
  update public.distribution_links
     set refund_closed_at = v_now, refunded_count = v_refund, updated_at = v_now
   where id = v_link.id;
  if v_refund > 0 then
    update public.account_credit_balances
       set balance = v_balance + v_refund, updated_at = v_now where user_id = v_uid;
    insert into public.account_credit_ledger(user_id, amount, kind, balance_after, metadata)
    values (v_uid, v_refund, 'refund', v_balance + v_refund,
      jsonb_build_object('reference', p_reference, 'target', 'distribution_link',
        'action', 'refund', 'campaign_id', v_campaign.id, 'link_id', v_link.id,
        'historical_first', true, 'confirmed_count', v_confirmed));
  end if;
  insert into public.distribution_funding_requests(
    owner_id, reference, action, campaign_id, link_id, token, amount
  ) values (v_uid, p_reference, 'refund', v_campaign.id, v_link.id, p_token, v_refund);
  return true;
end;
$$;

create function public.update_distribution_logo_v1(p_token text, p_url text)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_campaign_id uuid;
  v_campaign public.campaigns;
  v_link_id uuid;
begin
  if v_uid is null then return false; end if;
  if p_url is not null and (char_length(p_url) > 2048
    or p_url !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$') then
    raise exception 'A bounded HTTPS logo URL or null is required.' using errcode = '22023';
  end if;
  select l.campaign_id into v_campaign_id from public.distribution_links l where l.token = p_token;
  select * into v_campaign from public.campaigns c where c.id = v_campaign_id for update;
  if not found or v_campaign.owner_id is distinct from v_uid then return false; end if;
  select l.id into v_link_id from public.distribution_links l
   where l.token = p_token and l.campaign_id = v_campaign.id for update;
  if not found then return false; end if;
  update public.distribution_links set client_logo_url = p_url, updated_at = clock_timestamp()
   where id = v_link_id;
  return found;
end;
$$;

-- Single participant facade. SHA-256 is a PostgreSQL built-in on the target
-- PostgreSQL 15+ baseline; only hashes, not operation secrets, are persisted.
-- Accepted secrets: 32 random bytes encoded as hex or base64/base64url.
create function public.distribution_export_v1(
  p_action text, p_token text, p_operation_id uuid, p_secret text,
  p_format text, p_descriptor_hash text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_unavailable constant jsonb := '{"state":"UNAVAILABLE"}'::jsonb;
  v_campaign_id uuid;
  v_campaign public.campaigns;
  v_link public.distribution_links;
  v_operation public.distribution_export_operations;
  v_exists boolean;
  v_secret_hash text;
  v_token_hash text;
  v_descriptor_hash text;
  v_now timestamptz;
  v_confirmed bigint;
  v_reserved bigint;
begin
  if p_action is null or p_action not in ('reserve', 'status', 'confirm', 'cancel', 'renew')
    or p_token is null or char_length(p_token) not between 1 and 512
    or p_operation_id is null or p_secret is null
    or p_secret !~ '^([0-9A-Fa-f]{64}|[A-Za-z0-9_-]{43}=?|[A-Za-z0-9+/]{43}=)$'
    or p_format is null or p_format not in ('png', 'video')
    or p_descriptor_hash is null or p_descriptor_hash !~ '^[0-9A-Fa-f]{64}$' then
    return v_unavailable;
  end if;
  v_secret_hash := encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  v_token_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  v_descriptor_hash := lower(p_descriptor_hash);

  -- A read-only precheck prevents credentials belonging to another operation
  -- from modifying expiry state. The full binding is rechecked under locks.
  select * into v_operation from public.distribution_export_operations o
   where o.operation_id = p_operation_id;
  if found and (v_operation.token_hash is distinct from v_token_hash
    or v_operation.secret_hash is distinct from v_secret_hash
    or v_operation.format is distinct from p_format
    or v_operation.descriptor_hash is distinct from v_descriptor_hash) then
    return v_unavailable;
  end if;
  select l.campaign_id into v_campaign_id from public.distribution_links l where l.token = p_token;
  select * into v_campaign from public.campaigns c where c.id = v_campaign_id for update;
  if found then
    select * into v_link from public.distribution_links l
     where l.token = p_token and l.campaign_id = v_campaign.id for update;
  end if;

  -- The final operation-level advisory lock also serializes not-yet-existing
  -- IDs across different links, so conflict checks happen before any write.
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 22));
  select * into v_operation from public.distribution_export_operations o
   where o.operation_id = p_operation_id for update;
  v_exists := found;
  if v_exists then
    if v_operation.token_hash is distinct from v_token_hash
      or v_operation.secret_hash is distinct from v_secret_hash
      or v_operation.format is distinct from p_format
      or v_operation.descriptor_hash is distinct from v_descriptor_hash
      or (v_link.id is not null and v_operation.distribution_link_id is distinct from v_link.id) then
      return v_unavailable;
    end if;
    -- Identical terminal receipt, including after campaign/link deletion,
    -- revocation or expiry, and even for a late cancel/renew/reserve request.
    if v_operation.state = 'CONFIRMED' then
      return jsonb_build_object('state', 'CONFIRMED',
        'operation_id', v_operation.operation_id, 'receipt', v_operation.receipt);
    end if;
  elsif p_action <> 'reserve' then
    return v_unavailable;
  end if;
  if v_link.id is null then return v_unavailable; end if;
  v_now := clock_timestamp();

  -- Bounded lazy cleanup. Reads and capacity calculations always exclude
  -- expired reservations even when more than 256 old rows await cleanup.
  with due as (
    select o.operation_id from public.distribution_export_operations o
     where o.distribution_link_id = v_link.id and o.state = 'RESERVED'
       and o.expires_at <= v_now
     order by o.expires_at, o.operation_id limit 256 for update skip locked
  )
  update public.distribution_export_operations o set state = 'EXPIRED'
   from due where o.operation_id = due.operation_id;
  if v_exists and v_operation.state = 'RESERVED' and v_operation.expires_at <= v_now then
    update public.distribution_export_operations set state = 'EXPIRED'
     where operation_id = p_operation_id and state = 'RESERVED';
    v_operation.state := 'EXPIRED';
  end if;

  if v_campaign.status <> 'published' or v_link.status = 'REVOKED'
    or v_link.refund_closed_at is not null
    or (v_link.expires_at is not null and v_link.expires_at <= v_now)
    or not exists (select 1 from public.frames f
      where f.id = v_campaign.frame_id and f.owner_id = v_campaign.owner_id) then
    if v_exists and v_operation.state = 'RESERVED' then
      update public.distribution_export_operations set state = 'CANCELLED'
       where operation_id = p_operation_id and state = 'RESERVED';
    end if;
    -- Do not raise: the cleanup and refusal transition must commit together.
    return v_unavailable;
  end if;

  if v_exists then
    if v_operation.state in ('CANCELLED', 'EXPIRED') then
      return jsonb_build_object('state', v_operation.state, 'operation_id', p_operation_id);
    end if;
    if p_action = 'cancel' then
      update public.distribution_export_operations set state = 'CANCELLED'
       where operation_id = p_operation_id;
      return jsonb_build_object('state', 'CANCELLED', 'operation_id', p_operation_id);
    elsif p_action = 'confirm' then
      -- Capacity may now be zero: this operation already owns its last unit.
      update public.distribution_export_operations
         set state = 'CONFIRMED', receipt = gen_random_uuid(), confirmed_at = v_now
       where operation_id = p_operation_id returning * into v_operation;
      insert into public.distribution_usages(
        distribution_link_id, campaign_id, operation_id, export_type, format, created_at
      ) values (v_link.id, v_campaign.id, p_operation_id,
        case when p_format = 'png' then 'image' else 'video' end, p_format, v_now);
      select count(*) into v_confirmed from public.distribution_export_operations o
       where o.distribution_link_id = v_link.id and o.state = 'CONFIRMED';
      update public.distribution_links
         set quota_used = (history_used::bigint + v_confirmed)::integer, updated_at = v_now
       where id = v_link.id;
      return jsonb_build_object('state', 'CONFIRMED',
        'operation_id', p_operation_id, 'receipt', v_operation.receipt);
    elsif p_action = 'renew' then
      update public.distribution_export_operations
         set expires_at = least(v_now + interval '5 minutes', created_at + interval '10 minutes')
       where operation_id = p_operation_id returning * into v_operation;
    end if;
    -- status/reserve replay preserves the original expiry without extension.
    return jsonb_build_object('state', 'RESERVED', 'operation_id', p_operation_id,
      'expires_at', v_operation.expires_at);
  end if;

  select count(*) filter (where o.state = 'CONFIRMED'),
    count(*) filter (where o.state = 'RESERVED' and o.expires_at > v_now)
    into v_confirmed, v_reserved from public.distribution_export_operations o
   where o.distribution_link_id = v_link.id;
  if v_link.history_used::bigint + v_confirmed + v_reserved >= v_link.quota_total then
    return v_unavailable;
  end if;
  insert into public.distribution_export_operations(
    operation_id, distribution_link_id, owner_id, token_hash, secret_hash,
    format, descriptor_hash, created_at, expires_at
  ) values (p_operation_id, v_link.id, v_campaign.owner_id, v_token_hash, v_secret_hash,
    p_format, v_descriptor_hash, v_now, v_now + interval '5 minutes')
  returning * into v_operation;
  return jsonb_build_object('state', 'RESERVED', 'operation_id', p_operation_id,
    'expires_at', v_operation.expires_at);
end;
$$;

-- Exact legacy service-role signature and result type retained. Replay is
-- checked before campaign existence and wallet sufficiency, and is bound to
-- user, campaign, amount and target (old rows had no explicit target field).
create or replace function public.allocate_account_credits(
  p_user_id uuid, p_campaign_id uuid, p_amount integer, p_reference uuid
)
returns public.account_credit_balances language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_balance public.account_credit_balances;
  v_existing public.account_credit_ledger;
  v_campaign public.campaigns;
begin
  if p_user_id is null or p_campaign_id is null or p_reference is null
    or p_amount is null or p_amount <= 0 then
    raise exception 'Invalid allocation request.' using errcode = '22023';
  end if;
  select * into v_balance from public.account_credit_balances b
   where b.user_id = p_user_id for update;
  select * into v_existing from public.account_credit_ledger e
   where e.user_id = p_user_id and e.kind in ('allocation', 'refund')
     and e.metadata ->> 'reference' = p_reference::text;
  if found then
    if v_existing.kind <> 'allocation' or v_existing.amount::bigint <> -p_amount::bigint
      or v_existing.metadata ->> 'campaign_id' is distinct from p_campaign_id::text
      or coalesce(v_existing.metadata ->> 'target', 'campaign') <> 'campaign' then
      raise exception 'Reference payload mismatch.' using errcode = '22023';
    end if;
    return v_balance;
  end if;
  if exists (select 1 from public.distribution_funding_requests r
    where r.owner_id = p_user_id and r.reference = p_reference) then
    raise exception 'Reference already bound to a distribution request.' using errcode = '22023';
  end if;
  select * into v_campaign from public.campaigns c where c.id = p_campaign_id for update;
  if not found or v_campaign.owner_id is distinct from p_user_id then
    raise exception 'Campaign not found or unauthorized.' using errcode = '42501';
  end if;
  if v_balance.user_id is null or v_balance.balance < p_amount then
    raise exception 'Solde de crédits du compte insuffisant.' using errcode = '22023';
  end if;
  if v_campaign.participants_granted::bigint + p_amount > 2147483647 then
    raise exception 'Campaign quota overflow.' using errcode = '22023';
  end if;
  update public.campaigns set participants_granted = participants_granted + p_amount
   where id = p_campaign_id;
  update public.account_credit_balances
     set balance = balance - p_amount, updated_at = clock_timestamp()
   where user_id = p_user_id returning * into v_balance;
  insert into public.account_credit_ledger(user_id, amount, kind, balance_after, metadata)
  values (p_user_id, -p_amount, 'allocation', v_balance.balance,
    jsonb_build_object('campaign_id', p_campaign_id, 'reference', p_reference, 'target', 'campaign'));
  return v_balance;
end;
$$;

-- Le prédicat ON CONFLICT de 0021 ne correspondait pas à son index partiel.
-- Vérifier le journal avant le crédit protège aussi une reprise après anomalie.
create or replace function public.credit_account_credits(
  p_deposit_id uuid, p_provider text default null, p_phone text default null
) returns public.payments language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_payment public.payments;
  v_increment integer;
  v_balance integer;
begin
  select * into v_payment from public.payments where deposit_id = p_deposit_id for update;
  if not found then raise exception 'Paiement introuvable.'; end if;
  if v_payment.status = 'completed' then return v_payment; end if;
  if v_payment.purchase_type <> 'account_credits' then raise exception 'Ce paiement ne concerne pas les crédits du compte.'; end if;
  v_increment := (v_payment.metadata ->> 'credit_amount')::integer;
  if v_increment is null or v_increment <= 0 then raise exception 'Quantité de crédits invalide.'; end if;
  insert into public.account_credit_balances(user_id, balance) values(v_payment.user_id,0) on conflict(user_id) do nothing;
  select balance into v_balance from public.account_credit_balances where user_id=v_payment.user_id for update;
  if not exists(select 1 from public.account_credit_ledger where payment_id=v_payment.id and kind='purchase') then
    if v_balance::bigint + v_increment > 2147483647 then raise exception 'Le solde dépasse la capacité autorisée.'; end if;
    v_balance := v_balance + v_increment;
    insert into public.account_credit_ledger(user_id,payment_id,amount,kind,balance_after,metadata)
      values(v_payment.user_id,v_payment.id,v_increment,'purchase',v_balance,jsonb_build_object('deposit_id',p_deposit_id));
    update public.account_credit_balances set balance=v_balance,updated_at=clock_timestamp() where user_id=v_payment.user_id;
  end if;
  update public.payments set status='completed',provider=coalesce(p_provider,provider),phone_number=coalesce(p_phone,phone_number),updated_at=clock_timestamp()
    where id=v_payment.id returning * into v_payment;
  return v_payment;
end;
$$;
revoke all on function public.credit_account_credits(uuid,text,text) from public,anon,authenticated;
grant execute on function public.credit_account_credits(uuid,text,text) to service_role;

-- Completed is terminal even if a later service-role callback writes failure.
-- Return OLD, not an exception: webhook retries remain harmless.
create function public.payment_completed_terminal_v1()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if old.status = 'completed' and new.status is distinct from old.status then
    return old;
  end if;
  return new;
end;
$$;
create trigger payment_completed_terminal_v1 before update on public.payments
  for each row execute function public.payment_completed_terminal_v1();

-- Remove both table-level and any accumulated column-level mutation grants.
-- Signup profiles are created by handle_new_user: id/email have no defaults,
-- so a browser profile INSERT cannot legitimately use only editable columns.
revoke insert, update on public.users, public.campaigns from public, anon, authenticated;
revoke truncate, trigger, references on public.users, public.campaigns from public, anon, authenticated;
revoke all on public.distribution_links, public.distribution_usages,
  public.distribution_export_operations, public.distribution_funding_requests,
  public.distribution_stats from public, anon, authenticated;
revoke insert, update, delete, truncate, trigger, references
  on public.account_credit_balances, public.account_credit_ledger, public.payments
  from public, anon, authenticated;

do $$
declare
  v_table text;
  v_columns text;
begin
  foreach v_table in array array['users', 'campaigns', 'distribution_links',
    'distribution_usages', 'distribution_export_operations', 'distribution_funding_requests',
    'account_credit_balances', 'account_credit_ledger', 'payments']
  loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_columns
      from pg_attribute a where a.attrelid = format('public.%I', v_table)::regclass
        and a.attnum > 0 and not a.attisdropped;
    execute format('revoke insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',
      v_columns, v_columns, v_columns, v_table);
  end loop;
end;
$$;

grant update (username, org_name, logo_url, onboarded_at) on public.users to authenticated;
grant insert (owner_id, name, slug, ratio, kind, status, frame_id, share_text, share_hashtags)
  on public.campaigns to authenticated;
grant update (name, slug, ratio, kind, status, frame_id, share_text, share_hashtags)
  on public.campaigns to authenticated;
-- Existing own-row INSERT/UPDATE/DELETE policies and deletion grants survive.
-- Campaign id/created_at/quotas use existing defaults: random UUID, now, 0/10.
grant select on public.distribution_links, public.distribution_usages,
  public.distribution_export_operations, public.distribution_funding_requests,
  public.distribution_stats to authenticated;
grant all on public.distribution_export_operations, public.distribution_funding_requests to service_role;

-- Every function defined here explicitly loses default PUBLIC execution.
-- Only the two read/compatibility endpoints and the single export facade
-- remain executable by participants. Internal trigger functions have no RPC.
revoke all on function public.distribution_link_invariants_v1(),
  public.payment_completed_terminal_v1(),
  public.create_distribution_link(uuid, integer, timestamptz),
  public.claim_distribution(text), public.resolve_distribution(text),
  public.get_distribution_links_v1(uuid),
  public.create_funded_distribution_link_v1(uuid, integer, uuid, timestamptz),
  public.recharge_distribution_v1(text, integer, uuid),
  public.refund_distribution_v1(text, uuid), public.revoke_distribution_link(text),
  public.update_distribution_logo_v1(text, text),
  public.distribution_export_v1(text, text, uuid, text, text, text),
  public.allocate_account_credits(uuid, uuid, integer, uuid)
  from public, anon, authenticated;

grant execute on function public.resolve_distribution(text), public.claim_distribution(text),
  public.distribution_export_v1(text, text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.create_distribution_link(uuid, integer, timestamptz),
  public.get_distribution_links_v1(uuid),
  public.create_funded_distribution_link_v1(uuid, integer, uuid, timestamptz),
  public.recharge_distribution_v1(text, integer, uuid),
  public.refund_distribution_v1(text, uuid), public.revoke_distribution_link(text),
  public.update_distribution_logo_v1(text, text) to authenticated;
grant execute on function public.allocate_account_credits(uuid, uuid, integer, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
