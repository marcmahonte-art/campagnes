# Vidéo participant — Campagnes

**Version : 10 octobre 2026**
**Statut :** **livré** — le parcours vidéo participant est en place, composé entièrement dans le navigateur.

---

## 1. Objectif produit

Le participant arrive depuis le lien d'une campagne ou depuis la galerie publique, ouvre un **cadre vidéo**, choisit sa vidéo, et télécharge sa vidéo **avec le cadre dessus et le filigrane**.

Trois gestes, comme pour la photo : **je choisis ma vidéo → je la place → je télécharge.** Aucun compte, aucune application, aucun formulaire.

### Périmètre livré

- La campagne garde **son cadre unique** (`campaigns.frame_id`). Le participant ne choisit pas entre plusieurs cadres.
- Le parcours est celui de la campagne : `/c/[slug]` (public) ou `/d/[token]` (lien privé). La galerie route déjà les cadres vidéo vers `/c/[slug]`.
- Une campagne `video_frame` accepte une vidéo de **30 secondes maximum** ; une campagne `photo_frame` continue d'accepter une photo, inchangée.
- La sortie est un fichier vidéo composé **sur l'appareil du participant**, avec le cadre et le filigrane.
- **Aucun téléversement.** La vidéo source ne quitte jamais l'appareil, exactement comme la photo.

### Décision d'architecture — et l'écart assumé avec la version précédente de ce document

La version précédente décrivait un rendu **côté serveur** : téléversement vers un stockage privé temporaire, file de tâches, worker FFmpeg produisant un MP4, table d'opérations idempotentes.

**Ce chemin n'a pas été retenu**, pour une raison qui n'est pas technique :

> Le parcours affiche « Votre vidéo reste sur votre appareil ». Un téléversement — même temporaire, même privé, même supprimé ensuite — rendrait cette phrase fausse.

S'y ajoutaient des raisons de fond : le dépôt ne contient **aucun** worker vidéo ni file de tâches ; le bucket `media` est public et conçu pour les images de créateur ; et surtout, un rendu serveur aurait dupliqué la géométrie du cadre, le Motion Engine et le filigrane — trois logiques qui n'existent aujourd'hui qu'une seule fois, et dont la duplication est précisément ce que le projet s'interdit.

Le parcours vidéo réutilise donc **tout** l'existant : `photoZone`, `photoSize`, `clampPlacement`, `initialPlacement`, `composeDescriptor`, `effectiveMotion`/`sampleAt`, `shouldWatermark`/`exportPlanFor`, `addBadge`. Le clip est traité comme une photo de mêmes dimensions, avec un média vivant à la place d'une image immuable.

**Conséquence assumée :** la production d'un MP4 dépend du navigateur. Chrome, Edge et Safari 14.1+ écrivent du `video/mp4` ; Firefox écrit du WebM. L'extension annoncée suit toujours le conteneur réellement produit — le fichier ne ment jamais sur son format. Aucun upscaling : la qualité finale est bornée par la source.

**Conséquence favorable :** la durée n'a pas besoin d'être « vérifiée par le serveur ». Le plafond est **structurel** — on n'enregistre jamais plus de 30 secondes — et non une validation après coup.

---

## 2. Ce qui a été construit

### `lib/video-clip.ts` — logique pure, testable sans navigateur

- `MAX_CLIP_MS = 30_000` — le plafond, comme un statut vidéo.
- `knownDuration`, `maxClipStart`, `fitsWithinLimit`, `clampClipStart`, `clipWindow` — le calcul de la fenêtre retenue. Une seule fonction (`clipWindow`) décrit ce que voient l'aperçu, la progression et le rendu : ils ne peuvent pas diverger.
- `formatClipDuration` — `1:05`, jamais un nombre de millisecondes.
- `pseudoPhoto(video)` — fabrique la photo de substitution qui porte les **dimensions de la vidéo**. C'est la pièce qui permet à tout le placement existant de fonctionner sans une ligne de plus.
- `readVideoFile` / `probeVideo` — lecture locale, métadonnées lues par le décodeur du navigateur, délai de garde de 15 s, URL d'objet libérée en cas d'échec.
- `looksLikeVideo` — premier filtre seulement. Un type MIME est déclaratif, donc souvent faux sur mobile ; la vraie validation est la lecture des métadonnées.

### `lib/fabric-image.ts` — `createVideoObject()`

Le seul endroit qui traduit un `ImageLayer` en objet Fabric portant une vidéo. Deux pièges rencontrés et traités, tous deux vérifiés dans le code de Fabric 7.4.0 installé :

1. **Fabric mesure une source par `element.naturalWidth || element.width`.** Un `<video>` n'a pas de `naturalWidth`, et son `width` est l'attribut de mise en page — `0` par défaut. Sans correction, `_renderFill` calculait un rectangle source **vide** et la vidéo n'était jamais dessinée. Les dimensions intrinsèques sont donc posées explicitement sur l'élément **et** dans les options Fabric.
2. **`FabricImage.shouldCache()` renvoie `true` dès qu'un `clipPath` existe**, et ignore `objectCaching`. Le cache n'étant jamais invalidé pour une vidéo (l'objet ne bouge pas, seuls ses pixels changent), la première image restait figée pour toujours. Le cache est donc désactivé sur cette instance ; la découpe de zone reste appliquée par le chemin direct.

### `lib/video-export.ts` — `exportVideoClip()`

Compose le clip dans un canvas hors écran à la résolution native du format, et l'enregistre via `MediaRecorder` :

- **audio** récupéré par Web Audio (`createMediaElementSource` → `MediaStreamDestination`), le graphe n'étant **pas** relié à la sortie du contexte : le participant n'entend rien pendant le rendu, tout en obtenant une piste exploitable. Repli sur `video.captureStream()`. En dernier recours, un clip muet — jamais un échec ;
- **animation du cadre** rejouée par le même Motion Engine que l'aperçu, à partir du début de l'extrait ;
- **conteneur MP4 en premier**, WebM en repli, avec l'extension correspondante ;
- débit d'encodage 12 Mbit/s — plus élevé que pour un cadre animé, parce qu'une vidéo filmée contient beaucoup plus de détail ;
- nettoyage complet : lecture arrêtée, pistes coupées, contexte audio fermé, canvas libéré **avant** l'élément média, source détachée.

### `components/participant/participant-stage.tsx`

- prop `video` : la scène dessine l'image courante du média à la place de la photo, dans la même emprise ;
- boucle de rafraîchissement qui ne repeint **que** lorsque c'est nécessaire — pendant la lecture, ou après un déplacement dans la vidéo. Une boucle permanente viderait la batterie pour rien.

### `components/participant/participant-journey.tsx`

- `chooseVideo` : lecture locale, création de l'élément média, géométrie du clip, historique cohérent avec la photo (remplacer laisse « Annuler » ramener la précédente) ;
- cycle de vie de l'élément média : monté dans un conteneur **0 × 0 mais rendu** (un média en `display: none` cesse d'être décodé par certains navigateurs), démonté avec son flux ;
- fenêtre de lecture : la lecture s'arrête au bout de l'extrait et reboucle, comme un lecteur de statut ;
- panneau « clip » : bouton lecture/pause, durée retenue, dimensions, et **curseur d'extrait uniquement si la source dépasse 30 s** ;
- `renderFile(kind, plan)` : **une seule** fabrique pour les deux médias et les trois chemins d'export (lien privé, pass serveur, parcours public). C'est ce qui interdit à un PNG et une vidéo de décrire des choses différentes ;
- `runExport('video')` branché sur le bouton principal pour une campagne vidéo ;
- **filtres masqués** sur une campagne vidéo : ils opèrent sur une image immuable et ne pourraient pas être garantis à l'export ;
- **pass « Sans filigrane » retiré** de l'écran d'une campagne vidéo (`showPassPromo`, `WatermarkPassStatus`, `WatermarkUpsell`) : le pass porte sur le PNG, une vidéo garde le badge dans tous les cas. Le proposer ferait payer un retrait qui n'aurait pas lieu. Une phrase le dit explicitement.

---

## 3. Filigrane

Règle inchangée, réutilisée telle quelle (`lib/watermark-policy.ts`) :

- **`/c/[slug]` public :** le badge est toujours posé, y compris pour un cadre Pro.
- **`/d/[token]` privé :** la règle de formule du créateur s'applique.
- **Le pass « Sans filigrane » ne concerne pas la vidéo.** Un clip conserve le badge.

Le badge est dessiné par la **même** fonction que l'aperçu et que l'export PNG (`lib/watermark.ts`), dans les pixels du fichier — pas seulement à l'écran.

---

## 4. Quotas

Aucune migration, aucun changement de schéma. Les deux compteurs existants sont réutilisés sans modification :

- `/c` : `claim_participation`, réservé **avant** le rendu ;
- `/d` : `PrivateExportCoordinator` + `distribution_export_v1`, avec son identifiant d'opération idempotent. Le format transmis est `'video'`, déjà accepté par le contrat existant.

Les quotas `/c` et `/d` restent indépendants. Un échec de rendu n'a pas consommé de place au mauvais moment : la réservation précède le rendu, comme pour le PNG.

---

## 5. Vérification

`npm run check:video-clip` — harnais `tools/video-clip-check/` :

- bornes de durée, cas dégénérés (durée inconnue, négative, `NaN`) ;
- **invariant du curseur** : toute position atteignable rend un clip plein de 30 s ;
- aucune fenêtre négative, aucune fenêtre au-delà de la limite ;
- **la propriété qui porte tout le reste** : `pseudoPhoto()` produit exactement la même géométrie qu'une photo de mêmes dimensions, à 0,2× / 0,5× / 1× / 1,7× / 5×, et le cadrage de départ est identique ;
- premier filtre de type de fichier.

Également passés après modification : `check:participant`, `check:watermark`, `check:distribution:export`, `check:frame-render`, `typecheck`, `build`.

**Ce que le harnais ne couvre pas :** le rendu lui-même — il n'y a pas de navigateur en Node. La composition réelle (lecture, capture, audio, conteneur produit) doit être vérifiée sur appareil, sur un cadre vidéo publié, en public et en lien privé.

---

## 6. Reste à faire

- **Éditeur de création de cadre vidéo** (côté créateur) — chantier suivant, explicitement reporté.
- **Vérification sur appareil** du rendu réel : MP4 produit, audio conservé et synchronisé, badge présent dans le fichier, comportement sur un téléphone d'entrée de gamme.
- **Rendu de la source vidéo dans l'éditeur créateur**, si l'on veut prévisualiser un cadre vidéo avec une vraie vidéo plutôt qu'une photo de substitution.
- **Drapeau de fonctionnalité** avant élargissement, si le taux d'échec ou la latence le justifient.

---

## 7. Ce qui n'est plus une décision ouverte

Les questions de la version précédente qui tombaient avec le rendu serveur :

- ~~taille maximale source et extrait~~ → seule la fenêtre de 30 s est rendue ; la taille du fichier source n'est pas transmise ;
- ~~conteneurs/codecs d'entrée acceptés~~ → ce que le navigateur sait décoder ; MOV, MP4, WebM en pratique ;
- ~~hébergement du worker, de la file et du stockage privé~~ → sans objet ;
- ~~durée de conservation et délai de téléchargement du résultat~~ → sans objet, rien n'est conservé ;
- ~~traitement comptable d'un échec définitif du worker~~ → sans objet.

Restent ouvertes, et le resteront jusqu'au premier test sur appareil :

- codec et dimensions réellement produits selon le navigateur, et qualité perçue ;
- comportement d'une animation de cadre plus courte que la vidéo : jouée une fois, répétée ou figée ;
- pertinence d'un plafond de taille de fichier source (mémoire du téléphone pendant l'encodage).
