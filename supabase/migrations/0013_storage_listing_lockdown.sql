-- =====================================================================
--  Campagnes — Migration 0013 : fermer le listage du bucket `media`
--  Cible : Supabase / Postgres 15+  (Storage v1.77.5)
--
--  LE PROBLÈME
--  -----------
--  La policy `media_read_public` est écrite ainsi :
--
--      for select to anon, authenticated
--      using ( bucket_id = 'media' )
--
--  Sa clause est vraie pour **n'importe quelle ligne** de `storage.objects`
--  du bucket `media`. Or la couche Storage filtre avec la même clause deux
--  endpoints très différents :
--
--    *  GET  /storage/v1/object/public/media/<chemin>
--       → lecture d'un objet précis, dont l'URL est publique par nature.
--         C'est ce dont dépend le parcours participant.
--
--    *  POST /storage/v1/object/list/media   { prefix: "<uuid>/frames/" }
--       → **énumération** du contenu du bucket.
--
--  Prouvé en anonyme avant cette migration :
--      POST /storage/v1/object/list/media  {"prefix":"","limit":20}
--        → 200, liste des identifiants de dossiers de créateurs
--      POST /storage/v1/object/list/media  {"prefix":"<uuid>/frames/"}
--        → 200, et les PNG **non publiés** d'un créateur, avec leur taille,
--          leur ETag et leur date de dépôt.
--
--  Aucune policy RLS ne peut distinguer les deux endpoints par les colonnes
--  de la ligne : la distinction n'est pas dans la donnée, elle est dans
--  l'**opération** demandée.
--
--  LA SOLUTION
--  -----------
--  Storage expose `storage.allow_any_operation(text[])`, qui lit le
--  paramètre de session `storage.operation`, positionné par la couche
--  Storage selon l'endpoint appelé. C'est le mécanisme officiel prévu
--  exactement pour ce cas.
--
--  On restreint donc la lecture publique aux opérations qui servent un
--  **objet identifié**. `list` n'y figure pas : l'énumération est refusée.
--
--  POURQUOI NE PAS PASSER LE BUCKET EN PRIVÉ
--  -----------------------------------------
--  Un bucket privé exigerait des URL signées, donc une session (paquet
--  `@supabase/ssr`). Le **parcours participant n'a pas de session** : un
--  visiteur ouvre `/c/<slug>` ou `/d/<token>` sans compte, et l'image de
--  fond doit s'afficher. Fermer le bucket casserait ce parcours.
--
--  Ce qui est public ici, ce sont des **images de cadre déjà destinées à
--  être vues**. Le défaut corrigé n'est pas leur lecture, c'est le
--  **catalogue** : pouvoir énumérer ce qu'un créateur a déposé, y compris
--  ce qu'il n'a pas publié.
--
--  LIMITE ASSUMÉE
--  --------------
--  Une URL publique reste publique : qui la connaît peut lire le fichier.
--  Les noms de fichiers sont des UUID (`crypto.randomUUID()`), donc non
--  devinables, et le chemin porte l'identifiant du créateur. Fermer le
--  listage supprime le seul moyen de les découvrir **en masse**.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lecture publique : un objet identifié, pas un catalogue
-- ---------------------------------------------------------------------
--
--  La liste des opérations couvre les variantes rencontrées selon la
--  version de Storage et le mode d'accès (`public` ou authentifié) :
--  `allow_any_operation` normalise en retirant un éventuel préfixe
--  `storage.`, et compare à l'opération courante.
--
--  `list` est volontairement ABSENTE.
--
drop policy if exists media_read_public on storage.objects;

create policy media_read_public on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'media'
    and storage.allow_any_operation(array[
      'get',
      'get_public',
      'get_authenticated',
      'object.get',
      'object.get_public',
      'object.get_authenticated'
    ])
  );

comment on policy media_read_public on storage.objects is
  'Lecture d''un objet identifié du bucket media (URL publique). Le listage est exclu : voir migration 0013.';

-- ---------------------------------------------------------------------
-- 2. Ce qui reste inchangé
-- ---------------------------------------------------------------------
--
--  Les écritures sont déjà bornées au dossier du créateur
--  (`storage.foldername(name))[1] = auth.uid()::text`) par
--  `media_insert_own_folder`, `media_update_own_folder` et
--  `media_delete_own_folder`. Cette migration n'y touche pas et ne
--  desserre aucun droit : elle **retire** une capacité.
--
--  Le bucket reste public, donc `getPublicUrl()` continue de fonctionner
--  sans session — c'est indispensable au parcours participant.

notify pgrst, 'reload schema';

-- =====================================================================
--  CONTRÔLE APRÈS APPLICATION
--  -------------------------------------------------------------------
--    a)  POST /storage/v1/object/list/media {"prefix":""}       → doit ÉCHOUER
--    b)  POST /storage/v1/object/list/media {"prefix":"<uuid>/"} → doit ÉCHOUER
--    c)  GET  /storage/v1/object/public/media/<chemin réel>      → doit RÉUSSIR
--
--  Le contrôle (c) est le plus important : une policy trop stricte
--  casserait l'affichage des cadres sans qu'aucune erreur n'apparaisse
--  côté serveur, puisque le navigateur reçoit simplement des images vides.
-- =====================================================================
