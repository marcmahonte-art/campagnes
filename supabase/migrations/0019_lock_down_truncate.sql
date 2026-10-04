-- =====================================================================
--  Campagnes — Migration 0019 : fermer TRUNCATE aux rôles clients
--  Cible : Supabase / Postgres 15+
--
--  DÉFAUT CONSTATÉ (mesuré en base, pas supposé)
--  ---------------------------------------------
--  Supabase accorde par défaut, sur **toute** table de `public` :
--
--      grant all on <table> to anon, authenticated;
--
--  soit `arwdDxtm` — dont `D` = TRUNCATE. Les policies RLS neutralisent
--  INSERT/UPDATE/DELETE, mais **RLS ne s'applique PAS à TRUNCATE** :
--  `truncate` est une opération de niveau table, hors du filtre ligne à ligne.
--
--  Mesure faite avant cette migration, dans une transaction annulée :
--
--      begin; set local role anon;
--      truncate table public.payments;
--      select 'TRUNCATE A REUSSI pour anon';   -->  a renvoyé la ligne
--      rollback;
--
--  Conséquence : la clé anon est **publique par nature** (elle est servie au
--  navigateur), donc n'importe qui pouvait vider `payments`, `users`,
--  `campaigns`, `distribution_links` — l'intégralité des données du produit —
--  sans jamais être authentifié. Ce n'est pas un défaut introduit par 0017/0018 :
--  il est uniforme sur tout le schéma depuis le premier jour. On le ferme ici
--  parce qu'on vient d'y poser la table des paiements.
--
--  CE QUE FAIT CETTE MIGRATION
--  ---------------------------
--  Révocation de `TRUNCATE`, `TRIGGER`, `REFERENCES`, `MAINTAIN` à `anon` et
--  `authenticated` sur toutes les tables du schéma `public`. Ces quatre
--  privilèges n'ont **aucun** usage côté client :
--    - TRUNCATE  : vide une table, non filtrable par RLS ;
--    - TRIGGER   : poser un déclencheur, réservé au propriétaire ;
--    - REFERENCES: créer une FK pointant vers la table, réservé au propriétaire ;
--    - MAINTAIN  : VACUUM/ANALYZE/REINDEX, réservé à l'exploitant.
--
--  Ce qui N'EST PAS touché : SELECT / INSERT / UPDATE / DELETE. Ils sont
--  légitimes pour le client et **déjà gouvernés par les policies RLS** du
--  projet. Retirer ces droits casserait l'application (le formulaire public
--  écrit dans `campaign_events`, le participant dans `distribution_usages`…).
--
--  Défense en profondeur : on ne se contente pas de révoquer. On révoque, puis
--  on **vérifie** dans la même migration (bloc `do`), de sorte qu'une
--  régression ultérieure fasse échouer l'application de la migration.
--
--  À exécuter après 0018_campaign_topup.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Révoquer les privilèges dangereux, table par table
--    On boucle sur `pg_tables` : toute table ajoutée plus tard devra repasser
--    par le même traitement (voir la note de bas de fichier).
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke truncate, trigger, references, maintain on public.%I from anon, authenticated', r.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Révoquer aussi sur les VUES exposées
--    Les vues de ce projet (`campaign_stats`, `creator_profiles`,
--    `distribution_stats`…) sont lues par le client. Elles n'ont pas de
--    TRUNCATE, mais `insert/update/delete` sur une vue simple peut atteindre
--    la table sous-jacente. Comme leurs droits sont déjà limités à SELECT par
--    les migrations d'origine, on se contente de retirer ce qui pourrait
--    rouvrir une écriture : on **garde** SELECT, on retire le reste.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select table_name
      from information_schema.views
     where table_schema = 'public'
  loop
    execute format('revoke insert, update, delete, truncate, trigger, references on public.%I from anon, authenticated', r.table_name);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Empêcher la reproduction du défaut
--    Les privilèges par défaut de Postgres s'appliquent aux objets **futurs**.
--    On retire ces privilèges par défaut pour tout nouveau rôle propriétaire
--    de la base (`postgres`), afin qu'une table créée après cette migration
--    n'hérite pas de `TRUNCATE` pour `anon`.
--
--    Note : Supabase pose aussi des `alter default privileges` au niveau de
--    ses propres rôles ; on ne peut agir que sur ce que l'on peut atteindre
--    ici. Le contrôle du point 4 garantit le résultat sur les tables réelles.
-- ---------------------------------------------------------------------
alter default privileges in schema public
  revoke truncate, trigger, references, maintain on tables from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Contrôle : la migration doit échouer si la révocation n'a pas pris
--    « Un droit déclaré doit être appliqué » — on vérifie l'application, pas
--    l'existence du droit. Une table qui garderait TRUNCATE lève l'exception
--    et annule toute la migration.
-- ---------------------------------------------------------------------
do $$
declare
  v_fautives int;
  v_liste    text;
begin
  select count(*), string_agg(table_name, ', ')
    into v_fautives, v_liste
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES');

  if v_fautives > 0 then
    raise exception
      'Revocation incomplete sur % objet(s) : %', v_fautives, v_liste;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Recharger le cache de schéma de PostgREST
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
