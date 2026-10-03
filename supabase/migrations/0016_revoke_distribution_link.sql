/*
 * 0016 — Révocation d'un lien de distribution.
 *
 * Le statut `REVOKED` existe depuis la migration 0008 et est déjà vérifié par
 * `resolve_distribution` (0009) et `claim_distribution` (0014). Seul manquait
 * le moyen de le poser : aucune RPC ni aucune policy n'autorisait la mise à
 * jour du statut.
 *
 * Cette fonction est `security definer` pour la même raison que
 * `create_distribution_link` : la RLS interdit l'écriture directe sur
 * `distribution_links`, et c'est voulu. On passe par une fonction qui
 * **revalide le propriétaire** avant de toucher la ligne.
 *
 * La révocation est définitive : un lien révoqué ne peut pas être réactivé.
 * C'est un choix produit : un jeton qui a pu être copié et partagé ne doit
 * pas reprendre vie silencieusement.
 */

create or replace function public.revoke_distribution_link(
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_owner uuid;
  v_link_status    text;
begin
  -- Vérifie que le lien existe, appartient au créateur courant, et n'est pas
  -- déjà révoqué. La jointure avec `campaigns` revalide le propriétaire.
  select c.owner_id, dl.status
    into v_campaign_owner, v_link_status
    from distribution_links dl
    join campaigns c on c.id = dl.campaign_id
   where dl.token = p_token;

  if not found then
    return false;
  end if;

  -- Seul le propriétaire peut révoquer ses propres liens.
  if v_campaign_owner <> auth.uid() then
    return false;
  end if;

  -- Un lien déjà révoqué n'est pas une erreur, c'est un no-op.
  if v_link_status = 'REVOKED' then
    return true;
  end if;

  update distribution_links
     set status     = 'REVOKED',
         updated_at = now()
   where token = p_token;

  return true;
end;
$$;

comment on function public.revoke_distribution_link(text) is
  'Révoque un lien de distribution privé. Seul le propriétaire de la campagne '
  'peut révoquer. La révocation est définitive.';

-- Accessible par tout utilisateur connecté (la fonction revalide le propriétaire).
grant execute on function public.revoke_distribution_link(text) to authenticated;
