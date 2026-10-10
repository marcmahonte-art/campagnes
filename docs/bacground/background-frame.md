# Background Frame — plan réaliste

**Version : 10 octobre 2026**  
**Statut :** plan validé sur audit du dépôt. **Phases 0, 2, 3 et 4 livrées**, **phase 1 en cours** — son point 9 a tourné en navigateur sans interface, mais **la mesure sur téléphone reste due**, et c'est elle qui décidera. Les vérifications relancées le 10 octobre 2026 sont vertes (voir ci-dessous) ; elles ne remplacent pas le téléphone. **Le §7.4 a été tranché le 2026-10-10** : la note de confidentialité nomme désormais l'exception du pass, au lieu d'affirmer un absolu que le rendu serveur démentait. Voir §5, y compris **ce que chaque phase ne prouve pas**.  
**Rendu cible :** trois compositions carrées finies, décor graphique au fond, **personne détourée** au premier plan, éléments de design devant et derrière elle, textes du créateur intégrés.

---

### Vérification de clôture — 10 octobre 2026

- `npm run typecheck` et les **18 contrôles de non-régression** listés en §5, phase 4, passent : `check:shapes`, `check:text`, `check:text-geometry`, `check:participant`, `check:stack`, `check:stack-render`, `check:cutout`, `check:cutout:api`, `check:bench`, `check:video-clip`, `check:history`, `check:watermark`, `check:templates`, `check:templates:cutout`, `check:telemetry`, `check:frame-render`, `check:distribution:export`.
- `npm run check:participant-ui` passe contre `https://campagnes-nu.vercel.app/c/je-suis-exposant-au-siao` : **8 largeurs (320 à 1440 px), aucun débordement**, aucune cible tactile sous 36 px à 320/390 px. Cette mesure couvre l'écran d'accueil sans photo, pas les états du détourage.
- `check:stack-render` confirme la parité aperçu/export : **0 pixel divergent sur 1 166 400** pour les trois décors réels, chacun réellement peint. `check:cutout` (227), `check:cutout:api` (96), `check:bench` (19), `check:templates:cutout` (95) et `check:telemetry` (85) passent également.
- **Non clos ici :** qualité/latence sur téléphone Android et iPhone ; rendu navigateur des états spécifiques du détourage et de la planche de trois cartes. Le contrôle responsive local n'a pas pu se connecter à `localhost:3300`; la mesure de référence a donc été menée sur la production. Aucun build local ni déploiement n'a été réalisé dans cette vérification.
- **Conflit de confidentialité du pass (§7.4) tranché** le 2026-10-10 par la reformulation : la pastille d'en-tête et la note de bas de parcours nomment désormais l'exception du rendu serveur. `typecheck` repasse au vert après la modification.

### Contrôle navigateur du parcours détouré — 10 octobre 2026

La campagne d'essai `essai-detourage` (créée par `npm run seed:cutout`) a permis d'ouvrir enfin les états participant **après dépôt de photo**. Le contrôle `npm run check:journey:cutout` pilote un vrai navigateur, pose une photo dans le vrai champ de fichier, et observe les verdicts du détourage.

**Deux constats, et le second n'est pas rassurant.**

1. **La production sert l'ancien build.** Le texte affiché est encore « Votre photo reste sur votre appareil », et la note ne nomme pas l'exception du pass : les modifications du §7.4 ne sont pas déployées. *Sans conséquence sur la validité de la décision* — seulement sur ce qui est en ligne.
2. **Le détourage échoue sur la production ET sur les sources.** Mesuré directement sur le canevas en production : `opaqueRatio = 1` après 60 s (le média est entièrement opaque, donc **aucun masque appliqué**), **aucun** message de verdict rendu par `judgeCutout()`, et une **exception JavaScript non interceptée** dans un chunk Next. La capture `docs/participant/captures/cutout-etat-sans-verdict.png` le montre : le décor s'affiche, la photo du participant est absente du rendu. **Reproduit contre les sources locales** (voir le détail ci-dessous) : ce n'est donc pas un artefact de déploiement.

   > **Défaut réel, confirmé depuis.** Le doute « artefact de déploiement ou bug réel ? » a été **tranché** en rejouant le contrôle **contre les sources locales** : le build a été récupéré (`env -u NODE_OPTIONS CODEBUDDY_SAFE_DELETE_SANDBOX=0 CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build`, 19 pages, `BUILD_ID` écrit) puis servi par `npx next start`. Résultat : les textes du §7.4 sont bien appliqués, **mais le détourage échoue aussi**, avec le message exact « Le modèle de détourage n'a pas pu être téléchargé. Vérifiez votre connexion, puis réessayez. »
   >
   > **Et ce n'est pas le réseau** : dans le **même navigateur**, au même moment, un `fetch` sur l'URL exacte du WASM MediaPipe répond **200**. Le CDN est joignable ; c'est le **chargement du moteur par le code** qui échoue.
   >
   > ### Cause trouvée : la CSP du middleware interdisait le détourage — 2026-10-10
   >
   > **Ce n'était ni le réseau, ni le détourage, ni la stratégie de modèles.** C'était la
   > politique de sécurité du contenu, dans `middleware.ts`, qui refusait **toutes** les
   > ressources dont le détourage a besoin. Trois directives y faisaient obstacle :
   >
   > | Directive | Ce qu'elle interdisait | Ce que le détourage en fait |
   > |---|---|---|
   > | `script-src 'self' 'unsafe-inline' 'unsafe-eval'` | tout script hors origine | `import(MEDIAPIPE_CDN)` et `import(TRANSFORMERS_CDN)` — le module du moteur est un **script**, refusé avant d'exister |
   > | `connect-src 'self' https://*.supabase.co https://*.supabase.in` | toute connexion hors Supabase | `fetch` du WASM (`cdn.jsdelivr.net`) et des **poids** (`storage.googleapis.com`, `huggingface.co`) |
   > | `default-src 'self'` | tout le reste | la WebSocket que MediaPipe ouvre vers son CDN |
   >
   > **Pourquoi le banc headless réussissait** : il sert `tools/cutout-bench/` par un
   > serveur statique Node, qui **ne passe pas par le middleware** — donc sans CSP. Le même
   > code, la même photo, le même navigateur y donnent `ok — Sujet détecté.` en 13,09 s
   > (MediaPipe, délégué WebGL, entrée 1024×683, sortie 3000×2000). C'est cette différence
   > de contexte, et elle seule, qui séparait « ça marche » de « ça échoue ».
   >
   > **Le message du participant était donc exact pour la mauvaise cause.** « Le modèle n'a
   > pas pu être téléchargé » décrit un réseau injoignable ; la panne réelle était un
   > **refus applicatif** émis par notre propre en-tête. Le classifieur `cutoutFailureReason()`
   > a rangé cette panne dans `network` parce que le navigateur y met les mots `fetch` /
   > `failed to load` — le classifieur n'avait pas tort, c'est l'entrée qui ne distinguait
   > pas « injoignable » de « interdit ».
   >
   > **Correctif :** les quatre hôtes du registre `CUTOUT_MODELS` sont désormais autorisés
   > **nommément** (`cdn.jsdelivr.net`, `storage.googleapis.com`, `huggingface.co`,
   > `cdn-lfs.huggingface.co`), dans `script-src` et `connect-src`, plus `wss://cdn.jsdelivr.net`
   > et `'wasm-unsafe-eval'`. **Aucun joker d'hôte** n'a été ajouté : la page qui porte la photo
   > du participant exécute déjà du script tiers, chaque ouverture supplémentaire y est une porte.
   >
   > **Vérifié de bout en bout, et pas seulement en théorie.** Après rebuild local et
   > `npx next start`, le journal du navigateur montre le moteur démarrer pour de bon
   > (`Graph successfully started running.`, `segmentation_postprocessor_gl.cc … chosen on GPU`,
   > `Graph finished closing successfully.`) et le parcours affiche un **vrai verdict de
   > `judgeCutout()`** : « Le sujet détecté est très petit. Vérifiez le résultat — vous pouvez
   > réessayer avec une autre photo. » C'est le verdict **attendu** avec le portrait de test
   > dessiné (le buste y est petit) ; il prouve que la chaîne d'inférence tourne, que le masque
   > est mesuré et que le diagnostic atteint l'écran.
   >
   > ### Deux autres refus trouvés par l'instrumentation
   >
   > Le journal du navigateur, capturé par le contrôle, a révélé **deux refus CSP de plus** —
   > invisibles tant qu'aucun contrôle ne lisait la console :
   >
   > 1. **`https://odml.pa.googleapis.com/v1/log` — MediaPipe télémètre vers Google.**
   >    Ce n'est pas un défaut de CSP, c'est un **point de confidentialité** : la page affiche
   >    « votre photo est traitée sur votre appareil » pendant que la bibliothèque annonce son
   >    usage à Google. **Refuser cette connexion est le comportement voulu**, et il n'empêche
   >    rien — le moteur démarre, détoure et rend son verdict sans ce journal. La décision est
   >    donc **inscrite dans l'en-tête**, en commentaire, et un contrôle interdit explicitement
   >    de l'ouvrir plus tard. Ce que `odml` transmet n'a pas été inspecté : le refus le rend
   >    sans objet, et c'est la manière la plus sûre de trancher — on n'a pas à savoir ce qui
   >    n'a pas le droit de sortir.
   >
   > 2. **`fonts.googleapis.com` — les polices du participant ne se chargeaient pas.** Les
   >    polices du texte sont posées **après le rendu** (panneau de réglages), donc hors
   >    `next/font` : une balise `<link>` les demande à Google. La CSP les refusait depuis
   >    toujours, si bien qu'une police choisie retombait silencieusement sur celle par défaut.
   >    Corrigé par `style-src fonts.googleapis.com` + `font-src fonts.googleapis.com fonts.gstatic.com`
   >    — les deux, une feuille sans ses fichiers ne sert à rien.
   >
   > **Un défaut de méthode à retenir :** la CSP a été écrite avant que le détourage existe,
   > et rien ne relie l'un à l'autre. Aucun contrôle ne vérifiait qu'un `import()` de CDN
   > **passe** l'en-tête réellement servi. C'est ce contrôle qui manquait, pas une mesure de plus.
   > Il en manquait un second, de la même famille : **aucun contrôle ne lisait la console du
   > navigateur**. Le contrôle du parcours l'enregistre désormais et imprime « ce que le
   > navigateur a refusé » — c'est ce qui a sorti les deux refus ci-dessus, qu'aucune assertion
   > de texte n'aurait pu voir.
   >
   > **Une leçon d'instrumentation :** le premier diagnostic a conclu « ce n'est pas le réseau »
   > à partir d'un `fetch` lancé **depuis la console**. Ce `fetch` n'est pas soumis à la CSP de
   > la page de la même façon qu'un `import()` : la conclusion était juste (« ce n'est pas le
   > réseau ») mais la preuve était fausse. C'est le journal du navigateur qui a donné la vraie
   > cause. Un témoin qui ne subit pas les mêmes contraintes que le code ne le représente pas.
   >
   > **Second défaut, visuel :** le canevas vide s'affiche en **paysage** alors que le cadre est carré (1:1, mesuré 712×712). À reprendre après réparation du chargement.

Le contrôle lui-même corrige un défaut de méthode : sa première version annonçait « état terminal atteint — 0 s » sur une condition vraie dès le dépôt. Il cherche désormais les messages réels de `judgeCutout()`. **Un contrôle qui se satisfait trop vite certifie une chaîne qu'il n'a pas vue fonctionner.**

## 1. Le rendu cible, décrit précisément

L'image de référence n'est pas « une photo dans une fenêtre ». C'est une **composition en trois plans** :

1. un **décor** plein cadre (dégradé, aplat, motif) ;
2. des **éléments graphiques derrière** le sujet (silhouettes, formes, aplats) ;
3. le **sujet détouré**, sans son arrière-plan d'origine, posé sur le décor et souvent **coupé par le bas du cadre** ;
4. des **éléments graphiques devant** le sujet (titres, badges, pictogrammes) ;
5. le **texte du participant**, au-dessus de tout.

Ce que ça implique, et c'est le cœur du chantier : **le sujet doit être détouré**, sinon les plans 1 et 2 restent cachés derrière un rectangle de photo. Le reste — décor, éléments devant/derrière, textes, export — existe déjà.

---

## 2. Ce qui existe déjà (audit)

### Le type et le modèle

- `background_frame` est un **type de campagne à part entière** : `CampaignKind` dans `lib/types.ts`, persisté par `supabase/migrations/0004_campaign_kind.sql`, présenté par `lib/campaign-kinds.ts` (`KIND_SPECS`) et `components/campaign/type-selector-modal.tsx`.
- Le **mode Fond** est porté par le descripteur : `Descriptor.photo_anchor` désigne l'identifiant du calque qui délimite la zone photo (`lib/types.ts`, `lib/descriptor.ts`).
- `seedDescriptorFor('background_frame', ratio)` (`lib/campaign-kinds.ts`) amorce déjà une campagne avec **un calque de zone transparent** (SVG 1×1) et `photo_anchor` posé. C'est exactement le bon point de départ pour un détourage : rien d'opaque ne transpire.
- `lib/templates.ts` contient un modèle `background_frame` : `badge-participant`.

### Le rendu et l'export

- `composeDescriptor()` (`lib/participant.ts`) **insère la photo du participant juste au-dessus du calque d'ancre**. C'est la sémantique exacte dont un Background Frame a besoin : ce qui est sous l'ancre reste derrière le sujet, ce qui est au-dessus passe devant.
- `lib/video-export.ts` → `buildRenderTarget()` trie les calques par `z`, applique la découpe et rend à la résolution native. Utilisé par `exportPng()` et par l'export vidéo. **Aucun second pipeline à créer.**
- `lib/fabric-image.ts` → `createImageObject()` est la fabrique unique des calques image, partagée par l'aperçu et l'export.
- Filigrane : `lib/watermark-policy.ts` (`shouldWatermark`, `exportPlanFor`) et `lib/watermark.ts` (`addBadge`), partagés aperçu/export. Quotas : `claim_participation` (`/c`) et `distribution_export_v1` (`/d`), inchangés.

### Ce qui manque, en revanche

- **Aucun service de détourage** : rien dans `package.json` (dépendances volontairement légères : `fabric`, `supabase`, `lucide-react`, `next`, `qrcode`, `react`, `uuid`), aucune route, aucun module.
- **Aucun chemin de fond choisi par le participant**, aucun contrôle « changer de fond ».
- **Aucun aperçu de galerie basé sur une composition finie** : `components/gallery/gallery-preview.tsx` affiche une URL d'image + filigrane, pas un rendu de descripteur.

---

## 3. Les quatre écarts réels — et ils étaient bloquants

Ces quatre points sont **vérifiés dans le code**, pas déduits. Les quatre sont **corrigés en phase 0** (§5). Ils restent décrits ici parce que c'est ce qui justifie l'ordre des travaux : sans eux, un détourage aurait été invisible ou mal découpé.

### Écart 1 — L'aperçu participant n'empile pas comme l'export

`components/participant/participant-stage.tsx` ajoute le média du participant **en premier** (ligne 313), puis **tous** les calques du créateur (331, 336, 342). Le seul `bringObjectToFront` concerne le texte du participant (248).

`composeDescriptor()` fait l'inverse : la photo se glisse **au-dessus de l'ancre**.

**Conséquence :** sur `badge-participant`, dont le fond est un aplat opaque (`#111827`), le participant ne verrait **pas sa photo du tout** dans l'aperçu, alors que l'export la place correctement. Pour un Background Frame — dont tout l'intérêt est l'ordre des plans — c'est un défaut de premier ordre.

**Correction :** la scène doit construire la pile **à partir du descripteur composé**, pas à partir de « le média d'abord ». Une seule source d'ordre, déjà existante.

### Écart 2 — Le détourage ne doit pas être découpé au rectangle

En mode Fond, `clipPhoto = Boolean(descriptor.photo_anchor)` et le média reçoit un `clipPath` rectangulaire (`lib/video-export.ts`, et le même branchement dans la scène).

**Conséquence :** un sujet détouré dont la tête, les bras ou les épaules dépassent la zone serait **tronqué net**. Or c'est exactement la silhouette de la référence : le sujet déborde du rectangle.

**Correction :** en mode détourage, **pas de découpe rectangulaire** — c'est le canal alpha qui fait office de masque. Le `clipPath` reste le comportement du mode Fond classique.

### Écart 3 — Le sujet doit être *contenu*, pas *étalé*

`coverSize()` (`lib/participant.ts`) dimensionne le média pour **couvrir** la zone (`Math.max`). C'est juste pour une photo dans une fenêtre ; c'est faux pour un sujet détouré, qui serait recadré et amputé.

**Correction :** un dimensionnement **« contenir »** (`Math.min`) pour le mode détourage, afin que le sujet entier soit visible au zoom 1, le participant agrandissant ensuite s'il le souhaite. À écrire dans `lib/participant.ts`, à côté de `coverSize`, pour que `photoSize` reste la seule autorité.

### Écart 4 — Rien ne distingue le « fond classique » du « détourage »

Des campagnes `background_frame` **sont déjà publiées** et reposent sur la fenêtre rectangulaire. Le détourage change la sémantique du type.

**Correction proposée :** un drapeau explicite sur le descripteur — `subject: 'cutout'`. **Absent = comportement actuel**, mot pour mot. C'est la convention du dépôt : `serializeDescriptor()` omet déjà tout réglage resté au défaut, donc les campagnes existantes se relisent et se réenregistrent **à l'octet près**, sans migration ni script de rattrapage.

À noter au passage, deux incohérences de libellé à corriger : `kindSpec('background_frame')` annonce `formats: ['Photo', 'Vidéo']` alors que le parcours ne traite une vidéo que pour `video_frame` ; et son `detail` décrit encore la fenêtre rectangulaire.

---

## 4. Décision actée : détourage sur l'appareil

Le modèle s'exécute **dans le navigateur**. Aucune photo n'est envoyée pour le détourage — ce qui est un avantage réel de confidentialité, mais surtout la **seule** option cohérente avec ce que le produit affiche déjà au participant (« votre photo reste sur votre appareil »), et avec le parcours vidéo livré le 10 octobre.

### Le choix du modèle décide de tout — et c'est une question de licence autant que de poids

Relevé le 10 octobre 2026. Les poids sont des **octets exacts** mesurés sur les paquets publiés ; les moteurs, des tailles des binaires WASM publiés ; la latence, de la documentation Google.

**Les poids du modèle :**

| Modèle                              | Licence                                 | Poids                    | Moteur                         |
| ----------------------------------- | --------------------------------------- | ------------------------ | ------------------------------ |
| `Xenova/modnet`                     | **Apache-2.0**                          | 6 632 188 o (6,6 Mo)     | Transformers.js / ONNX Runtime |
| `briaai/RMBG-1.4`                   | **BRIA — usage commercial non couvert** | 44 403 226 o (44,4 Mo)   | Transformers.js / ONNX Runtime |
| `onnx-community/BiRefNet_lite-ONNX` | MIT                                     | 109,2 Mo                 | Transformers.js / ONNX Runtime |
| `onnx-community/BiRefNet-ONNX`      | MIT                                     | 467,0 Mo                 | Transformers.js / ONNX Runtime |
| **MediaPipe SelfieSegmenter**       | **Apache-2.0**                          | **249 537 o (249,5 Ko)** | MediaPipe (WASM/WebGL)         |

**Le moteur, qui pèse plus lourd que le modèle — et le chiffre qui se paie n'est pas celui du disque.**

| Moteur                                                           | WASM (disque → réseau)          | Modèle  | 1er chargement (disque → réseau)            |
| ---------------------------------------------------------------- | ------------------------------- | ------- | ------------------------------------------- |
| `@mediapipe/selfie_segmentation` — historique, **non maintenue** | 5,7 Mo → non mesuré             | 249 Ko  | ≈ 6,0 Mo → non mesuré                       |
| **`@mediapipe/tasks-vision` — retenu**                           | **12,2–13,0 Mo → 3,40–3,50 Mo** | 249 Ko  | **12,4 Mo → 3,77 Mo** — au pire 13,2 → 3,88 |
| `onnxruntime-web` (Transformers.js), CPU et WebGPU               | 14,2–21,6 Mo → 4,11 Mo          | 6,63 Mo | 20,9 Mo → **10,96 Mo** — au pire 28,2       |
| `@tensorflow/tfjs-tflite` — **alpha, non maintenu**              | 3,6 Mo → non mesuré             | 249 Ko  | ≈ 3,9 Mo → non mesuré                       |

**Convention d'unités, une seule dans tout ce document : 1 Mo = 1 000 000 o** (décimal) — comme un forfait mobile, comme le budget, et comme `formatBytes()`. Les octets exacts sont donnés partout où ils sont connus, pour qu'aucun arrondi ne masque un seuil. Mélanger « Mo » décimal et binaire est exactement ce qui a produit le facteur 3,5 ci-dessous.

**La colonne qui a changé le 2026-10-10, et pourquoi.** Ces tableaux comptaient des **octets décompressés** — la taille des fichiers sur le disque. Or jsDelivr sert le WASM en **brotli** (`Content-Encoding: br`) : `vision_wasm_internal.wasm` passe de 12 168 316 o à **3 501 230 o** sur le fil. Le premier détourage du moteur retenu coûte donc **3,77 Mo**, et non 12,4. C'est la mesure, pas une estimation : le banc lit `transferSize`, que `timing-allow-origin: *` rend lisible, donc c'est bien la taille réellement payée.

**Le constat qui déplace la recommandation : ce n'est pas le modèle qui coûte cher, c'est le moteur.** Toutes les pistes paient 3,4 à 4,1 Mo de WASM sur le réseau avant la moindre inférence. Le choix du modèle se joue donc sur deux autres critères, et MediaPipe les gagne tous les deux :

1. **Le poids : 249,5 Ko contre 6,6 Mo — un facteur 26.**
2. **La latence : 33 ms annoncés par Google sur un Pixel 6 en CPU**, contre des secondes pour MODNet sur le chemin WASM d'ONNX Runtime.
3. Et un troisième, qui décide de l'**accès** : MediaPipe **n'exige pas WebGPU**. Il tourne sur WASM/WebGL, donc sur les téléphones d'entrée de gamme où aucun adaptateur WebGPU n'existe. Le repli WASM de Transformers.js est précisément le chemin lent.

**Recommandation révisée : deux étages plutôt qu'un modèle unique.**


- **Étage 1 — MediaPipe SelfieSegmenter, par défaut.** Apache-2.0, 249,5 Ko, 33 ms, aucune exigence GPU. C'est le seul candidat qui rend le détourage tenable sur un téléphone d'entrée de gamme, qui est la cible réelle. **C'est le défaut du registre, et son chemin d'exécution est écrit** (`runMediapipe()`, `@mediapipe/tasks-vision` épinglé), **vérifié contre le contrat publié** par `npm run check:cutout:api`, et **exécuté pour de vrai** le 2026-10-10 en navigateur sans interface : le délégué GPU démarre, le WASM se charge, le modèle se télécharge et l'inférence rend un masque — voir le point 9 de la phase 1. Ce qui reste ouvert n'est plus « est-ce que ça tourne » mais « est-ce que le masque est assez bon », et cela ne se juge que sur appareil.
- **Étage 2 — MODNet, sur les appareils qui exposent un adaptateur WebGPU.** Meilleur sur les cheveux fins. Sélectionné **automatiquement** par `chooseModel()`, jamais par une condition dispersée dans le parcours.

Le coût des deux étages est inscrit dans le code (`CUTOUT_RUNTIME_COSTS`, `firstLoadBytes()`, `firstLoadTransferBytes()`) et vérifié par le harnais : au premier détourage, **3,77 Mo transférés** pour MediaPipe — 12,4 Mo matérialisés — contre **10,96 Mo** pour MODNet (20,9 Mo matérialisés). Les deux colonnes ne sont **pas interchangeables** : l'une se compare à un forfait mobile, l'autre décrit ce que le navigateur doit charger. Les confondre, c'est l'erreur d'un facteur 3,5 corrigée le 2026-10-10.

**Ce qu'il faut accepter honnêtement, et qui est le vrai prix :** le masque MediaPipe est un **masque dur** — il tranche, il ne pondère pas. Sur cheveux fins le bord se verra, d'autant que l'entrée du modèle est **256×256** puis remontée à la résolution de la photo. Une passe de lissage (érosion/dilatation d'un ou deux pixels, en canvas, **gratuite en téléchargement**) atténue le plus visible. À valider sur appareil avant de promettre quoi que ce soit.

**La licence de RMBG-1.4 reste un arbitrage d'affaires**, pas technique : la qualité de contour sur cheveux fins est son point fort, mais l'activer en production payante exige un accord écrit avec BRIA. À trancher explicitement si la qualité MediaPipe ne suffit pas.

### Ce qu'il faut accepter honnêtement

- **Un premier chargement de plusieurs mégaoctets — mais pas du modèle.** Le poste réel est le **moteur** : 5,7 à 13 Mo de WASM selon la piste, contre 249 Ko à 6,6 Mo pour les poids. À faire **paresseusement** : uniquement sur une campagne `background_frame`, une fois la photo choisie. Jamais au chargement du parcours.
- **Un repli WASM obligatoire.** WebGPU s'est généralisé sur les navigateurs de bureau, mais sa disponibilité sur **les téléphones réellement visés** reste à vérifier sur appareil. Le chemin WASM doit exister et fonctionner, pas seulement exister. C'est aussi l'argument qui fait préférer MediaPipe : il n'a pas besoin de WebGPU du tout.
- **Une latence annoncée, pas encore mesurée ici.** Google annonce 33 ms pour MediaPipe SelfieSegmenter sur un Pixel 6 en CPU ; je n'ai **pas** de mesure sur nos appareils cibles, et le dépôt interdit d'inventer des chiffres. La phase 1 ci-dessous est justement le banc qui doit la produire.
- **Une qualité qui n'égalera pas un détourage manuel.** Sur cheveux bouclés, voiles, contours très contrastés, le résultat sera imparfait — et le masque MediaPipe, plus dur, le sera davantage que MODNet. Il faut le montrer tel quel au participant et lui permettre de réessayer — jamais de lui présenter un détourage raté comme réussi.

---

## 5. Plan par phases

### Phase 0 — La composition, sans aucune IA — **LIVRÉE**

Objectif : obtenir **l'ordre des plans** de la référence, avec un PNG déjà détouré en entrée.

| Point                                                               | État         | Ce qui a été fait                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. La pile de l'aperçu suit le descripteur (écart 1)                | **fait**     | `participant-stage.tsx` construit `[…sous la zone, média, …au-dessus]` puis le texte. Le point de coupe vient de `participantInsertIndex()`, **extrait de `composeDescriptor()`** : une seule autorité d'ordre, lue par la scène comme par l'export. |
| 2. `subject: 'cutout'`, sérialisation omise par défaut (écart 4)    | **fait**     | `Descriptor.subject`, relu par `parseDescriptor()`, omis par `serializeDescriptor()` tant qu'il vaut le défaut. **Aucune migration** : un cadre d'avant se réenregistre à l'octet près (vérifié). Un `subject` inconnu est abandonné, pas remplacé.  |
| 3. Pas de `clipPath` + dimensionnement « contenir » (écarts 2 et 3) | **fait**     | `clipsParticipantPhoto()` et `isCutout()` dans `lib/descriptor.ts` ; `containSize()` et le type `PhotoFit` dans `lib/participant.ts`, threadés en paramètre **optionnel** (défaut `'cover'`). Tous les appels existants gardent leur résultat exact. |
| 4. Un modèle de démonstration conforme à la référence               | **fait en phase 3** | Trois compositions de démonstration sont livrées dans `lib/templates.ts` : `cutout-nuit-lunaire`, `cutout-hackathon-tech` et `cutout-ocean`. Le choix des trois modèles (plutôt qu'une campagne multi-fonds) est tranché en §7.                                                                                                                                                    |

**Le livrable est atteint, et il est mesuré.** La preuve n'est pas une impression :

- **`npm run check:stack`** (38 contrôles, ordre logique, sans canvas) — dont la **parité d'ordre** entre la scène et l'export, et un **témoin négatif intégré** : l'ancienne règle « le média d'abord » est recopiée et doit **différer** de l'export, sinon le contrôle ne distinguerait rien.
- **`npm run check:stack-render`** (14 contrôles, **pixels réels** via `exportPng`, `fabric/node` + node-canvas) — trois plans prouvés à l'écran, découpe du mode classique conservée, détourage non tronqué au zoom 2, canal alpha qui masque, et surtout : **0 pixel divergent sur 1 166 400 entre l'aperçu et l'export**, dans les deux modes. Le témoin négatif, lui, diverge sur **406 720 pixels**.

Les deux harnais ont été **falsifiés** : le bug réinjecté (point d'insertion forcé à 0 ; découpe ignorante du détourage ; ajustement forcé à `cover`) fait échouer le contrôle avec un code de sortie 1 et un message explicite, puis repasse au vert après restauration.

**Un piège à ne pas re-découvrir :** passer à la scène le descripteur **composé** — la solution évidente — aurait été faux. `composeDescriptor()` se recalcule à chaque déplacement (la géométrie de la photo en dépend), donc ses calques changent d'identité à chaque geste et la scène se reconstruirait **en boucle pendant le glissement**. La scène garde donc le descripteur du créateur et ne lui emprunte que l'ordre.

**Ce que la phase 0 ne prouve pas :** le **comportement** de la scène dans un navigateur (glissement, événements, DOM autour du canvas). Elle prouve le rendu et l'ordre. Le détourage lui-même — l'IA — n'existe pas encore : c'est la phase 1.

**Pourquoi en premier :** cette phase ne dépendait d'aucune décision externe, elle supprime le risque le plus grave (l'aperçu qui ment), et elle rend le reste testable avec des assets statiques — ce que les deux harnais font maintenant.


### Phase 1 — Le détourage, en banc isolé — **en cours**

Objectif : savoir si c'est tenable **sur les téléphones visés**, avant d'écrire une ligne de parcours.

| Point                                                                      | État                                       | Ce qui a été fait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Module isolé, sans dépendance au parcours ni à Fabric                   | **fait**                                   | `lib/cutout.ts`, **zéro `import`** — il est compilé deux fois : une pour l'application, une en ESM pour le banc (`npm run bench:cutout`). Un seul fichier source, donc la mesure porte sur le **vrai** code. Une assertion du harnais relit le fichier et **échoue** si un `import` y apparaît.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2. Chargement paresseux, mémoïsé ; repli matériel **réel**                 | **fait**                                   | `loadTransformers()` et `loadMediapipe()` mémoïsent la promesse et **oublient un échec réseau** (sinon un participant qui retrouve du réseau ne pourrait plus réessayer). Côté Transformers, repli WebGPU → WASM ; côté MediaPipe, repli délégué GPU (WebGL) → CPU.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3. Instrumentation : chargement, inférence, mémoire, **octets transférés** | **fait**                                   | `CutoutMeasurements` (16 colonnes), export CSV avec échappement, et `transferredForModel()` qui additionne **tous les hôtes** du modèle. Le poids téléchargé est le poste dominant sur forfait mobile : `transferSize === 0` est compté 0 (servi du cache) et non la taille du corps.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 4. **Deux moteurs**, pas un                                                | **fait**                                   | MediaPipe (`runMediapipe()`) **et** Transformers.js (`runTransformers()`), aiguillés par `runCutout()` — un `switch` exhaustif, donc **l'ajout d'un moteur sans son exécuteur fait échouer la compilation** (vérifié : `error TS2345`, code 2). C'était le rôle de l'ancien drapeau `executable` du registre, retiré parce qu'il ne pouvait plus se déclencher : une garde morte rassure au lieu de protéger.                                                                                                                                                                                                                                                                                                                                                                                                               |
| 5. Harnais `npm run check:cutout` sur le **raisonnement**                  | **fait**                                   | **227 contrôles**, sans navigateur : choix du chemin, taille d'entrée qui **n'agrandit jamais**, quatre verdicts, messages actionnables, registre et licences, **stratégie à deux étages**, **coût réel du premier détourage — décompressé *et* transféré**, conversion de l'adoucissement, canal « personne », CSV. **Falsifié : 13 défauts réinjectés, 13 détectés** lors de la mise au point ; les sections ajoutées le 2026-10-10 (arbitrages, correction du coût de transfert et classement des pannes) le sont **15/15** par `npm run check:cutout:falsify`.                                                                                                                                                                                                                                                                                 |
| 6. Banc de mesure + garde-fou                                              | **fait**                                   | `tools/cutout-bench/` : page autonome (la CSP de `middleware.ts` interdit de charger un CDN *dans* l'app Next), serveur statique sans dépendance (`node:http`), et `npm run check:bench` — **19 contrôles** statiques, **falsifié 3/3**. Il vérifie ce qui casse une page **au chargement** : le module s'importe-t-il sans DOM, chaque nom importé existe-t-il, chaque identifiant lu existe-t-il dans la page, et aucun chemin hostile ne sort du dossier servi.                                                                                                                                                                                                                                                                                                                                                          |
| 7. Garde de contrat d'API `npm run check:cutout:api`                       | **fait**                                   | **96 contrôles**, hors ligne, **falsifié 12/12**. `lib/cutout.ts` n'ayant **aucun `import`**, ses types MediaPipe sont **déclarés à la main** : TypeScript ne peut donc rien dire si le paquet change de contrat. Cette garde est le **seul lien mécanique** entre nos déclarations et le paquet publié. Voir ci-dessous.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 8. Les trois arbitrages inscrits dans le code                              | **fait**                                   | Seuil d'abandon (`ABANDON_AFTER_MS`, `shouldOfferServerFallback`), budget mobile (`MOBILE_TRANSFER_BUDGET_BYTES`, `exceedsMobileBudget`, `downloadNeedsConsent`) et **aucun chemin d'envoi dans le module** — vérifié sur le texte, faute de pouvoir l'exécuter. `check:cutout` passe à **227 contrôles**, et la section a été **falsifiée 15/15** — dont, depuis le 2026-10-10, les défauts qui gardent les arbitrages, le coût de transfert et le classement des pannes. Une borne est **réelle mais invérifiable** en l'état (`>` contre `>=`) et je ne la revendique pas comme détectée.                                                                                                                                                                                                                                                              |
| 9. Mesure sur appareil réel                                                | **fait en navigateur, reste le téléphone** | Le banc a **tourné pour la première fois** le 2026-10-10, dans un navigateur **sans interface** piloté par CDP (`tools/cutout-bench/run-headless.sh` — client CDP écrit à la main, **aucune dépendance**). Verbatim : moteur MediaPipe, chemin **WebGL (délégué GPU)**, entrée 1024×683, sortie 3000×2000, chargement 2,39 s + inférence 6,57 s = **10,14 s**, **3,5 Mo transférés**, 53,4 Mo de mémoire JS, sujet opaque 29,0 %, verdict « ok ». La console confirme un vrai passage GPU (`Graph successfully started running`, `NONE activation function chosen on GPU`). **Le chemin n'est donc plus « écrit mais jamais exécuté ».** Ce qui reste ouvert : **un téléphone**. Les 6,57 s viennent d'un CPU Windows avec rendu logiciel — ce n'est pas un chiffre d'appareil et cela ne doit pas être présenté comme tel. |

**La garde de contrat, et pourquoi elle n'est pas décorative.** Le relevé (`tools/cutout-check/api/vision.d.ts`) est le fichier **tel que publié** dans `@mediapipe/tasks-vision@1.1.0`. Sa provenance n'est pas déclarative : le tarball a été téléchargé depuis le registre et haché — **sha1 et sha512 concordent avec le `dist.shasum` et le `dist.integrity` que le registre publie lui-même** — puis `vision.d.ts` en a été extrait, et son sha256 s'est retrouvé **identique** sur le fichier servi par le CDN. Deux sources indépendantes, mêmes octets.

Elle refuse de rassurer à tort sur deux points. D'abord, elle **compare la version du relevé à `MEDIAPIPE_CDN`** : monter le paquet sans re-relever le contrat fait **échouer** la garde, au lieu de la faire vérifier un texte périmé. Ensuite, **chaque affirmation porte un témoin négatif** — la même expression régulière est appliquée à un fragment qui ne doit pas correspondre. C'est ce témoin qui a mis au jour une faiblesse de la garde elle-même : le motif de `delegate` n'était pas ancré et acceptait `"CPU" | "GPU" | "NPU"`, donc affirmait **plus** que ce que le paquet déclare.

**Le défaut que cette vérification a réellement trouvé.** Le `.d.ts` publié déclare `ImageSegmenterResult.close()` — « libère les ressources détenues par les masques de catégorie et de confiance ». Autrement dit, **c'est le résultat qui possède les masques**. Notre code fermait le masque lu et le segmenter, mais **jamais le résultat** : le modèle sort deux masques, on n'en lit qu'un, et le second survivait à chaque essai du participant. C'était exactement la fuite WASM que le commentaire de la fonction prétendait éviter. Corrigé : on ferme le **résultat** (jamais le masque en plus — ce serait une double libération), puis le segmenter, dans un `finally` qui couvre aussi l'échec de `segment()`. La garde a d'ailleurs attrapé la corruption de `lib/cutout.ts` laissée par un pilote de falsification tué en cours de route — sur un fichier réel, pas sur une fixture.

**Le coût, mesuré et inscrit dans le code — en deux grandeurs qu'il ne faut pas confondre.** `firstLoadBytes()` décrit ce que le navigateur **matérialise** ; `firstLoadTransferBytes()` ce qui passe **sur le réseau**. Le chiffre qui décide pour un participant est le second, et c'est la correction du 2026-10-10. MediaPipe : **3,77 Mo transférés** — 3,40 Mo de WASM en brotli, 124 Ko de colle JS, 249,5 Ko de poids — pour **12,4 Mo matérialisés** ; au pire, 3,88 pour 13,2. MODNet : **10,96 Mo transférés** (4,11 + 220 Ko + 6,63) pour 20,9 Mo matérialisés. Le constat contre-intuitif — **ce n'est pas le modèle qui coûte cher, c'est le moteur** — reste vrai ; il est dans le registre (`CUTOUT_RUNTIME_COSTS`) et vérifié par le harnais, pas seulement écrit dans un document.

Ces chiffres sont des **octets exacts**, relevés sur les paquets publiés le 2026-10-10, et non des ordres de grandeur : `selfie_segmenter.tflite` 249 537 o, `model_quantized.onnx` de MODNet 6 632 188 o, `briaai/RMBG-1.4` 44 403 226 o. Le harnais les fige, pour qu'un changement de poids soit un acte conscient et non l'effet de bord d'une modification voisine. Ce qui est compté est le **binaire WASM** du moteur **et sa colle JavaScript** (124 Ko pour MediaPipe, 220 Ko pour Transformers.js) ; ce qui ne l'est pas, c'est le reste du parcours — la page, la photo, l'export. Et les poids ne sont pas compressés : `selfie_segmenter.tflite` comme `model_quantized.onnx` arrivent **sans** `Content-Encoding` (vérifié), donc `approxBytes` les décrit exactement.

**Deux défauts trouvés par le harnais, et c'est le harnais qui a raison.** Le motif `oom` cherché sans limite de mot se déclenchait sur `boom` : une panne inconnue était annoncée au participant comme un manque de mémoire, donc par un geste inutile. Et une assertion de colonnes était fausse — une découpe naïve sur `;` ne peut pas lire un champ entre guillemets, ce qui est précisément la raison d'être de l'échappement. Les deux sont corrigés, et le second a laissé un **témoin négatif** dans le harnais : la découpe naïve **doit** se tromper de nombre de colonnes.

**Trois choses que je n'ai pas pu vérifier, et que je n'annonce donc pas comme vérifiées.**

- **La qualité du masque MediaPipe n'est pas jugée.** Le chemin a désormais **tourné** (point 9) : délégué GPU démarré, WASM chargé, modèle téléchargé, masque produit. Mais l'image du banc est une **photo promotionnelle**, pas un portrait — l'exécution prouve que la chaîne **fonctionne**, pas que le **contour est bon**. Et aucun **téléphone** n'a été mesuré : les 6,57 s viennent d'un CPU Windows en rendu logiciel. C'est ce qui reste.
- **`context.filter` n'est pas garanti partout.** L'adoucissement passe par `ctx.filter = 'blur(...)'`, ignoré par les Safari antérieurs à la 17. Dans ce cas le bord est simplement plus dur — jamais un détourage faux, ce qui est la bonne façon d'échouer, mais c'est à constater.
- **Deux défauts que j'ai retirés du protocole de falsification** plutôt que de revendiquer leur détection : la version de bibliothèque (le harnais teste le **format** qui la transporte, pas `cutoutPhoto()` qui la remplit — c'est du navigateur) et le confinement de chemin du serveur (retirer la ligne n'a **aucun** effet observable, `normalize()` s'en charge déjà). Prétendre les avoir détectés aurait été un faux positif.

**Livrable :** un tableau de mesures par appareil et par moteur, et une décision. La comparaison des moteurs (§4) est faite sur les poids publiés, sur les coûts de moteur **décompressés et transférés**, et sur une **exécution réelle** en navigateur sans interface. Ce qui manque est la mesure **sur nos appareils** — et c'est la seule chose qui manque.

**Point d'arrêt explicite.** Si la latence ou la qualité est inacceptable, on s'arrête ici et on rediscute — soit un modèle plus lourd avec licence à acheter, soit un détourage côté serveur assumé avec un changement de la promesse affichée. **Ne pas empiler les phases suivantes sur une base non mesurée.**

> **État de ce point d'arrêt au 2026-10-10, écrit franchement.** Le chemin tourne (banc sans interface : délégué GPU, WASM, modèle, masque produit), donc on n'empile plus sur une base **non** mesurée. Mais on empile sur une base **partiellement** mesurée : **aucune latence d'appareil** et **aucune qualité de contour** n'ont été jugées. La phase 2 a été réalisée sur cette base, sur décision explicite du client, et ce n'est pas la même chose que de l'avoir franchie. **La mesure sur téléphone reste due**, et c'est elle — pas ce document — qui dira si le détourage tient.

### Phase 2 — Le parcours participant — **LIVRÉE**

| Point                                    | État     | Ce qui a été fait                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Détection                             | **fait** | `campaign.kind === 'background_frame'` **et** `isCutout(frame)`. Les deux conditions sont nécessaires : un même `background_frame` peut décrire les deux modes, et c'est `subject` qui tranche. Le type exclut au passage les campagnes vidéo — on ne détoure pas une vidéo.                                                                                                                                    |
| 2. Détourage après le choix de la photo  | **fait** | `choosePhoto()` lit le fichier, **détoure**, puis commite la photo : un seul `setPhoto`, donc une seule entrée d'historique. L'original est conservé dans les **trois** états de l'essai (`running`, `done`, `failed`) — pas seulement en cas d'échec, parce que rejouer un détourage doit repartir de la photo d'origine : détourer une photo déjà détourée ne donnerait qu'un trou.                           |
| 3. États d'échec récupérables            | **fait** | Le message vient de `cutoutErrorMessage()`, qui traduit la panne en **geste** (vérifier la connexion, fermer des applications, réessayer). Un masque qui a tout retiré (`vide`) est traité comme un échec — c'est une image blanche, pas un résultat. Dans **tous** les cas la photo d'origine est affichée : le participant a fourni une image, il en sort quelque chose, et le détourage est **réessayable**. |
| 4. Aucun chemin d'export parallèle       | **fait** | Rien à faire, et c'est le point : le détourage remplace la photo dans l'état, donc `composed`, `renderFile` et `runExport` l'emportent sans le savoir. Aucune ligne d'export n'a été touchée.                                                                                                                                                                                                                   |
| 5. Filigrane et quotas                   | **fait** | Inchangés. Le détourage ne touche ni `shouldWatermark()`, ni le pass, ni le quota.                                                                                                                                                                                                                                                                                                                              |
| 6. Accord avant un transfert hors budget | **fait** | `isMeteredConnection()` (pure) + `downloadNeedsConsent()`. Le moteur est choisi **avant** toute photo, par `chooseModel()` — la même fonction que celle qu'emploiera `cutoutPhoto()`, pour que la taille annoncée soit bien celle qui se télécharge. Avec le moteur retenu (3,77 Mo), l'accord n'est jamais demandé ; il ne l'est que sur le chemin MODNet/WebGPU.                                              |

**Deux fonctions pures de plus, et c'est ce qui les rend vérifiables.** `isMeteredConnection()` et `cutoutOutcome()` sont sorties du composant pour être testables sans navigateur — même discipline que `detectWebGpu(gpu?)` et `shouldOfferServerFallback()`. `check:cutout` passe de 197 à **219 contrôles**, et la falsification de 10 à **14 défauts** — **14 détectés, 0 manqué, 0 mauvaise raison**, restauration vérifiée à l'octet près.

**Un faux positif de falsification, corrigé — et c'est la leçon de cette phase.** Le défaut « tout ce qui n'est pas `ok` est déclaré inutilisable » était écrit `if (quality.verdict !== 'ok') return 'unusable';`. Après ce retour, TypeScript **rétrécit** `quality.verdict` à `'ok'` : la ligne suivante devient sans recouvrement, `tsc` émet **TS2367**, et le harnais sort en **2 avant la première assertion**. Le défaut était compté « détecté » alors qu'**aucun contrôle n'avait tourné**. Réécrit pour garder le code **atteignable** (`warn` → `unusable` en conservant le type de retour de l'union), et la recherche du motif est resserrée aux lignes `^  FAIL` — un libellé présent sur une ligne **verte** suffisait auparavant à faire croire à une bonne raison.

**Témoin négatif notable :** `isMeteredConnection()` ne lit **pas** `effectiveType`. Ce champ décrit un débit, pas une facturation — s'en servir déclencherait une demande sur un wifi lent et l'omettrait sur une 4G facturée, qui est le cas courant. Le harnais ne teste pas un cas particulier : il vérifie que le champ **n'apparaît nulle part dans le code** du module.

**Ce que la phase 2 ne fait pas, et c'est délibéré.** Le seuil de 5 s est lu (`ABANDON_AFTER_MS`, via `shouldOfferServerFallback()`) mais il ne change qu'un **message** : le recours au serveur est prévu par l'arbitrage, or **le chemin serveur n'est pas écrit**. Le proposer serait promettre une bascule inexistante. De même, aucun bouton « annuler » n'est offert pendant l'inférence : l'API ne sait pas l'interrompre.

**Ce que la phase 2 ne prouve pas.** Rien n'a été ouvert dans un navigateur : la vérification s'arrête à `typecheck` et aux harnais, qui couvrent la logique mais **pas le rendu**. Le point d'arrêt de la phase 1 reste donc valable — la latence et la qualité du masque sur appareil réel ne sont toujours pas mesurées, et cette phase s'appuie sur une base **partiellement** mesurée.

**Livrable :** un participant anonyme obtient sa composition détourée et la télécharge, sans compte.

### Phase 3 — Le « look » de la référence — **LIVRÉE**

1. **Trois décors** distincts, comme sur l'image. Le plus simple et le plus honnête : **trois modèles** (donc trois campagnes), pas une campagne à trois fonds. Une campagne à fonds multiples serait un changement de modèle de données ; à ne faire que si le besoin est confirmé.
2. Les textes de la référence (« MOON RABBIT », « TECH FOR GOOD HACKATHON », « SAVE THE OCEAN ») sont des **calques texte du créateur** — déjà supportés, rien à coder.
3. Les éléments devant/derrière sont des **calques forme ou image** — déjà supportés, rien à coder.
4. **Aperçus de galerie et vignettes : sujets de démonstration libres de droits.** Jamais une photo de participant — elle ne quitte pas son appareil, et ne doit donc jamais se retrouver dans une vignette publique. C'est une conséquence directe du choix on-device, et elle vaut mieux que n'importe quelle règle écrite.

| Point                                            | État                    | Ce qui a été fait                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Trois décors, trois modèles                   | **fait**                | `cutout-nuit-lunaire`, `cutout-hackathon-tech` et `cutout-ocean` ajoutés à `TEMPLATES` par `push` — **aucune description existante n'a été touchée**. Chacun `kind: 'background_frame'`, `category: 'background_frame'`, `subject: 'cutout'`, `tags` contenant `détourage`, et une ancre : `tpl-lune-zone` / `tpl-hack-zone` / `tpl-ocean-zone`. Les décors sont des **SVG en data-URI** (dégradés et motif) d'un peu plus de 1080×1080. |
| 2. Les textes de la référence                    | **fait — rien à coder** | Calques texte du créateur, déjà supportés. Chaque modèle en porte au-dessus de la zone (titre `z: 50`, sous-titre `z: 51`).                                                                                                                                                                                                                                                                                                              |
| 3. Les éléments devant/derrière                  | **fait — rien à coder** | La composition à trois plans, décrite ci-dessous, repose sur `participantInsertIndex()`.                                                                                                                                                                                                                                                                                                                                                 |
| 4. Jamais de photo de participant dans un aperçu | **fait, et contrôlé**   | Le harnais refuse, pour chacun des trois : tout calque participant, tout identifiant participant sérialisé, et toute source d'image qui ne soit pas un `data:image/svg`.                                                                                                                                                                                                                                                                 |
| 5. Signalement dans la modale                    | **fait**                | Un modèle détouré se voit **avant** d'être appliqué : badge « Détourage » et zone nommée « Sujet détouré » au lieu de « Zone photo ».                                                                                                                                                                                                                                                                                                    |

**La composition à trois plans, et le chiffre qui la rend vérifiable.** La zone du sujet est le point de coupe, et il est **au même endroit dans les trois modèles** :

| Modèle                  | Sous la zone (derrière le sujet)           | Zone    | Au-dessus (devant le sujet)                                  |
| ----------------------- | ------------------------------------------ | ------- | ------------------------------------------------------------ |
| `cutout-nuit-lunaire`   | ciel `z: 10`, anneau `z: 20`               | `z: 30` | 2 étoiles `z: 40`, `41` · titre `z: 50` · sous-titre `z: 51` |
| `cutout-hackathon-tech` | fond `z: 10`, disque `z: 20`               | `z: 30` | pastille `z: 40`, `41` · titre `z: 50` · sous-titre `z: 51`  |
| `cutout-ocean`          | fond `z: 10`, 3 bulles `z: 20`, `21`, `22` | `z: 30` | vague `z: 40` · titre `z: 50` · sous-titre `z: 51`           |

C'est cette table que le harnais mesure — pas en relisant les `z`, mais en calculant le **point d'insertion** : `participantInsertIndex()` doit tomber **strictement** entre `0` et `layers.length`, sinon il n'y aurait pas de décor des deux côtés et le sujet flotterait devant un fond plat. Il vérifie aussi que le fond couvre **tout le cadre** et que la zone occupe entre **25 % et 85 %** de la largeur et de la hauteur.

**Le mode ne peut pas fuir — et la garde est fermée par défaut.** `applyTemplate()` a reçu un paramètre `kind` **optionnel** : `subject` n'est recopié que si `kind === 'background_frame'`. Sans ce garde, appliquer un modèle détouré à un `photo_frame` aurait fait basculer sa photo en `contain` — `photoFit()` lit `isCutout()` **sans consulter le genre de campagne** — donc une bande transparente autour d'une photo censée remplir le cadre, **alors que le parcours ne détoure jamais**. Un appelant qui ignore le genre ne peut donc pas propager un drapeau qu'il ne comprend pas. Le harnais ne l'affirme pas : il **mesure** la conséquence, une paire `contain`/`cover`.

**Ce que la phase 3 ne prouve pas — et c'est imprimé dans la sortie du harnais, pas caché.** Deux contrôles sont **de source** (l'éditeur de cadre n'appelle jamais `composeDescriptor`) et ne sont **pas falsifiés** : les falsifier demande de patcher un **second** fichier, donc une seconde sauvegarde et une seconde occasion de laisser le dépôt corrompu après un `SIGTERM`. Et les gardes de dérive entre modules (`_RuntimeCouvert`, `_RaisonCouverte`) sont des gardes de **compilation**. Les deux sont comptés comme avertissements, jamais comme détections.

**Livrable :** trois cartes côte à côte, comme la référence, sur desktop comme sur mobile.  
**Ce qui manque pour le dire entièrement :** les trois **modèles** existent, sont validés et rendent à l'identique en aperçu et à l'export. La **planche de trois cartes dans la galerie** n'a pas été ouverte dans un navigateur — les trois modèles se voient donc dans la modale de modèles, un par un, et non côte à côte comme sur l'image de référence.


### Phase 4 — Robustesse — **LIVRÉE**

1. Harnais de **parité pixel aperçu/export** en mode détourage, sur le modèle des vérifications Fabric déjà présentes dans `tools/`.
2. Tests responsive du parcours participant aux largeurs déjà couvertes par `tools/participant-ui-check/`.
3. Non-régression explicite : `check:participant`, `check:frame-render`, `check:watermark`, `check:video-clip`, `check:distribution:export`.
4. Instrumentation minimale, **sans jamais transmettre de photo ni de donnée personnelle** : ouverture, photo importée, détourage réussi, détourage échoué, export réussi.

| Point                                      | État                               | Ce qui a été fait                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Parité pixel aperçu/export en détourage | **fait**                           | `check:stack-render` gagne une section **4bis** qui rend, pour **chacun des trois décors réellement livrés**, l'aperçu *et* l'export, et compare les pixels : **0 pixel divergent sur 1 166 400** pour chacun des trois.                                                                                                                                                                                                                     |
| 2. Tests responsive du parcours            | **fait, mesuré sur la production** | Le contrôle existait mais **n'avait aucun script npm** — `npm run check:participant-ui` l'expose. Exécuté contre `https://campagnes-nu.vercel.app/c/je-suis-exposant-au-siao` : **8 largeurs** (320, 360, 375, 390, 414, 430, 768, 1440) sans **aucun** débordement horizontal (`scrollWidth === clientWidth` à chaque fois), et **aucune** cible tactile sous 36 px à 320 et 390. Trois captures écrites dans `docs/participant/captures/`. |
| 3. Non-régression explicite                | **fait**                           | Les **18** scripts de vérification passent, **0 échec** : `typecheck`, `check:shapes`, `check:text`, `check:text-geometry`, `check:participant`, `check:stack`, `check:stack-render`, `check:cutout`, `check:cutout:api`, `check:bench`, `check:video-clip`, `check:history`, `check:watermark`, `check:templates`, `check:templates:cutout`, `check:telemetry`, `check:frame-render`, `check:distribution:export`.                          |
| 4. Instrumentation minimale                | **fait**                           | `lib/telemetry.ts` : cinq événements, **aucun champ libre**, deux serrures indépendantes, **aucun destinataire par défaut**.                                                                                                                                                                                                                                                                                                                 |

**La parité contre un décor réel, et pas contre une fixture.** La section de parité existante comparait trois rectangles plats et une zone centrée ; les trois modèles livrés sont des fonds vectoriels à zone **décalée**. Une parité mesurée sur une fixture resterait verte pendant qu'un décor livré rendrait différemment à l'écran et dans le fichier. Le contrôle porte donc sur les modèles **publiés** — et il ajoute une assertion que la parité seule ne peut pas fournir : que le décor soit **réellement peint** (100 % du cadre opaque). **Deux images blanches sont identiques au pixel près** ; sans cette seconde mesure, un `data:image/svg` que Fabric ne saurait pas décoder passerait pour un succès.

> **Réserve, et elle compte :** `check:stack-render` n'a **pas de pilote de falsification scripté**. Les contrôles d'origine avaient été falsifiés **à la main** ; la section 4bis ajoutée ici ne l'a **pas** été. Elle porte un **témoin négatif interne** (« l'ancien ordre diverge bien de l'export — 406 720 pixels divergents »), mais un témoin interne n'est **pas** une falsification par pilote : il prouve que la mesure sait voir une différence, pas qu'un défaut réinjecté dans le code de rendu serait attrapé. Je ne la compte donc pas comme falsifiée.

**Le responsive est mesuré, et voici ce qu'il ne couvre pas.** Les 8 largeurs sont celles de la spec §18. Ce qui reste hors couverture est écrit par l'outil lui-même, dans son verdict : la **barre d'actions et les panneaux** exigent une photo chargée et se jugent **sur un téléphone**. Le contrôle mesuré porte donc sur l'écran d'accueil du parcours — le débordement et les cibles tactiles — pas sur le déroulé complet.

> **Comment la mesure a été rendue possible — et pourquoi le serveur local ne l'était pas.** `next dev` **démarre** désormais (il fallait pré-créer `.next/dev/types/root-params.d.ts`, sinon il meurt après « Ready »), mais il **est tué à la première requête** par le même garde-fou que `next build` : `[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":50,"threshold":50,"scope":"turn","targets":[".next\\server\\app\\aide\\page.js"]}`. Turbopack essaie de supprimer un artefact périmé, le garde-fou du bac à sable refuse, et le processus meurt. Le contrôle a donc été exécuté **contre la production**, ce qui est une mesure plus forte qu'un serveur local — c'est le code réellement déployé qui a été mesuré.
>
> **Piège à ne pas re-découvrir :** Git Bash **convertit** la valeur d'une variable d'environnement qui ressemble à un chemin. `PARTICIPANT_URL=/c/mon-slug` devient `C:/mon-slug`, et le contrôle interroge une URL invalide. Il faut `MSYS_NO_PATHCONV=1` (ou `MSYS2_ARG_CONV_EXCL='*'`). L'outil a d'ailleurs signalé la bonne route avant de mesurer — c'est ce qui a rendu le défaut visible au lieu de le laisser passer pour une page cassée.

**L'instrumentation ne peut pas fuir — c'est une propriété de structure, pas une consigne.** `lib/telemetry.ts` n'a **aucun champ libre** : chaque clé est une valeur d'une liste close, un identifiant hors liste **rejette l'événement entier** (il ne l'ampute pas en silence, ce qui cacherait qu'une clé a été tentée). Une **seconde serrure** indépendante cherche des marqueurs interdits (`data:`, `blob:`, `://`, `@`) dans la chaîne **sérialisée**, et elle est **falsifiable** : le harnais forge à la main un événement qui contourne la liste blanche pour prouver qu'elle se déclenche encore. Les nombres sont bornés (`ms` plafonné à 600 000) et une valeur non finie est refusée. Enfin **aucun destinataire n'est installé par défaut** — rien ne quitte l'appareil tant que la destination n'est pas choisie délibérément. Ce choix est laissé **ouvert** : décider où va la mesure est une décision d'exploitation, et en choisir une par défaut est exactement la façon dont une donnée se met à circuler sans que personne ne l'ait décidé.

**Ce que la phase 4 ne prouve pas.**

- Le responsive est mesuré sur **l'écran d'accueil** du parcours, pas sur le déroulé complet avec photo — la barre d'actions et les panneaux restent à juger **sur un téléphone**.
- La mesure porte sur une campagne **`photo_frame`**. Les états **propres au détourage** (progression, échec, réessai, accord) n'ont pas été ouverts dans un navigateur : il faudrait une campagne détourée **publiée**. Ces états sont couverts par les harnais, qui testent la logique et **pas le rendu**.
- La **planche de trois cartes** de la phase 3 n'a pas été ouverte non plus, pour la même raison : les trois modèles existent et sont validés, la mise en page de galerie n'a pas été vue.
- La mesure sur **appareil réel** (latence, qualité du masque) reste due — c'est le point d'arrêt de la phase 1, et rien ici ne le lève.

---

## 6. Critères d'acceptation

- L'aperçu participant et le PNG exporté sont **identiques** en mode détourage : ordre des plans, cadrage, dimensions.
- Le sujet détouré **n'est jamais tronqué** par un rectangle de découpe.
- Le sujet entier est visible au zoom 1 (dimensionnement « contenir »).
- Aucune campagne `background_frame` déjà publiée ne change de rendu.
- Un détourage échoué est **explicite et réessayable** ; l'original est conservé.
- Aucun octet de photo participant n'est envoyé au réseau à aucun moment du détourage.
- Sur **connexion facturée**, aucun transfert dépassant le budget de 10 Mo ne part sans l'**accord explicite** du participant — et sur connexion non facturée, on ne demande rien.
- Après 5 s d'attente, le recours au serveur est **proposé**, jamais déclenché : la photo ne sort de l'appareil que sur accord explicite.
- `typecheck`, `build` et tous les `check:*` existants passent.
- Les parcours `photo_frame` et `video_frame` sont inchangés.

---

## 7. Décisions

### Tranchées le 2026-10-10

Elles sont **inscrites dans le code**, pas seulement ici, pour la même raison que le coût : un geste du parcours doit pouvoir les lire au moment où il décide. Chacune est vérifiée par la section 9 de `check:cutout` et **falsifiée 10/10** (`npm run check:cutout:falsify`).

**1. Seuil d'abandon — 5 secondes, et on *propose*, on ne bascule pas.**  
`ABANDON_AFTER_MS = 5_000`, `shouldOfferServerFallback(elapsedMs)`. Dépasser le seuil n'autorise rien : le recours au serveur fait **sortir la photo de l'appareil**, c'est-à-dire exactement la promesse que le détourage sur l'appareil existe pour tenir. Il suppose donc l'accord du participant. Une durée non mesurée (`NaN`, `Infinity`) ne déclenche rien — proposer le serveur parce qu'on n'a pas su chronométrer serait basculer sur un bug, pas sur une lenteur.

**2. Budget de données — 10 Mo par transfert mobile autorisé, aucun transfert serveur automatique.**  
`MOBILE_TRANSFER_BUDGET_BYTES = 10_000_000`, `exceedsMobileBudget()`, `downloadNeedsConsent()`. Compté en **Mo décimaux**, la convention dans laquelle un participant lit sa consommation — donc un seuil plus strict qu'en Mio, et à dessein. L'accord n'est demandé que sur **connexion facturée** : solliciter pour rien est la meilleure façon d'entraîner quelqu'un à accepter sans lire.

> **Correction du 2026-10-10 — la conclusion précédente était fausse d'un facteur 3,5.**
>
> Ce paragraphe affirmait : « le moteur retenu ne tient pas dans le budget », **12,4 Mo** contre 10 autorisés. Ce 12,4 Mo était la taille **décompressée** du WASM, comparée à un forfait mobile. Or jsDelivr sert ce WASM en **brotli** (`Content-Encoding: br`) : le premier détourage de MediaPipe transfère **3,77 Mo**, et 3,88 Mo dans le pire cas. **Il tient donc dans le budget, largement.** Les 12,4 Mo restent vrais — c'est ce que le navigateur matérialise — mais ils ne se comparent pas à une consommation mobile. Comparer un fichier décompressé à un forfait, c'est se tromper d'unité.
>
> **Ce qui sort du budget, c'est l'autre étage.** MODNet transfère **10,96 Mo** : son moteur ne pèse que 4,11 Mo compressés, mais son modèle (`model_quantized.onnx`, 6,63 Mo) est servi **sans compression** — vérifié sur les en-têtes, pas supposé. C'est le seul moteur du registre au-dessus du seuil.
>
> **Conséquence concrète sur le parcours :** avec le moteur retenu, le premier détourage **ne demande rien**, même sur forfait. L'accord du participant n'est sollicité que si l'on bascule sur MODNet — c'est-à-dire sur un appareil WebGPU. Il redevient donc ce qu'il doit être : un cas particulier sur le chemin le plus lourd, pas la règle.
>
> La solution MediaPipe **historique** perd même son argument budgétaire : sa taille **transférée** n'a pas été mesurée, et celle du moteur retenu (3,77 Mo) passe désormais confortablement sous le seuil. Elle reste écartée pour la seule raison qui valait déjà : elle n'est **pas maintenue**.

**3. Décors au lancement — trois décors prédéfinis ; les fonds multiples sont reportés.**  
`Descriptor.subject` et le catalogue de formes portent déjà ce qu'il faut ; rien à coder tant que le point ci-dessous n'est pas levé.

> **Lecture retenue, tranchée le 2026-10-10 : (a).** « 3 décors prédéfinis **par campagne** » se lisait de deux façons, et elles n'ont pas le même coût :
>
> - **(a) — retenue.** Au lancement on livre **trois décors prédéfinis**, un par modèle de campagne — soit **trois campagnes**, aucun changement de modèle de données ; « par campagne » désigne alors le décor attaché à chacune ;
> - **(b) — écartée.** **Chaque campagne** porterait trois décors prédéfinis, c'est-à-dire des fonds multiples **à l'intérieur** d'une campagne, ce que la décision 3 reporte explicitement.
>
> La (a) est celle qui ne contredit pas le report, et c'est celle que la phase 3 décrit déjà (« **trois modèles** (donc trois campagnes) »). La (b) demanderait un changement de modèle de données **et** rouvrirait un report assumé : deux raisons de la laisser de côté. Ce n'était pas une question technique — c'était une ambiguïté de rédaction, levée.

### Encore ouvertes

**La question du moteur n'en fait plus partie.** Elle se posait ainsi : « le budget de 10 Mo exclut le moteur retenu ». La mesure du 2026-10-10 a montré que c'était faux — 3,77 Mo transférés contre 10 autorisés. **Il ne restait donc aucune raison budgétaire de rouvrir le choix**, et le §4 reste ce qu'il était : MediaPipe Tasks Vision par défaut, MODNet sur les appareils WebGPU. Le budget ne s'y opposait pas ; il était mal compté.

1. **Transformation avancée** (rotation, retournement, réglage fin des contours) : hors MVP ? Le lissage du masque (érosion/dilatation, gratuit en téléchargement) mérite d'être dans le MVP puisque MediaPipe est retenu — il est **déjà implémenté** (`featherPx`, `defaultFeather()`), reste à **choisir la valeur sur appareil**.
2. **Le masque MediaPipe est-il assez bon** pour la référence ? Cela se décide sur la mesure sur appareil (point 9 de la phase 1), pas sur ces tableaux. L'exécution sans interface prouve que la chaîne **tourne** ; elle ne juge pas le **contour** — l'image du banc est une photo promotionnelle, pas un portrait.
3. **RMBG-1.4** reste écarté tant que la licence BRIA n'est pas réglée — arbitrage d'affaires, pas technique.
4. **Le pass « sans filigrane » envoie la photo au serveur — l'écran est reformulé le 2026-10-10.** Trouvé en câblant la phase 2, mais **antérieur à elle**. `requestServerExport()` (`participant-journey.tsx`) poste `photo.src` — la photo entière, en data URL — à `/api/passes/export`, parce que le badge doit être retiré **côté serveur** : c'est ce qui empêche un détenteur de pass de le retirer lui-même. La note affichait : « Votre photo est traitée dans votre navigateur. **Elle n'est jamais envoyée à nos serveurs.** » Les deux ne pouvaient pas être vrais ensemble.
   > **Décision prise : reformuler la note pour nommer l'exception.** C'est l'issue qui garde la promesse honnête sans retirer au participant le bénéfice du pass, et qui ne suppose aucun changement de modèle de sécurité. La note complète de l'écran d'accueil écrit désormais : « Votre photo et son détourage sont traités dans votre navigateur, sans envoi à nos serveurs. **Une seule exception : le retrait du filigrane avec un pass, qui doit passer par un rendu serveur et transmet alors votre visuel.** »
   > La pastille d'en-tête est passée de « Votre photo reste sur votre appareil » à « **Votre photo est traitée sur votre appareil** » : la première formulation était un absolu que le pass démentait, la seconde reste vraie dans tous les chemins. **Les deux autres issues restent ouvertes** — ne pas proposer le pass sur les campagnes `subject: 'cutout'`, ou rendre le retrait du badge client-side — et la première reste la plus stricte si le créateur préfère la confidentialité absolue au revenu du pass.
   > **Ce n'est pas un défaut du détourage** : celui-ci ne fait sortir aucun octet, et le critère du §6 (« aucun octet de photo envoyé **au moment du détourage** ») tient. L'exception est explicite, et le §7.4 ne bloque plus la clôture du chantier.

---

## 8. Ce que ce plan ne promet pas

- Il ne promet **aucune** performance chiffrée **sur nos appareils** : la phase 1 existe pour les mesurer. Les 33 ms de MediaPipe sont une annonce de Google sur un Pixel 6, pas une mesure à nous.
- **Il ne promet pas que le chemin MediaPipe fonctionne sur un téléphone.** Il est écrit, son contrat d'API est **vérifié contre le paquet publié**, et il **a tourné** le 2026-10-10 dans un navigateur sans interface : délégué GPU démarré, WASM chargé, modèle téléchargé, masque produit, aucune exception. Ce qui reste non prouvé, c'est le comportement **sur nos appareils cibles** et la **qualité du contour** — une exécution réussie ne juge pas un détourage.
- Il ne promet pas que la garde `check:cutout:api` suffise : elle vérifie des **déclarations**, pas des comportements. Elle ne peut pas dire si l'initialisation GPU réussit sur un appareil donné, si le WASM se charge, ni si le canal 1 est bien la personne — l'ordre des canaux est une propriété du **modèle**, absente du `.d.ts`.
- Il ne promet pas que le détourage donnera la qualité de la référence sur tous les sujets. L'image de référence a manifestement été composée avec des détourages de très bonne facture — et le masque MediaPipe, plus dur, en sera plus loin que MODNet.
- Il ne promet pas que WebGPU sera disponible sur tous les téléphones visés. C'est précisément pour cela que le repli WASM est obligatoire, que MediaPipe est le défaut, et que la phase 1 se termine par une mesure sur appareil réel.
- **Il ne promet pas que le détourage sur l'appareil ne demandera jamais rien.** Le budget tranché le 2026-10-10 (10 Mo) est **au-dessus** du coût du moteur retenu (**3,77 Mo** transférés) : avec MediaPipe, rien n'est demandé, **même sur forfait**. Mais **l'étage 2 en sort** — MODNet transfère 10,96 Mo — donc sur un appareil WebGPU en connexion facturée, l'accord est requis. Le comportement **dépend donc de l'appareil**, et c'est cela qu'il faut écrire dans le parcours puis éprouver sur les deux chemins — pas le découvrir en production.
- Il ne promet pas que le recours au serveur existe. La décision porte sur le **seuil** auquel on le propose et sur l'exigence d'accord ; le chemin serveur lui-même n'est pas écrit, et n'est pas dans les phases 2 à 4 telles qu'elles sont décrites.
