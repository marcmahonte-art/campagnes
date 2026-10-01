-- =====================================================================
--  Campagnes — Migration 0008 : distribution links (private links)
--  Cible : Supabase / Postgres 15+
--
--  Objectif : permettre la création de liens privés avec quota, expiration et logo client.
--  Chaque lien pointe vers une campagne existante (campaigns.id) via un token sécurisé.
-- =====================================================================

-- Table des liens de distribution privés
create table if not exists public.distribution_links (
  id               uuid    primary key default gen_random_uuid(),
  campaign_id      uuid    not null references public.campaigns(id) on delete cascade,
  token            text    not null unique,
  quota_total      integer not null check (quota_total > 0),
  quota_used       integer not null default 0 check (quota_used >= 0),
  expires_at       timestamptz,
  status           text    not null default 'ACTIVE' check (status in ('ACTIVE','EXPIRED','QUOTA_EXCEEDED','REVOKED')),
  client_logo_url  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Indexes utiles
create index if not exists distribution_links_campaign_id_idx on public.distribution_links(campaign_id);
create index if not exists distribution_links_expires_at_idx on public.distribution_links(expires_at);
create index if not exists distribution_links_status_idx on public.distribution_links(status);

-- Table des usages (exports réussis) – chaque ligne représente un export HD validé.
create table if not exists public.distribution_usages (
  id                 uuid primary key default gen_random_uuid(),
  distribution_link_id uuid not null references public.distribution_links(id) on delete cascade,
  campaign_id        uuid not null references public.campaigns(id) on delete cascade,
  created_at         timestamptz not null default now(),
  export_type        text not null check (export_type in ('image','video')),
  resolution         text not null,
  format             text not null,
  metadata           jsonb
);

-- Function to claim a usage atomically (increment quota_used if possible)
create or replace function public.claim_distribution(p_token text)
returns table (
  granted boolean,
  used    integer,
  quota   integer,
  campaign_id uuid
) language plpgsql security definer set search_path = public as $$
declare
  v_link record;
begin
  -- lock the row for the token
  select * into v_link
    from public.distribution_links
    where token = p_token
    for update;

  if not found then
    return query select false, 0, 0, null::uuid;
    return;
  end if;

  -- check expiration
  if v_link.expires_at is not null and now() > v_link.expires_at then
    update public.distribution_links set status = 'EXPIRED', updated_at = now() where id = v_link.id;
    return query select false, v_link.quota_used, v_link.quota_total, v_link.campaign_id;
  end if;

  -- check revocation
  if v_link.status = 'REVOKED' then
    return query select false, v_link.quota_used, v_link.quota_total, v_link.campaign_id;
  end if;

  -- check quota
  if v_link.quota_used >= v_link.quota_total then
    update public.distribution_links set status = 'QUOTA_EXCEEDED', updated_at = now() where id = v_link.id;
    return query select false, v_link.quota_used, v_link.quota_total, v_link.campaign_id;
  end if;

  -- all good: reserve one usage
  update public.distribution_links
    set quota_used = quota_used + 1,
        updated_at = now()
    where id = v_link.id;

  return query select true, v_link.quota_used + 1, v_link.quota_total, v_link.campaign_id;
end;
$$;

comment on function public.claim_distribution(text) is
  'Reserve one export for a private distribution link. Returns granted=false when expired, revoked, or quota exhausted.';

-- Grant execute rights to anonymous and authenticated users (public participants)
revoke all on function public.claim_distribution(text) from public;
grant execute on function public.claim_distribution(text) to anon, authenticated;

-- Notification for PostgREST schema reload
notify pgrst, 'reload schema';
