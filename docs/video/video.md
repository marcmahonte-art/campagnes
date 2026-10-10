# Plan global d’implémentation vidéo — Campagnes

**Statut :** plan de réalisation, aucun code vidéo n’est encore implémenté.  
**Objectif :** préparer le développement du parcours participant vidéo sans casser les campagnes ou le parcours photo existants.

---

## 1. Décisions produit retenues

- Le créateur pourra autoriser **plusieurs cadres** pour une campagne vidéo.
- Le participant choisira parmi les cadres autorisés pour cette campagne; si un seul cadre est disponible, l’étape de sélection sera ignorée.
- La vidéo téléversée ne dépassera pas **30 secondes**.
- Si la vidéo source est plus longue, le participant sélectionnera un extrait sur son appareil; **seul cet extrait** pourra être téléversé.
- Le résultat sera rendu côté serveur en **MP4**, téléchargeable par le participant.
- La vidéo source et le résultat seront temporaires et stockés en espace privé.
- Le parcours photo et sa promesse actuelle de traitement local doivent rester inchangés.

### Règle de qualité et de confidentialité

Une source déjà inférieure ou égale à 30 secondes devrait éviter, si possible, un réencodage local avant l’envoi. Un extrait découpé localement à partir d’une source plus longue peut nécessiter un nouvel encodage et entraîner une attente, une consommation de batterie/mémoire et une perte de qualité. Si le navigateur ne sait pas préparer l’extrait correctement, le participant devra pouvoir découper une copie dans son application Photos/Galerie et sélectionner cette copie courte. **Ne jamais téléverser la source longue en affirmant que seul l’extrait est envoyé.**

Le serveur devra revalider la durée effective du média reçu; la valeur annoncée par le navigateur n’est pas une preuve suffisante.

---

## 2. État actuel du projet

- Les routes publiques `/c/[slug]` et privées `/d/[token]` partagent le composant `components/participant/participant-journey.tsx`.
- Le parcours participant accepte actuellement une image. La photo reste sur l’appareil et est composée avec le cadre dans le navigateur.
- Le type `video_frame` est défini, mais ne signifie pas que le participant peut déjà téléverser sa vidéo.
- `lib/video-export.ts` enregistre avec `MediaRecorder` un canvas animé qui contient le cadre et la photo du participant. Il ne compose pas une vidéo source et ne conserve donc pas son audio.
- Une campagne référence actuellement un seul cadre via `campaigns.frame_id`.
- Le bucket `media` est public, prévu pour des images de créateur et n’est pas adapté aux vidéos personnelles de participants.
- Le parcours privé possède des opérations d’export idempotentes `distribution_export_v1` et un cycle de réservation/confirmation/annulation. Le parcours public utilise `claim_participation`, qui incrémente immédiatement le compteur.
- Le dépôt ne contient pas de worker FFmpeg ni de file de rendu vidéo. La route existante de rendu PNG a `maxDuration = 30`; elle ne prouve pas que le rendu vidéo peut tourner de façon fiable dans une route Next.js/Vercel.
- La dernière migration présente dans le dépôt lors de la planification est `0026_admin_audit_log.sql`. Les prochains numéros devront être revérifiés au moment de l’implémentation.

---

## 3. Architecture cible

Séparer clairement quatre responsabilités :

1. **Cadres de campagne** — le créateur choisit les cadres disponibles; le serveur n’expose au participant que ces cadres autorisés.
2. **Préparation locale** — le navigateur valide la vidéo, montre l’aperçu, prépare un extrait de 30 secondes au maximum et ne l’envoie qu’après confirmation.
3. **Upload et quotas** — le serveur autorise une opération courte et idempotente, réserve la capacité nécessaire, fournit un accès temporaire à un objet privé et valide le média reçu.
4. **Rendu asynchrone** — un worker vidéo isolé compose le cadre, encode le MP4, vérifie le résultat et le rend téléchargeable temporairement.

Le descripteur de cadre doit être rechargé côté serveur à partir du cadre autorisé. Le client ne doit pas pouvoir soumettre un descripteur arbitraire, un chemin objet libre ou une URL source arbitraire.

### État métier indicatif d’une tâche

`RESERVED → UPLOADED → QUEUED → RENDERING → READY`

États terminaux possibles : `FAILED`, `CANCELLED`, `EXPIRED`.

Les transitions doivent être contrôlées et rejouables sans créer une seconde tâche facturée. Une nouvelle lecture ou un nouveau téléchargement d’un résultat déjà confirmé ne doit pas consommer une nouvelle unité de quota.

---

## 4. Plan de réalisation par phases

### Phase 0 — Spike de découpage local et contrat média

**But :** prouver que l’extrait de 30 secondes peut être préparé de manière acceptable avant de construire l’interface complète.

À tester sur téléphones et navigateurs cibles :

- lecture des métadonnées et précision du début/fin;
- codecs/conteneurs, y compris les fichiers mobiles courants;
- rotation, fréquence d’images variable et synchronisation audio/vidéo;
- qualité du segment produit et compatibilité avec l’upload puis le worker;
- temps de préparation, mémoire, batterie et comportement si l’onglet passe à l’arrière-plan;
- fallback si l’API de décodage/encodage n’est pas disponible.

Pour une vidéo d’origine de plus de 30 secondes, l’envoi réseau ne commence qu’après création locale de l’extrait court. En cas d’échec, proposer une instruction claire pour découper une copie avec Photos/Galerie puis recommencer.

**Décisions nécessaires avant de clôturer cette phase :** limite de taille du fichier source avant découpage, taille maximale de l’extrait envoyé, formats d’entrée, profil MP4 de sortie, résolution/fréquence/qualité, politique audio et durée de conservation.

**Critère de sortie :** parcours de trim réel testé sur appareils cibles, règles d’encodage documentées et fallback validé.

### Phase 1 — Modèle multi-cadres et interface créateur

Créer une association ordonnée campagne-cadres (par exemple `campaign_frames`). Reprendre les campagnes existantes à partir de `campaigns.frame_id`; conserver ce champ comme cadre par défaut pendant la migration des lecteurs historiques.

Garde-fous :

- le propriétaire de la campagne ne peut y attacher que ses propres cadres;
- un participant ne lit que les cadres attachés à une campagne publiée;
- toutes les options vidéo d’une campagne doivent être compatibles avec son type de média et son ratio, sauf décision explicite d’élargir le modèle;
- le créateur doit conserver un cadre par défaut valide avant publication.

Fichiers probables :

- `supabase/migrations/0027_campaign_frames.sql` (numéro indicatif, à revalider);
- `lib/types.ts`;
- `lib/backend/types.ts`;
- `lib/backend/supabase.ts`;
- `lib/backend/local.ts`;
- interfaces de création/édition de campagne et sélection de cadres.

**Critère de sortie :** campagne existante inchangée à l’écran et à l’export; nouvelles campagnes vidéo pouvant enregistrer et restituer une liste ordonnée de cadres autorisés.

### Phase 2 — Contrat de tâche, idempotence et quotas

Ajouter les métadonnées de tâches d’export et des fonctions SQL/RPC étroites pour réserver, confirmer, annuler, renouveler, consulter l’état et expirer une tâche. N’enregistrer que les clés d’objets et métadonnées nécessaires, pas le contenu des vidéos ni des secrets bruts.

#### Parcours public `/c`

`claim_participation` incrémente actuellement le quota au moment de l’appel. Pour un rendu vidéo asynchrone, créer une réservation temporaire et atomique, confirmée lors de la réussite, libérée en cas d’échec ou d’expiration. La réservation vidéo doit être prise en compte par les téléchargements photo afin que deux participants ne consomment pas simultanément la dernière unité.

#### Parcours privé `/d`

Réutiliser `distribution_export_v1` et les opérations idempotentes existantes, en adaptant leur durée/renouvellement si le worker prend plus longtemps. Ne pas compter deux fois un export; préserver le quota propre au lien privé, distinct du quota global de campagne.

Fichiers probables :

- `supabase/migrations/0028_participant_video_jobs.sql` (numéro indicatif);
- fonctions de quota existantes, notamment `0007_participation_quota.sql`;
- fonctions de transaction dans `0022_distribution_transactions.sql`;
- contrats de types et couche `lib/distribution-export.ts` si nécessaire.

**Critère de sortie :** tests SQL prouvant qu’une opération unique ne consomme qu’une unité malgré retry, échec, expiration ou appels concurrents.

### Phase 3 — Upload privé et API de tâche

Créer un stockage vidéo temporaire **distinct** du bucket `media` public. Prévoir un accès d’upload à durée courte et limité à un objet dont le chemin est généré côté serveur. Les droits d’administration restent côté serveur/worker.

Routes indicatives, à adapter aux conventions existantes :

- `app/api/participant-video/jobs/route.ts` — autoriser et créer une opération;
- `app/api/participant-video/jobs/[id]/route.ts` — état, annulation ou reprise autorisée;
- `app/api/participant-video/jobs/[id]/result/route.ts` — récupérer le résultat de façon contrôlée.

Validations côté serveur :

- campagne publiée et accessible sur `/c`, ou jeton privé valide sur `/d`;
- cadre membre de la liste autorisée;
- taille, conteneur, codec et durée réelle de l’objet;
- durée ≤ 30 secondes;
- quota réservé avant le travail coûteux;
- clé d’objet et accès au résultat limités à la tâche;
- quotas de débit et de concurrence pour les appels anonymes.

Les URL signées, jetons `/d` et secrets d’opération ne doivent pas apparaître dans les logs. Les messages `/d` doivent préserver l’indistinguabilité actuelle d’un jeton absent, expiré, révoqué ou épuisé.

**Critère de sortie :** un participant anonyme peut envoyer uniquement un segment court dans l’espace privé, et toute demande invalide est rejetée sans accès aux données d’un autre participant.

### Phase 4 — Worker vidéo et rendu MP4

Mettre le worker dans un runtime durable sélectionné et déployé séparément de l’application web, derrière une file de tâches. Ne pas supposer qu’une route Next.js de durée limitée peut encoder de manière fiable tous les clips.

Le worker doit :

1. lire la tâche, la campagne et le descripteur du cadre autorisé depuis le serveur;
2. récupérer les objets depuis le stockage privé selon des chemins contrôlés;
3. composer le clip selon le ratio/cadrage de la campagne et le cadre choisi;
4. préserver l’audio quand il existe, avec synchronisation au segment choisi;
5. éviter l’agrandissement artificiel de la source;
6. produire et valider un MP4 conforme au profil produit retenu;
7. publier l’état/progression et rendre disponible le résultat privé;
8. traiter les retries/crash de façon idempotente et supprimer les fichiers temporaires à échéance.


Exécuter FFmpeg de façon isolée, sans interpolation de commande shell avec des valeurs utilisateur; limiter durée, mémoire, CPU et taille du résultat.

**Critère de sortie :** fixtures vidéo vérifiées pour durée, orientation, recadrage, qualité, lecture MP4, audio et nettoyage; le worker redémarre sans doubler le quota ni créer de rendus concurrents non contrôlés.

### Phase 5 — Parcours participant commun `/c` et `/d`

Étendre `components/participant/participant-journey.tsx` sans dupliquer les routes :

1. sélectionner un cadre autorisé (sauter si unique);
2. choisir une vidéo et la prévisualiser localement;
3. découper/choisir un extrait ≤ 30 secondes et régler le cadrage;
4. afficher le consentement précisant que seul l’extrait choisi est envoyé et qu’il sera supprimé selon la politique annoncée;
5. afficher préparation, upload, mise en file, rendu, réussite; offrir annuler/réessayer/reprendre;
6. prévisualiser le résultat et télécharger le MP4.

Composants/modules potentiels :

- `components/participant/video-input.tsx`;
- `components/participant/video-trim.tsx`;
- `lib/video-trim.ts`;
- `lib/participant-video-jobs.ts` pour le client du contrat de tâche;
- mise à jour de `components/participant/participant-journey.tsx`.

Adapter les chargements de campagnes de `app/c/[slug]/participant-campaign.tsx` et `app/d/[token]/page.tsx`. Garder le choix des cadres autorisés côté serveur; ne pas accepter un `frame_id` client sans le revalider.

États à couvrir : fichier annulé/corrompu/incompatible, métadonnées illisibles, trim indisponible, quota refusé, réseau interrompu, URL d’upload expirée, job en attente/échoué, lien de résultat expiré, téléchargement mobile bloqué. Chaque état doit proposer une action réalisable.

**Critère de sortie :** un parcours complet fonctionne sur `/c` et `/d`; la photo continue de fonctionner et ne reçoit pas de nouveau transfert réseau.

### Phase 6 — Validation, pilote et déploiement progressif

- Ajouter des contrôles TypeScript, tests de logique, tests SQL et harnais serveur, selon les conventions `tools/*-check` du dépôt.
- Tester 29,9 s, 30 s, >30 s, durées malformées, faux MIME, fichiers tronqués, dépassement de taille, codec non supporté et rotation mobile.
- Tester RLS, droits d’accès aux objets, liens signés expirés, jetons privés, suppression/revocation, jobs dupliqués et accès croisé aux campagnes.
- Tester concurrence quota avec exports photo et vidéo simultanés; confirmer libération sur échec et absence de double débit lors des retries.
- Tester synchronisation audio, cadrage, ratio, durée finale et lecture MP4 sur appareils/navigateurs visés.
- Déployer derrière un drapeau de fonctionnalité, piloter avec un petit périmètre, observer latence de file, taux d’échec, coûts, nettoyage et compatibilité avant ouverture générale.

**Critère final :** cadres uniquement autorisés, clip téléversé ≤30 secondes, résultat MP4 privé téléchargeable, quotas exacts, fichiers temporaires supprimés conformément à l’information affichée, parcours photo intact.

---

## 5. Ordre de développement recommandé

1. **Spike trim local** — prouver le point le plus risqué sur appareils cibles.
2. **Choix du stockage privé et du worker/queue** — benchmarker le rendu vidéo représentatif; déterminer limites et rétention.
3. **Multi-cadres** — migration rétrocompatible, RLS, backends Supabase/local et interface créateur.
4. **Tâches et quotas** — contrat idempotent public/privé, réservé/confirmé/annulé.
5. **Upload privé et worker MP4** — sécurité, validation serveur, erreurs, nettoyage.
6. **Interface participant** — connecter le parcours réel aux services désormais vérifiables.
7. **Tests sur appareils, pilote et déploiement progressif.**

Ne pas commencer par une interface de chargement qui n’est reliée ni au quota, ni au stockage privé, ni au worker réel.

---

## 6. Décisions encore à prendre avant le rendu de production

Ces limites ne sont pas définies par le code actuel et ne doivent pas être inventées pendant l’implémentation :

- taille maximale du fichier source avant trim et de l’extrait téléversé;
- conteneurs et codecs acceptés, notamment formats mobiles;
- résolution, fréquence d’images et niveau de qualité du MP4;
- comportement du cadre animé sur le clip : boucle, animation jouée une fois ou animation figée;
- politique audio : conserver par défaut (recommandé), permettre de couper le son ou les deux;
- durée de conservation de la source, du résultat et fenêtre de retéléchargement;
- fournisseur/région du stockage privé et du worker/queue;
- limites de concurrence, débit anonyme, réessais et règles de quota si le worker échoue.

