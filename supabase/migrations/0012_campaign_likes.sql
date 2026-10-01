-- =====================================================================
--  Campagnes — Migration 0012 : likes de campagne
-- =====================================================================
--
--  CE QUE CETTE MIGRATION COMPTE
--
--  Deux indicateurs sur les cartes de la galerie, et rien d'autre :
--
--    - les **likes**, posés par un utilisateur connecté ;
--    - les **utilisations**, qui ne sont PAS comptées ici.
--
--  Les utilisations existent déjà : c'est `campaigns.participants_used`,
--  incrémenté par `claim_participation()` (migration 0007) à chaque
--  téléchargement. Cette migration ne le touche pas, et ne doit surtout pas
--  créer un second compteur : deux chiffres pour la même chose finiraient
--  par divergir, et personne ne saurait lequel afficher.
--
--  DÉCISION : LE COMPTEUR EST CALCULÉ, PAS STOCKÉ
--
--  Il n'y a **pas** de colonne `likes_count`. Le compteur est un `count(*)`
--  sur `campaign_likes`, lu par la vue publique.
--
--  Une colonne dénormalisée serait plus rapide à lire, mais elle crée une
--  seconde source de vérité : il faudrait resynchroniser le compteur à chaque
--  suppression, à chaque import, à chaque nettoyage. Le gain de lecture ne
--  vaut pas le risque — « 842 » affiché et « 841 » en base sont deux bugs
--  distincts qu'aucun test ne rattrape. Ici, l'écart est structurellement
--  impossible.
--
--  LE LIKE EST UN ACTION ANONYME, MAIS UN COMPTEUR N'EST PAS ANONYME
--
--  `campaign_likes.user_id` référence `auth.users` : on sait qui a aimé, et
--  l'utilisateur seul peut lire ses propres lignes. En revanche **aucune**
--  ligne de la table n'est lisible publiquement : la vue agrège sans jamais
--  exposer l'identité. C'est le seul endroit où les deux besoins se
--  rejoignent sans se contredire.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Table des likes
-- ---------------------------------------------------------------------

create table if not exists public.campaign_likes (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table public.campaign_likes is
  'Likes posés par des utilisateurs connectés. Une ligne par couple (campagne, utilisateur).';

-- La contrainte qui empêche le double like, au niveau de la base et pas de
-- l'écran : deux onglets ouverts simultanément ne peuvent pas écrire deux
-- lignes, même si les deux requêtes passent avant que l'autre n'ait été
-- validée. C'est ce qui rend le compteur honnête.
create unique index if not exists campaign_likes_unique
  on public.campaign_likes (campaign_id, user_id);

-- Le compteur de la galerie trie par volume : l'index doit couvrir ce chemin
-- sans passer par la table entière.
create index if not exists campaign_likes_campaign_idx
  on public.campaign_likes (campaign_id);


-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------
--
--  Deux politiques, et deux seulement :
--
--    - lecture de **ses propres** likes — c'est ce qui permet à l'écran de
--      savoir si le cœur est déjà rempli au chargement ;
--  - écriture de ses propres likes — un utilisateur ne peut aimer que ce
--    qu'il a lui-même aimé, et rien d'autre.
--
--  Le compteur, lui, passe par la vue plus bas. Personne ne lit
--  `campaign_likes` en dehors de son auteur.

alter table public.campaign_likes enable row level security;

drop policy if exists campaign_likes_read_own on public.campaign_likes;
create policy campaign_likes_read_own
  on public.campaign_likes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists campaign_likes_insert_own on public.campaign_likes;
create policy campaign_likes_insert_own
  on public.campaign_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists campaign_likes_delete_own on public.campaign_likes;
create policy campaign_likes_delete_own
  on public.campaign_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- 3. Aimer ou retirer son like — une seule opération
-- ---------------------------------------------------------------------
--
--  Une fonction, pas deux. L'écran appelle `toggle_campaign_like` et n'a pas
--  à savoir s'il vient d'ajouter ou de retiré.
--
--  La ligne est verrouillée avant d'être testée : deux clics simultanés ne
--  peuvent pas tous deux voir « pas encore aimé » et tous deux écrire.
--
--  La fonction est `security definer` : elle doit écrire dans la table, et la
--  policy `insert` ne laisserait passer que l'insertion — pas la suppression.
--  Elle est donc responsable de sa propre sécurité, et cette responsabilité
--  est explicite ci-dessous.

create or replace function public.toggle_campaign_like(p_campaign_id uuid)
returns table (liked boolean, likes_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_campaign uuid;
  row_user    uuid;
  was_liked   boolean;
begin
  -- L'appelant doit être un utilisateur connecté. Sans cette ligne, un
  -- visiteur anonyme pourrait appeler la fonction en direct : `auth.uid()`
  -- serait nul et l'écriture échouerait sur une contrainte, donc avec une
  -- erreur technique au lieu d'un refus lisible.
  row_user := auth.uid();
  if row_user is null then
    raise exception 'Connexion requise pour aimer une campagne.'
      using errcode = '42501';
  end if;

  -- Un brouillon ne reçoit aucun like : il n'est visible de personne.
  select c.id into row_campaign
    from public.campaigns c
   where c.id = p_campaign_id
     and c.status = 'published'
     for update;

  if row_campaign is null then
    raise exception 'Campagne introuvable.'
      using errcode = 'P0002';
  end if;

  -- Le verrou est tenu : toute autre transaction sur cette campagne attend.
  -- C'est ce qui rend le compteur exact sous concurrence.
  if exists (
    select 1 from public.campaign_likes l
     where l.campaign_id = p_campaign_id
       and l.user_id = row_user
  ) then
    delete from public.campaign_likes l
     where l.campaign_id = p_campaign_id
       and l.user_id = row_user;
    was_liked := false;
  else
    insert into public.campaign_likes (campaign_id, user_id)
    values (p_campaign_id, row_user);
    was_liked := true;
  end if;

  return query
    select was_liked,
           (select count(*) from public.campaign_likes l
             where l.campaign_id = p_campaign_id);
end;
$$;

comment on function public.toggle_campaign_like(uuid) is
  'Ajoute ou retire le like de l''appelant, en une opération atomique. Renvoie l''état et le compteur exact.';

revoke all on function public.toggle_campaign_like(uuid) from public, anon;
grant execute on function public.toggle_campaign_like(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Compteurs publics
-- ---------------------------------------------------------------------
--
--  Une vue, deux colonnes : `likes_count` et `liked_by_me`.
--
--  `liked_by_me` ne vaut quelque chose que pour un utilisateur connecté, et
--  c'est intentionnel : pour un visiteur, la colonne vaut `false` et le cœur
--  reste inerte. La vue ne peut pas fuir l'identité de personne — elle expose
--  un booléen pour le seul appelant, et un total pour tout le monde.

drop view if exists public.campaign_stats;
create view public.campaign_stats
with (security_invoker = on)
as
select
  c.id                                          as campaign_id,
  coalesce(l.likes, 0)                          as likes_count,
  coalesce(me.liked, false)                     as liked_by_me
from public.campaigns c
left join lateral (
  select count(*) as likes
    from public.campaign_likes cl
   where cl.campaign_id = c.id
) l on true
left join lateral (
  select true as liked
    from public.campaign_likes cl
   where cl.campaign_id = c.id
     and cl.user_id = auth.uid()
) me on true
where c.status = 'published';

comment on view public.campaign_stats is
  'Likes d''une campagne publiée : total pour tous, « liked_by_me » pour le seul appelant. Les utilisations ne sont pas ici — voir campaigns.participants_used.';

-- La vue est lue par l'anonyme (compteur) comme par le connecté (cœur).
-- `security_invoker` signifie que les politiques de `campaign_likes`
-- s'appliquent : un visiteur ne lit que l'agrégat, un utilisateur connecté lit
-- en plus son propre booléen. C'est le point important de la vue.
grant select on public.campaign_stats to anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. Diagnostic
-- ---------------------------------------------------------------------

comment on column public.campaign_likes.campaign_id is
  'Campagne aimée. La suppression de la campagne emporte ses likes.';

comment on column public.campaign_likes.user_id is
  'Utilisateur connecté qui a aimé. Jamais exposé publiquement : seuls un total et un booléen le traversent.';