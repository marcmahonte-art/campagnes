-- =====================================================================
--  Campagnes — Migration 0009 : activation des liens privés
--  Cible : Supabase / Postgres 15+
--
--  La migration 0008 a posé les tables, mais rien ne pouvait fonctionner :
--    * `create_distribution_link` n'existait dans aucune migration, alors que
--      l'interface l'appelait déjà ;
--    * `distribution_links` et `distribution_usages` n'avaient **aucune RLS**,
--      donc leurs jetons étaient lisibles par n'importe quel visiteur ;
--    * aucun chemin ne permettait de résoudre un jeton vers sa campagne sans
--      consommer une unité de quota.
--
--  Cette migration apporte les trois pièces manquantes.
--
--  Elle n'est PAS appliquée automatiquement. Le code applicatif (contrat
--  `Backend`, `lib/distribution-service.ts`, route `/d/[token]`) compile déjà,
--  mais l'affordance côté créateur reste masquée tant que cette migration n'est
--  pas passée : un bouton qui ne peut pas aboutir n'a rien à faire à l'écran.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Création d'un jeton (côté créateur)
-- ---------------------------------------------------------------------
create or replace function public.create_distribution_link(
  p_campaign_id uuid,
  p_quota       integer,
  p_expires_at  timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  if p_quota is null or p_quota <= 0 then
    raise exception 'Le quota doit être strictement positif.' using errcode = '22023';
  end if;

  -- La propriété est vérifiée ici, pas dans le navigateur : cette fonction est
  -- le seul point d'écriture sur `distribution_links`.
  if not exists (
    select 1 from public.campaigns
     where id = p_campaign_id and owner_id = auth.uid()
  ) then
    raise exception 'Campagne introuvable.' using errcode = '42501';
  end if;

  -- 256 bits d'entropie, sans dépendre de l'extension pgcrypto.
  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');

  insert into public.distribution_links (campaign_id, token, quota_total, expires_at)
  values (p_campaign_id, v_token, p_quota, p_expires_at);

  return v_token;
end;
$$;

comment on function public.create_distribution_link(uuid, integer, timestamptz) is
  'Crée un jeton de distribution privé pour une campagne dont l''appelant est propriétaire.';

-- ---------------------------------------------------------------------
-- 2. Résolution d'un jeton (côté participant)
-- ---------------------------------------------------------------------
create or replace function public.resolve_distribution(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
begin
  select id, campaign_id, expires_at, status, quota_used, quota_total
    into v_link
    from public.distribution_links
   where token = p_token;

  if not found then
    return null;
  end if;

  if v_link.status <> 'ACTIVE' then
    return null;
  end if;

  if v_link.expires_at is not null and now() > v_link.expires_at then
    update public.distribution_links
       set status = 'EXPIRED', updated_at = now()
     where id = v_link.id;
    return null;
  end if;

  if v_link.quota_used >= v_link.quota_total then
    update public.distribution_links
       set status = 'QUOTA_EXCEEDED', updated_at = now()
     where id = v_link.id;
    return null;
  end if;

  -- Aucun décompte ici : ouvrir la page ne consomme rien. Seule
  -- `claim_distribution` (0008) réserve une unité, au moment du téléchargement.
  return v_link.campaign_id;
end;
$$;

comment on function public.resolve_distribution(text) is
  'Résout un jeton vers sa campagne sans consommer de quota. Renvoie null si le jeton est inconnu, expiré, révoqué ou épuisé.';

-- ---------------------------------------------------------------------
-- 3. RLS — sans elle, les jetons étaient lisibles par tout le monde
-- ---------------------------------------------------------------------
alter table public.distribution_links  enable row level security;
alter table public.distribution_usages enable row level security;

-- Le créateur ne voit que les liens rattachés à ses propres campagnes.
-- Aucune policy n'est créée pour `anon` : il ne peut donc rien lire ni écrire
-- directement. Il passe obligatoirement par `resolve_distribution`.
drop policy if exists distribution_links_owner on public.distribution_links;
create policy distribution_links_owner on public.distribution_links
  for all
  to authenticated
  using (
    exists (
      select 1 from public.campaigns c
       where c.id = distribution_links.campaign_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
       where c.id = distribution_links.campaign_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists distribution_usages_owner on public.distribution_usages;
create policy distribution_usages_owner on public.distribution_usages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.campaigns c
       where c.id = distribution_usages.campaign_id and c.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 4. Droits d'exécution
-- ---------------------------------------------------------------------
revoke all on function public.create_distribution_link(uuid, integer, timestamptz) from public;
grant execute on function public.create_distribution_link(uuid, integer, timestamptz) to authenticated;

revoke all on function public.resolve_distribution(text) from public;
grant execute on function public.resolve_distribution(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
--  Reste à faire pour que le parcours privé soit complet
--  -------------------------------------------------------------------
--  * `distribution_usages` n'est toujours écrite par personne : la fonction
--    `claim_distribution` (0008) incrémente `quota_used` mais n'enregistre
--    aucune ligne d'usage. Il lui manque `export_type`, `resolution` et
--    `format`, que l'appel actuel ne transmet pas.
--  * Le participant passe encore par `claimParticipation(campaign_id)`, donc
--    par le quota **de la campagne** (migration 0007), et non par celui du
--    lien privé. Les deux compteurs restent donc indépendants : c'est
--    volontaire, ils ne mesurent pas la même chose, mais le parcours privé
--    devra appeler `claim_distribution` pour consommer le bon.
--  * `client_logo_url` (0008) n'est utilisée nulle part.
-- =====================================================================
