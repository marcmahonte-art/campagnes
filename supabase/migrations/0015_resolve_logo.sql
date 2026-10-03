-- =====================================================================
--  Campagnes — Migration 0015 : résolution du jeton avec logo client
-- =====================================================================
--
--  La fonction `resolve_distribution` renvoyait jusqu'ici un simple `uuid`
--  (l'identifiant de la campagne). Le parcours participant sur `/d/[token]`
--  n'avait donc aucun moyen de connaître le logo du client rattaché au lien :
--  la colonne `client_logo_url` existait dans `distribution_links`, mais
--  personne ne la lisait.
--
--  Cette migration transforme le retour en `jsonb` : un objet structuré
--  `{ campaign_id, client_logo_url }`, ou `null` quand le jeton est mort.
--  Le changement de type de retour est sans danger : aucun jeton n'existe en
--  production et le seul appelant (`getPrivateCampaign`) est mis à jour dans
--  le même commit.
--
--  La logique de refus reste inchangée : un jeton inconnu, révoqué, expiré
--  ou épuisé renvoie `null` — indiscernable des autres cas de refus.
-- =====================================================================

drop function if exists public.resolve_distribution(text);

create function public.resolve_distribution(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
begin
  select id, campaign_id, expires_at, status, quota_used, quota_total, client_logo_url
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

  return jsonb_build_object(
    'campaign_id',     v_link.campaign_id,
    'client_logo_url', v_link.client_logo_url
  );
end;
$$;

comment on function public.resolve_distribution(text) is
  'Résout un jeton vers sa campagne sans consommer de quota. Renvoie un objet JSON {campaign_id, client_logo_url} ou null si le jeton est inconnu, expiré, révoqué ou épuisé.';

revoke all on function public.resolve_distribution(text) from public;
grant execute on function public.resolve_distribution(text) to anon, authenticated;

notify pgrst, 'reload schema';
