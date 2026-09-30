-- =====================================================================
--  Campagnes — Migration 0005 : quota de participants par campagne
--  Cible : Supabase / Postgres 15+
--
--  Objet :
--    Chaque campagne ouvre avec 10 téléchargements offerts. Au-delà, le lien se
--    bloque et le créateur demande une extension.
--
--    Les extensions reprennent les paliers de la grille tarifaire
--    (`distribution_offers`) : 100 / 500 / 1 000 / 5 000 téléchargements pour
--    2 500 / 5 000 / 7 500 / 20 000 FCFA. Au-delà de 10 000 téléchargements
--    cumulée, la campagne relève du sur devis : c'est le cas le plus fréquent
--    et il n'a pas de prix affichable.
--
--  Ce qui est compté, et pourquoi :
--    Le **téléchargement** du visuel, et rien d'autre. Un partage est
--    impossible à mesurer — le participant peut copier l lien à la main sans
--    que personne ne le sache. Le téléchargement est un engagement réel, et
--    c'est le seul instant où le participant fait une action que la plateforme
--    peut observer.
--
--  Ce que ce comptage ne prétend PAS être :
--    Une protection. La photo du participant n'est jamais envoyée : tout le
--    rendu se fait dans son navigateur. Une personne avertie peut écrire en
--    base sans passer par l'interface. C'est un frein commercial, pas un
--    cadenas. Le projet ne prétend donc jamais le contraire.
--
--  À exécuter après 0006_signup_username.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les compteurs
--    `participants_used`   téléchargements consommés
--    `participants_granted` volume autorisé (10 par défaut, 110 après une
--    extension de 100). On ne stocke pas une devise séparée : le quota est la
--    seule notion utile, et `granted - used` est le solde.
-- ---------------------------------------------------------------------
alter table public.campaigns
  add column if not exists participants_used    integer not null default 0,
  add column if not exists participants_granted integer not null default 10;

alter table public.campaigns
  drop constraint if exists campaigns_participants_used_positive,
  add constraint campaigns_participants_used_positive
    check (participants_used >= 0);

alter table public.campaigns
  drop constraint if exists campaigns_participants_grant_valid,
  add constraint campaigns_participants_grant_valid
    check (participants_granted >= 10 and participants_granted >= participants_used);

comment on column public.campaigns.participants_used is
  'Téléchargements consommés par les participants. Compté au clic sur « Télécharger », jamais à l''ouverture du lien.';

comment on column public.campaigns.participants_granted is
  'Téléchargements autorisés. 10 à la création, puis +100 / 500 / 1 000 / 5 000 par extension payante (2 500 / 5 000 / 7 500 / 20 000 FCFA).';

-- ---------------------------------------------------------------------
-- 2. La fonction de réservation
--    `atomic` : le verrou de ligne est pris avant le test, donc deux
--    participants qui téléchargent au même instant ne peuvent pas consommer
--    deux fois la dernière place. C'est le seul point du système où
--    l'atomicité compte vraiment.
--
--    Elle ne lève pas d'exception quand le quota est atteint : elle renvoie
--    `granted = false`. Une exception ferait échouer l'appel PostgREST, et le
--    client participant ne saurait pas distinguer « quota atteint » d'une
--    panne réseau — il n'afficherait qu'un message d'erreur.
--
--    `security definer` : le participant n'a aucun droit d'écriture sur
--    `campaigns`. Sans cela, la fonction serait refusée par la RLS. Le
--    `search_path` est figé pour qu'aucun objet ne puisse être résolu
--    ailleurs.
-- ---------------------------------------------------------------------
create or replace function public.claim_participation(p_campaign_id uuid)
returns table (
  granted          boolean,
  used             integer,
  quota            integer,
  campaign_name    text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_usage integer;
  row_quota integer;
  row_name  text;
begin
  -- Verrou de ligne : deux réservations simultanées se serialisent ici.
  select c.participants_used, c.participants_granted, c.name
    into row_usage, row_quota, row_name
    from public.campaigns c
   where c.id = p_campaign_id
     and c.status = 'published'
     and c.frame_id is not null
     for update;

  -- Campagne absente, non publiée, ou sans cadre : rien à réserver.
  if not found then
    return query select false, 0, 0, ''::text;
    return;
  end if;

  if row_usage < row_quota then
    update public.campaigns
       set participants_used = participants_used + 1
     where id = p_campaign_id;

    return query select true, row_usage + 1, row_quota, row_name;
    return;
  end if;

  -- Quota atteint : on renvoie l'état courant, sans incrémenter.
  return query select false, row_usage, row_quota, row_name;
end;
$$;

comment on function public.claim_participation(uuid) is
  'Réserve un téléchargement pour un participant. Renvoie granted=false sans lever d''exception quand le quota est atteint, pour que le client distingue la limite d''une panne.';

-- ---------------------------------------------------------------------
-- 3. Droits
--    La fonction est appelée par un visiteur **anonyme** : c''est tout le
--    principe du parcours participant, aucun compte, aucune inscription.
--    Seule cette fonction écrit, et elle n'incrémente que d'une unité.
-- ---------------------------------------------------------------------
revoke all on function public.claim_participation(uuid) from public;
grant execute on function public.claim_participation(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Lecture publique du quota
--    L'écran de blocage doit connaître l'état du quota sans être le
--    propriétaire. On expose donc une vue en lecture seule, sans le nom de la
--    campagne ni le slug : le participant n'a pas besoin d'en savoir plus.
-- ---------------------------------------------------------------------
drop view if exists public.campaign_quota;
create view public.campaign_quota
with (security_invoker = on)
as
  select id,
         participants_used,
         participants_granted,
         (participants_used < participants_granted) as open
    from public.campaigns
   where status = 'published';

revoke all on public.campaign_quota from anon, authenticated;
grant select on public.campaign_quota to anon, authenticated;

comment on view public.campaign_quota is
  'Quota de téléchargements d''une campagne publiée, en lecture seule pour tous. N''expose ni le nom, ni le slug, ni le propriétaire.';

-- ---------------------------------------------------------------------
-- 5. Recharger le cache de schéma de PostgREST
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
