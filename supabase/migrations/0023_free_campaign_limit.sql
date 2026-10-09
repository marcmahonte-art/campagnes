-- 0023_free_campaign_limit.sql
--
-- Limite de la formule Gratuit : 1 campagne par compte.
--
-- Sans cette limite, il suffirait de créer une campagne neuve pour repartir
-- avec un quota de participations offert (grille tarifaire : « le quota est
-- par compte et non par campagne »). La règle est donc appliquée là où aucun
-- client ne peut la contourner : en base, avant l'insertion.
--
--   1. `enforce_free_campaign_limit()` — la fonction qui tranche ;
--   2. le trigger BEFORE INSERT sur `campaigns`.
--
-- Non rétroactif : un compte gratuit qui possède déjà plusieurs campagnes les
-- garde toutes — seules les **nouvelles** créations sont refusées. Le plan lu
-- est le plan **effectif** : une formule payante expirée mais pas encore
-- reprise par `expire_due_plans()` (migration 0020) ne débloque rien.
--
-- La borne (1) est la contrepartie SQL de `FREE_MAX_CAMPAIGNS` dans
-- `lib/plans.ts` — la source de vérité reste TypeScript ; ce fichier la
-- recopie parce que la base ne peut pas lire le client.

-- 1. La fonction qui tranche -----------------------------------------------

create or replace function public.enforce_free_campaign_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan     plan_kind;
  v_expires  timestamptz;
  v_count    integer;
begin
  /*
   * Verrou de ligne sur le compte, pris AVANT le comptage : deux créations
   * simultanées du même compte se suivent au lieu de voir chacune « 0
   * campagne » et de passer toutes les deux.
   */
  select plan, plan_expires_at
    into v_plan, v_expires
    from public.users
   where id = new.owner_id
   for update;

  /*
   * Plan effectif payant : la colonne seule ne suffit pas — une formule
   * expirée reste lisible jusqu'au passage du cron (migration 0020), et elle
   * ne doit débloquer ni campagne ni quota entre-temps.
   */
  if coalesce(v_plan, 'free') <> 'free'
     and (v_expires is null or v_expires > now()) then
    return new;
  end if;

  select count(*) into v_count
    from public.campaigns
   where owner_id = new.owner_id;

  -- Le préfixe est un contrat : le client le reconnaît et affiche son propre
  -- message d'invitation à passer Créateur.
  if v_count >= 1 then
    raise exception 'FREE_CAMPAIGN_LIMIT: la formule Gratuit est limitee a 1 campagne par compte.';
  end if;

  return new;
end;
$$;

comment on function public.enforce_free_campaign_limit() is
  'Refuse l''insertion d''une campagne au-dela de 1 pour un compte dont le plan effectif est gratuit. Contrepartie SQL de FREE_MAX_CAMPAIGNS (lib/plans.ts).';

-- 2. Le trigger --------------------------------------------------------------

drop trigger if exists enforce_free_campaign_limit on public.campaigns;

create trigger enforce_free_campaign_limit
  before insert on public.campaigns
  for each row execute function public.enforce_free_campaign_limit();
