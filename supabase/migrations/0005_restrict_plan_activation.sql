-- =====================================================================
--  Campagnes — Migration 0005 : verrouillage de l'activation des formules
--  Cible : Supabase / Postgres 15+
--
--  Objet :
--    Retirer le seul chemin par lequel un compte pouvait s'attribuer lui-même
--    une formule payante, et le remplacer par un chemin serveur.
--
--  Le problème :
--    0002 accordait `set_own_plan()` à `authenticated`, et l'écran Paramètres
--    exposait un bouton qui l'appelait. N'importe quel compte Free pouvait donc
--    s'activer Organisation en un clic. Tant que cette porte reste ouverte,
--    verrouiller un module premium n'a aucun effet : le verrou se contourne en
--    changeant de formule.
--
--  La décision :
--    `set_own_plan()` disparaît. Elle est remplacée par `set_user_plan()`,
--    réservée à `service_role` — point d'entrée du futur webhook de paiement,
--    et levier d'activation manuelle de l'exploitant.
--
--    La suppression plutôt que la simple révocation est délibérée : l'ancienne
--    fonction lit `auth.uid()`, donc un appel depuis un webhook (service_role,
--    sans JWT) lèverait « Authentification requise ». La laisser en place
--    serait un piège pour la prochaine personne qui branchera le paiement.
--
--  Conséquence assumée : plus aucun écran ne peut activer une formule payante.
--    En attendant le prestataire, l'activation passe par un contact — voir
--    `components/plans/pricing-plans.tsx` et la section Formule des Paramètres.
--
--  À exécuter après 0004_campaign_kind.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fermer le chemin d'auto-activation
--    La révocation précède la suppression : elle rend l'intention lisible,
--    et couvre le cas où la fonction serait absente (0002 non appliquée).
-- ---------------------------------------------------------------------
revoke all on function public.set_own_plan(plan_kind) from public, anon, authenticated;

drop function if exists public.set_own_plan(plan_kind);

-- ---------------------------------------------------------------------
-- 2. Le chemin serveur
--    `p_user_id` est explicite : un webhook n'a pas de session, il doit
--    désigner le compte à activer. C'est précisément ce que l'ancienne
--    signature ne savait pas faire.
-- ---------------------------------------------------------------------
create or replace function public.set_user_plan(p_user_id uuid, p_plan plan_kind)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'Identifiant de compte requis.';
  end if;

  update public.users set plan = p_plan where id = p_user_id;

  if not found then
    raise exception 'Aucun compte pour l''identifiant %', p_user_id;
  end if;
end;
$$;

revoke all on function public.set_user_plan(uuid, plan_kind)
  from public, anon, authenticated;

grant execute on function public.set_user_plan(uuid, plan_kind) to service_role;

comment on function public.set_user_plan(uuid, plan_kind) is
  'Active une formule pour un compte donné. Réservée à service_role : futur webhook de paiement, et activation manuelle par l''exploitant. Aucun client ne doit pouvoir l''appeler.';

-- ---------------------------------------------------------------------
-- 3. Recharger le cache de schéma de PostgREST
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
