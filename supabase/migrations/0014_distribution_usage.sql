-- =====================================================================
--  Campagnes — Migration 0014 : consommation réelle des liens privés
--  Cible : Supabase / Postgres 15+
--
--  La migration 0008 a posé les tables, la 0009 les fonctions. Pourtant aucun
--  flux réel ne passait par là : `claim_distribution` n'était appelée par
--  personne, `distribution_usages` restait vide, et le quota d'un lien privé
--  ne pouvait donc jamais être opposé à qui que ce soit.
--
--  Cette migration câble le côté base :
--
--    1. `distribution_usages` accepte une ligne MINIMALE — le projet n'a aucun
--       analytics et un seul cookie, la trace d'usage ne doit rien porter de
--       personnel : ni IP, ni empreinte, ni identifiant de participant.
--    2. `claim_distribution` réserve une unité ET écrit sa trace dans le même
--       geste. Une transaction unique rend impossible un quota décrémenté
--       sans trace, ou l'inverse.
--    3. La fonction revérifie `status = 'published'` : un lien privé ne doit
--       pas ouvrir un brouillon, exactement comme `getPublicCampaign` le fait
--       pour un slug.
--    4. `distribution_stats` expose un COMPTEUR CALCULÉ (`count(*)`), jamais
--       une colonne maintenue à la main — même règle que `campaign_stats`
--       pour les likes : une colonne dérive, un compte ne ment pas.
--
--  SÉCURITÉ — réponse fermée par défaut
--    Un jeton est un secret. Un jeton inconnu, révoqué, expiré, épuisé ou
--    pointant vers un brouillon renvoie la MÊME forme de réponse que les
--    autres : la fonction ne confirme jamais qu'un jeton existe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Une ligne d'usage minimale, sans données personnelles
-- ---------------------------------------------------------------------
--
-- `export_type`, `resolution` et `format` étaient `not null` : la fonction ne
-- pouvait donc pas écrire la ligne minimale attendue, ce qui est sans doute
-- une des raisons pour lesquelles personne ne l'a jamais écrite. On les rend
-- facultatifs — la contrainte d'énumération continue de s'appliquer dès qu'une
-- valeur est fournie.
alter table public.distribution_usages
  alter column export_type drop not null,
  alter column resolution  drop not null,
  alter column format      drop not null;

comment on table public.distribution_usages is
  'Une ligne = un usage réel d''un lien privé. VOLONTAIREMENT SANS DONNÉE PERSONNELLE : pas d''IP, pas d''empreinte, pas d''identifiant de participant. Le projet n''a aucun analytics et un seul cookie ; tracer le participant par cette porte le réintroduirait.';

-- Un usage se compte par lien : l'index sert la vue calculée.
create index if not exists distribution_usages_link_idx
  on public.distribution_usages (distribution_link_id);

-- ---------------------------------------------------------------------
-- 2. Réservation ET trace, dans la même transaction
-- ---------------------------------------------------------------------
--
-- L'ancienne version incrémentait `quota_used` sans jamais écrire
-- `distribution_usages` : le compteur et la trace pouvaient donc diverger.
drop function if exists public.claim_distribution(text);

create function public.claim_distribution(p_token text)
returns table (
  granted     boolean,
  used        integer,
  quota       integer,
  campaign_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
/*
 * `campaign_id` est à la fois un paramètre OUT de cette fonction et une colonne
 * de `distribution_usages` : sans cette directive, l'INSERT ci-dessous échoue
 * sur « column reference "campaign_id" is ambiguous » (42702). On tranche en
 * faveur de la COLONNE — toutes les valeurs renvoyées sont qualifiées
 * (`v_link.campaign_id`), donc aucune référence de variable n'est nue.
 */
#variable_conflict use_column
declare
  v_link     record;
  v_published boolean;
  v_new_used integer;
begin
  -- Verrouillage de la ligne : deux participants simultanés ne peuvent pas
  -- prendre deux fois la dernière place.
  select id, campaign_id, expires_at, status, quota_used, quota_total
    into v_link
    from public.distribution_links
   where token = p_token
     for update;

  /*
   * REFUS UNIFORME.
   *
   * Tous les refus renvoient la MÊME ligne : `false, 0, 0, null`. Renvoyer le
   * vrai couple (quota_used, quota_total) — comme le fait `claim_participation`
   * pour une campagne — distinguerait un jeton qui existe d'un jeton inventé :
   * « 0/0 » contre « 2/2 ». Or un jeton est un secret, on ne confirme jamais son
   * existence, et la consommation d'un lien privé est une donnée d'affaires
   * entre le créateur et son client, pas une information publique.
   *
   * La campagne, elle, est publique : son compteur peut être affiché. Le lien
   * privé ne l'est pas : le sien ne sort jamais d'un refus.
   */
  if not found then
    return query select false, 0, 0, null::uuid;
    return;
  end if;

  -- Révoqué : même ligne, sans rien révéler de plus.
  if v_link.status = 'REVOKED' then
    return query select false, 0, 0, null::uuid;
    return;
  end if;

  -- Échéance dépassée : on bascule le statut, puis refus uniforme.
  if v_link.expires_at is not null and now() > v_link.expires_at then
    update public.distribution_links
       set status = 'EXPIRED', updated_at = now()
     where id = v_link.id;
    return query select false, 0, 0, null::uuid;
    return;
  end if;

  -- Un lien privé ne distribue pas un brouillon : même règle que
  -- `getPublicCampaign`, un brouillon reste indiscernable d'un lien inexistant.
  select (c.status = 'published') into v_published
    from public.campaigns c
   where c.id = v_link.campaign_id;

  if v_published is not true then
    return query select false, 0, 0, null::uuid;
    return;
  end if;

  -- Quota épuisé.
  if v_link.quota_used >= v_link.quota_total then
    update public.distribution_links
       set status = 'QUOTA_EXCEEDED', updated_at = now()
     where id = v_link.id;
    return query select false, 0, 0, null::uuid;
    return;
  end if;

  -- Réservation...
  update public.distribution_links
     set quota_used = quota_used + 1,
         updated_at = now()
   where id = v_link.id
  returning quota_used into v_new_used;

  -- ...et trace, dans le même bloc : une transaction qui réussit écrit les
  -- deux, une transaction qui échoue n'écrit ni l'un ni l'autre.
  insert into public.distribution_usages (distribution_link_id, campaign_id, created_at)
  values (v_link.id, v_link.campaign_id, now());

  return query select true, v_new_used, v_link.quota_total, v_link.campaign_id;
end;
$$;

comment on function public.claim_distribution(text) is
  'Réserve une unité de quota sur un lien privé ET écrit sa trace d''usage, dans la même transaction. Refuse (granted=false) de façon INDISCERNABLE pour un jeton inconnu, révoqué, expiré, épuisé ou rattaché à une campagne non publiée.';

-- ---------------------------------------------------------------------
-- 3. Compteur calculé, pas colonne maintenue à la main
-- ---------------------------------------------------------------------
--
-- `security_invoker` : ce sont les policies de `distribution_links` et
-- `distribution_usages` qui décident ce qui sort. Le créateur voit ses liens,
-- personne d'autre ne voit quoi que ce soit.
drop view if exists public.distribution_stats;
create view public.distribution_stats
with (security_invoker = on)
as
select
  l.id                          as link_id,
  l.campaign_id                 as campaign_id,
  l.quota_total                 as quota_total,
  -- Le compte affiché est un COUNT, jamais `quota_used` : les deux doivent
  -- concorder, et si jamais ils divergent, c'est la trace qui fait foi —
  -- c'est elle qui matérialise les livrables réellement produits.
  coalesce(u.uses, 0)::integer  as uses_count
from public.distribution_links l
left join lateral (
  select count(*) as uses
    from public.distribution_usages du
   where du.distribution_link_id = l.id
) u on true;

comment on view public.distribution_stats is
  'Usages d''un lien privé : compteur CALCULÉ depuis distribution_usages, jamais une colonne incrémentée à la main. Une colonne dérive, un count(*) ne ment pas.';

grant select on public.distribution_stats to authenticated;

-- ---------------------------------------------------------------------
-- 4. Droits d'exécution
-- ---------------------------------------------------------------------
revoke all on function public.claim_distribution(text) from public;
grant execute on function public.claim_distribution(text) to anon, authenticated;

notify pgrst, 'reload schema';
