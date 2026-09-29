-- =====================================================================
--  Campagnes — Migration 0003 : disponibilité d'un pseudo
--  Cible : Supabase / Postgres 15+
--
--  Objet :
--    Rendre de nouveau fonctionnel le contrôle « ce pseudo est-il libre ? »
--    de l'écran d'onboarding, une fois la base réelle branchée.
--
--  Le problème résolu :
--    La policy `users_select_self` n'autorise un créateur à lire QUE sa propre
--    ligne. Un `select` sur `users` filtré par pseudo ne renvoie donc jamais
--    la ligne d'un autre créateur : tout pseudo déjà pris paraît libre. Le
--    formulaire affichait « disponible », puis échouait à l'enregistrement.
--
--  La réponse :
--    Une fonction `security definer` qui répond par un simple booléen, sans
--    jamais laisser lire une ligne. Elle n'expose aucune information nouvelle :
--    la vue publique `creator_profiles` publie déjà tous les pseudos.
--
--  À exécuter après 0001_init.sql et 0002_plans_distribution.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La fonction
--    `stable` : le résultat ne change pas au sein d'une même requête, ce qui
--    autorise Postgres à la mémoïser.
-- ---------------------------------------------------------------------
create or replace function public.username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.users u where u.username = lower(trim(p_username))
  );
$$;

comment on function public.username_available(text) is
  'Indique si un pseudo est libre, sans exposer la table users. Répond uniquement par un booléen.';

-- ---------------------------------------------------------------------
-- 2. Droits
--    Appelée depuis le navigateur avant même l'onboarding, donc ouverte à
--    `anon` autant qu'à `authenticated`. Elle ne révèle qu'un booléen sur une
--    donnée déjà publique.
-- ---------------------------------------------------------------------
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Recharger le cache de schéma de PostgREST
--    Sans cela, l'appel RPC peut répondre PGRST202 « function not found »
--    pendant quelques instants.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
