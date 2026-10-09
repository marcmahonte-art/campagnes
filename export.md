# Plan d’implémentation — export participant et pass sans filigrane 24 h

## But unique

Permettre à un participant, **sans compte**, d’acheter avec **PawaPay Checkouts** un pass « Sans filigrane — 24 h ».

Le pass doit :

- être valable exactement 24 heures après confirmation du paiement ;
- fonctionner uniquement dans le navigateur qui a acheté ;
- ne pas être transféré automatiquement à un autre navigateur ou appareil ;
- interdire un nouvel achat tant que le pass est actif ;
- supprimer le filigrane uniquement pour l’export participant autorisé ;
- laisser inchangés les abonnements, les quotas, la distribution et l’éditeur.

Ce document est un plan d’exécution. Il ne signifie pas que la fonctionnalité est déjà implémentée.

---

## 1. Règles absolues

Toute personne ou tout modèle qui implémente ce plan doit respecter ces règles.

1. **Ne jamais faire confiance au navigateur pour décider du filigrane.**
2. **Ne jamais activer un pass depuis le `returnUrl` seul.** Le serveur doit confirmer le statut chez PawaPay.
3. **Ne jamais accepter un montant, une durée ou une formule envoyés par le client.** Le serveur choisit l’offre `24 h` et son prix.
4. **Ne jamais demander de compte participant.** Le pass est anonyme et lié à un navigateur.
5. **Ne jamais utiliser `user_id` pour autoriser le pass.**
6. **Ne jamais modifier le comportement des abonnements et des packs de distribution.**
7. **Ne jamais appliquer le pass aux exports du créateur dans l’éditeur.**
8. **Ne jamais appliquer le pass à la galerie ou aux images de prévisualisation.** Il concerne uniquement l’export participant après achat.
9. **Ne jamais stocker un token PawaPay dans le navigateur, dans le code client ou dans les logs.**
10. **Ne jamais déployer en production avant les tests sandbox et le build complet.**
11. Si une contrainte du dépôt contredit ce plan, **s’arrêter et vérifier le code** au lieu d’inventer une solution.

---

## 2. État actuel à connaître avant toute modification

Le projet possède déjà une intégration PawaPay, mais elle ne concerne pas ce pass.

### Paiement existant

- Client actuel : `lib/pawapay.ts`
- Produit actuel : Hosted Payment Page avec `POST /v2/paymentpage`
- Initiation actuelle : `app/api/payments/pawapay/initiate/route.ts`
- Webhook actuel : `app/api/payments/pawapay/webhook/route.ts`
- Réconciliation actuelle : `app/api/payments/pawapay/check/route.ts`
- Confirmation actuelle : `lib/pawapay-confirm.ts`
- Corridors payables : `lib/payments/corridors.ts`

Cette intégration doit continuer à fonctionner sans changement de comportement.

### Export actuel

- Parcours participant : `components/participant/participant-journey.tsx`
- Export PNG et vidéo : `lib/video-export.ts`
- Construction du descripteur participant : `lib/participant.ts`
- Politique du filigrane : `lib/watermark-policy.ts`
- Dessin du badge : `lib/watermark.ts`
- Scène visuelle participant : `components/participant/participant-stage.tsx`

Actuellement, l’export PNG et vidéo est produit dans le navigateur. Le client calcule aussi le plan d’export. Cela signifie qu’un simple changement côté client ne sécuriserait pas le pass.

### Base de données existante

La table `payments` est réservée aux achats liés à un compte ou à une campagne :

- `user_id` est obligatoire ;
- `plan` est obligatoire ;
- `purchase_type` est limité aux achats existants ;
- les contraintes existantes ne décrivent pas un achat anonyme de pass.

**Ne pas réutiliser directement `payments` pour le pass.** Utiliser une table dédiée.

---

## 3. Périmètre de la première version

### Inclus

- un seul produit : `24 h` ;
- un prix décidé côté serveur ;
- paiement PawaPay Checkouts ;
- pays validé par `lib/payments/corridors.ts` ;
- cookie HttpOnly anonyme ;
- activation après statut PawaPay `COMPLETED` ;
- export PNG participant sans filigrane ;
- retour navigateur et synchronisation différée ;
- expiration automatique ;
- blocage du deuxième achat actif ;
- tests serveur et tests de régression.

### Hors périmètre obligatoire

- durées 1 h et 6 h ;
- abonnement ou renouvellement automatique ;
- compte participant ;
- historique de facturation participant ;
- remboursement automatique ;
- paiement Hosted Payment Page pour ce nouveau produit ;
- export vidéo sans filigrane ;
- changement du fonctionnement de `/d/` ou de la distribution ;
- changement de la grille des abonnements ;
- nouvelle empreinte avancée ou collecte d’adresse IP ;
- application mobile.

### Vidéo

La vidéo reste hors périmètre de la première version parce qu’elle est actuellement produite par `MediaRecorder` dans le navigateur.

Deux choix acceptables :

- désactiver le bouton vidéo pour le pass et expliquer « Le pass 24 h concerne l’export PNG » ; ou
- conserver l’export vidéo existant avec son filigrane.

Ne jamais annoncer « sans filigrane » pour la vidéo tant qu’un rendu vidéo serveur n’existe pas.

---

## 4. Architecture cible simple

```text
Participant sans compte
  ↓
Choix du pays + clic « Sans filigrane — 24 h »
  ↓
POST /api/passes/checkout
  - valide l’offre 24 h
  - valide le pays
  - crée ou lit le cookie navigateur
  - bloque un pass actif
  - crée une commande pending
  - appelle POST /v2/checkouts
  ↓
Redirection vers redirectUrl PawaPay
  ↓
PawaPay confirme ou échoue le paiement
  ↓
Webhook Checkouts + synchronisation retour navigateur
  ↓
GET /v2/checkouts/{checkoutId}
  ↓
Si et seulement si COMPLETED : activation du pass pour ce browser_id
  ↓
Export participant
  ↓
POST /api/passes/export
  - vérifie cookie + User-Agent + pass actif
  - charge le cadre depuis le serveur
  - compose le descripteur participant
  - rend le PNG côté serveur
  - n’ajoute pas le badge
```

Le client ne reçoit jamais un droit permanent. Il reçoit uniquement une image produite après une vérification serveur.

---

## 5. Modèle de données

Créer une migration dédiée, par exemple :

```text
supabase/migrations/0024_watermark_passes.sql
```

Nom recommandé de la table : `watermark_pass_orders`.

Colonnes minimales :

```text
id                 uuid primary key
browser_id         text not null
ua_hash            text not null
provider           text not null default 'pawapay'
checkout_id        uuid not null unique
duration_h         integer not null default 24
amount             numeric not null
currency           text not null
status             text not null
starts_at          timestamptz null
ends_at            timestamptz null
created_at         timestamptz not null default now()
completed_at       timestamptz null
failure_code       text null
failure_message    text null
```

Valeurs autorisées pour `status` :

```text
pending | waiting_payment | processing | active | expired | failed | cancelled
```

Ajouter :

- un index `(browser_id, ends_at desc)` ;
- un index unique partiel sur `browser_id` lorsque `status = 'active'` ;
- RLS activée sans policy publique ;
- accès aux mutations uniquement via le client Supabase serveur/service role ;
- une fonction SQL d’expiration des pass actifs dont `ends_at < now()`.

### Important sur le navigateur

Le cookie est l’identifiant principal. Le hash du User-Agent est une protection supplémentaire.

Ce système signifie « un navigateur identifié par son cookie », pas une preuve matérielle parfaite. Ne pas utiliser une formulation plus forte dans l’interface ou la documentation.

---

## 6. Étape 1 — Créer le module métier du pass

Créer un module serveur, par exemple :

```text
lib/watermark-pass.ts
```

Ce module doit contenir uniquement la logique métier du pass :

- `PASS_DURATION_HOURS = 24` ;
- l’offre et le prix serveur ;
- le nom du cookie HttpOnly ;
- création d’un `browser_id` aléatoire ;
- hash du User-Agent ;
- lecture du pass actif ;
- expiration des pass anciens ;
- blocage d’un pass actif ;
- activation idempotente ;
- calcul de `ends_at` ;
- résolution « pass valide ou non ».

Le module ne doit pas importer React et ne doit pas décider du rendu Fabric.

### Activation idempotente

L’activation doit être portée par une transaction ou une fonction SQL verrouillée :

1. verrouiller la commande par `checkout_id` ;
2. si elle est déjà `active`, retourner succès sans rien recréditer ;
3. expirer les pass précédents ;
4. vérifier qu’aucun autre pass actif du navigateur n’existe ;
5. passer la commande à `active` ;
6. définir `starts_at = now()` et `ends_at = now() + 24 heures`.

Le `starts_at` doit correspondre à la confirmation du paiement, pas au clic initial.

---

## 7. Étape 2 — Ajouter le client PawaPay Checkouts

Créer un module séparé :

```text
lib/payments/pawapay-checkouts.ts
```

Ne pas remplacer `lib/pawapay.ts`.

Le nouveau module doit utiliser :

```text
POST /v2/checkouts
GET  /v2/checkouts/{checkoutId}
```

### Création du Checkout

Le serveur doit générer le `checkoutId` avec UUIDv4 et l’enregistrer avant l’appel PawaPay.

Paramètres attendus :

- `checkoutId` ;
- `returnUrl` ;
- `returnMethod: INSTANT` ;
- `defaultLanguage: fr` ;
- un seul pays validé ou la liste des pays réellement payables ;
- `amounts` avec le prix serveur de 24 h ;
- `expiresAfter` entre 3 et 60 minutes ;
- `clientReferenceId` non sensible ;
- métadonnées non sensibles : produit et durée.

### Règles

- Le pays vient du choix utilisateur puis passe par `resolvePaymentCountry()`.
- La devise vient du corridor résolu.
- Le montant ne vient jamais du navigateur.
- Le token PawaPay reste côté serveur.
- Une nouvelle tentative d’un même checkout doit réutiliser le même `checkoutId`.
- Une commande `pending`, `waiting_payment` ou `processing` ne doit pas provoquer la création de plusieurs paiements concurrents pour le même navigateur.

---

## 8. Étape 3 — Route d’initiation anonyme

Créer :

```text
app/api/passes/checkout/route.ts
```

Cette route est distincte de `app/api/payments/pawapay/initiate/route.ts`.

### Contrat d’entrée minimal

```json
{
  "country": "CIV"
}
```

La durée n’est pas une donnée de confiance. Elle est toujours fixée à 24 côté serveur.

### Séquence obligatoire

1. Lire le JSON sans faire confiance aux champs inconnus.
2. Résoudre le pays avec `resolvePaymentCountry()`.
3. Lire ou créer le cookie `cn_bid`.
4. Calculer le hash User-Agent.
5. Expirer les anciens pass.
6. Refuser avec `409` si un pass est actif.
7. Réutiliser une commande pending compatible, si elle existe encore.
8. Sinon créer la commande `pending` en base.
9. Appeler PawaPay Checkouts.
10. Enregistrer le résultat d’initiation.
11. Retourner uniquement `redirectUrl` et un identifiant de suivi non sensible.
12. Poser le cookie HttpOnly si nécessaire.

Ne jamais faire d’activation dans cette route.

---

## 9. Étape 4 — Callback et synchronisation

### Callback

Le webhook existant est :

```text
app/api/payments/pawapay/webhook/route.ts
```

Il traite actuellement les dépôts classiques avec `depositId`.

Deux solutions sont acceptées :

- ajouter une branche Checkouts dans cette route sans modifier la branche dépôt existante ;
- créer une route Checkouts séparée uniquement si la configuration callback PawaPay le permet sans casser l’URL existante.

La solution recommandée est la première, pour conserver le callback déjà déclaré.

### Détection

- Payload avec `depositId` : chemin existant, inchangé.
- Payload avec `checkoutId` : nouveau chemin Checkouts.

### Traitement Checkouts

Pour un callback final :

1. vérifier la signature exactement comme le webhook actuel ;
2. lire `checkoutId` ;
3. appeler `GET /v2/checkouts/{checkoutId}` ;
4. ne traiter que l’état confirmé par PawaPay ;
5. activer uniquement pour `COMPLETED` ;
6. marquer `FAILED`, `EXPIRED` ou `CANCELLED` sans activer ;
7. répondre de façon idempotente si le callback est rejoué.

Ne jamais activer à partir d’un champ envoyé par le navigateur.

### Synchronisation après retour

Créer :

```text
app/api/passes/sync/route.ts
```

Cette route publique doit :

- accepter uniquement un UUID de checkout ;
- appliquer un rate limit ;
- interroger PawaPay côté serveur ;
- appeler la même fonction d’activation que le webhook ;
- retourner uniquement l’état du pass : `pending`, `active`, `failed`, `expired` ou `not_found` ;
- ne jamais retourner d’information de compte, de campagne ou de montant sensible.

Le webhook et la synchronisation doivent utiliser **la même fonction d’activation**.

---

## 10. Étape 5 — Rendre l’export PNG serveur

Créer une route dédiée, par exemple :

```text
app/api/passes/export/route.ts
```

Runtime obligatoire :

```text
nodejs
```

### Ce que la route doit recevoir

La route reçoit seulement les données du participant nécessaires pour recomposer son visuel :

- campagne publique ou référence de distribution autorisée ;
- photo du participant ;
- placement photo ;
- style/filtre validé ;
- texte participant validé ;
- format `png`.

La route ne reçoit pas :

- `plan: creator` ;
- `watermark: false` ;
- une décision de quota ;
- un descripteur de cadre propriétaire non vérifié.

### Séquence serveur

1. Lire le cookie `cn_bid` et le User-Agent.
2. Vérifier le pass actif dans `watermark_pass_orders`.
3. Charger le cadre autorisé depuis le serveur.
4. Valider les paramètres participant avec les mêmes règles que `lib/participant.ts`.
5. Construire le descripteur avec le code partagé `composeDescriptor()`.
6. Utiliser le rendu partagé `lib/video-export.ts` ou extraire sa construction dans un module compatible navigateur et Node.
7. Ajouter le badge si le pass n’est pas actif.
8. Ne pas ajouter le badge si le pass est actif et que la requête est un export participant valide.
9. Décompter le quota existant de la campagne selon les règles actuelles.
10. Incrémenter éventuellement le compteur d’exports du pass.
11. Retourner le PNG avec `Cache-Control: no-store`.

### Refactor rendu nécessaire

Le code Fabric doit fonctionner dans deux environnements :

- navigateur pour l’aperçu ;
- Node/Vercel pour l’export serveur.

À traiter avant la route finale :

- `lib/fabric-text.ts` : supprimer la dépendance implicite à `document` ;
- `lib/fabric-image.ts` : résoudre les assets serveur ;
- `lib/fabric-shape.ts` : vérifier le chemin Node ;
- `lib/watermark.ts` : rendre le logo accessible avec `file://` ou un résolveur serveur ;
- `lib/video-export.ts` : conserver une seule logique de composition ;
- enregistrer les polices `.ttf` utilisées par le projet côté serveur.

Ne pas créer une seconde composition manuelle différente de l’aperçu.

---

## 11. Étape 6 — Modifier le parcours participant sans changer la règle serveur

Fichiers concernés :

- `components/participant/participant-journey.tsx` ;
- nouveau composant `components/participant/watermark-pass-button.tsx` ;
- nouvelle page `app/pass/retour/page.tsx`.

### Interface attendue

États :

1. **Aucun pass** : « Supprimer le filigrane — 24 h ».
2. **Paiement en cours** : message d’attente et polling.
3. **Pass actif** : date/compte à rebours d’expiration.
4. **Pass expiré** : possibilité de racheter.
5. **Échec** : message neutre et possibilité de réessayer.

Le bouton doit ouvrir le choix du pays existant, pas inventer un nouveau sélecteur incohérent.

### Export

Lorsque le pass est actif :

- le client appelle `app/api/passes/export` pour le PNG ;
- le client télécharge le fichier retourné ;
- le client ne change pas simplement `exportPlan` pour obtenir `creator`.

Pour le PNG participant, l’export local actuel doit être remplacé par l’appel serveur lorsqu’un pass est actif. Le chemin existant sans pass doit rester couvert par les tests pendant la migration.

---

## 12. Politique de filigrane

Ne pas modifier la politique globale pour faire disparaître le badge partout.

La logique doit être spécialisée ainsi :

```text
export participant + pass actif et navigateur valide → sans badge
sinon → politique existante
```

La logique doit être décidée dans un module serveur, puis utilisée par le rendu serveur.

Ne pas faire dépendre la galerie, les vignettes ou l’éditeur de `cn_bid`.

Le pass ne doit pas :

- retirer le badge d’une image de galerie ;
- modifier le badge d’un autre navigateur ;
- changer la formule du créateur ;
- modifier une campagne enregistrée ;
- donner des crédits supplémentaires.

---

## 13. Confidentialité et sécurité

Documenter le cookie `cn_bid` dans les pages de confidentialité/cookies :

- cookie HttpOnly ;
- identifiant aléatoire ;
- usage limité à l’activation d’un pass anonyme ;
- durée technique limitée ;
- aucune utilisation publicitaire ou analytique.

Ne pas ajouter :

- fingerprinting invasif ;
- stockage de numéro Mobile Money dans le cookie ;
- stockage du token PawaPay côté client ;
- données personnelles non nécessaires.

Le webhook doit conserver la vérification de signature existante.

---

## 14. Tests à écrire avant la mise en production

Créer un harnais dédié, par exemple :

```text
tools/watermark-pass-check/
```

Ajouter un script npm, par exemple :

```text
check:watermark-pass
```

### Tests métier sans réseau

- offre unique = 24 h ;
- un pass actif est reconnu avec le bon cookie ;
- absence de cookie = pas de pass ;
- User-Agent différent = pas de pass ;
- pass expiré = pas de pass ;
- pass actif bloque une nouvelle commande ;
- pass pending n’est pas encore actif ;
- activation deux fois = une seule activation ;
- `FAILED`, `EXPIRED` et `CANCELLED` n’activent jamais ;
- montant incorrect n’active jamais ;
- devise incorrecte n’active jamais ;
- paiement d’un autre `checkoutId` ne peut pas activer ce navigateur.

### Tests Checkout

- payload d’initiation conforme à PawaPay ;
- UUIDv4 généré côté serveur ;
- `countries` et `amounts` cohérents ;
- montant absent ou modifié côté client ignoré ;
- réponse `ACCEPTED` redirige ;
- réponse `REJECTED` ne crée pas de pass actif ;
- `DUPLICATE_IGNORED` réutilise la commande existante ;
- plusieurs tentatives du même checkout ne créent pas plusieurs pass.

### Tests export

- export PNG sans pass : badge présent selon la politique actuelle ;
- export PNG avec pass valide : badge absent ;
- export PNG avec cookie absent : badge présent ;
- export PNG avec cookie copié mais User-Agent différent : badge présent/refus approprié ;
- export d’un autre navigateur : badge présent ;
- galerie et vignettes inchangées ;
- éditeur créateur inchangé ;
- quota de campagne inchangé ;
- réponse export avec `Cache-Control: no-store`.

### Tests de régression obligatoires

Avant toute livraison :

```text
npm run typecheck
npm run build
npm run check:watermark
npm run check:participant
npm run check:frame-render
npm run check:payments
npm run check:webhook
npm run check:distribution
npm run check:distribution:sql
npm run check:render-server
```

Si un test existant échoue, corriger la régression avant de continuer. Ne pas désactiver un test pour faire passer le build.

---

## 15. Ordre exact d’implémentation

Ne pas tout coder en une seule fois.

### Phase A — Contrats et base

1. Ajouter la migration dédiée du pass.
2. Ajouter les contraintes et la fonction d’expiration.
3. Ajouter les types et le module métier serveur.
4. Ajouter les tests métier sans réseau.
5. Exécuter typecheck et tests ciblés.

### Phase B — PawaPay Checkouts

1. Ajouter `lib/payments/pawapay-checkouts.ts`.
2. Ajouter la route anonyme d’initiation.
3. Ajouter la branche Checkouts du callback sans casser les dépôts existants.
4. Ajouter la route de synchronisation.
5. Tester avec des réponses simulées.
6. Tester en sandbox uniquement.

### Phase C — Rendu serveur PNG

1. Corriger l’environnement Fabric Node.
2. Corriger les assets et les polices.
3. Rendre un cadre réel avec photo et texte.
4. Comparer le PNG serveur à l’export actuel.
5. Créer la route d’export serveur.
6. Ajouter les tests de présence/absence du badge.

### Phase D — Interface participant

1. Ajouter le bouton pass 24 h.
2. Réutiliser le choix de pays existant.
3. Ajouter le retour et le polling.
4. Basculer uniquement le PNG du pass vers le serveur.
5. Désactiver ou maintenir filigranée la vidéo.
6. Ajouter les messages d’erreur et d’expiration.

### Phase E — Validation finale

1. Exécuter tous les tests.
2. Exécuter le build complet.
3. Tester un paiement sandbox de bout en bout.
4. Vérifier le callback et la synchronisation.
5. Vérifier l’expiration réelle.
6. Vérifier le changement de navigateur.
7. Vérifier qu’un paiement existant fonctionne toujours.
8. Déployer seulement après preuve explicite de réussite.

---

## 16. Fichiers à ne pas modifier sans nécessité

Sauf blocage démontré par un test, ne pas modifier :

- `lib/pawapay.ts` ;
- `app/api/payments/pawapay/initiate/route.ts` ;
- `app/api/payments/pawapay/check/route.ts` ;
- `lib/pawapay-confirm.ts` pour les branches de paiement existantes ;
- `lib/payments/corridors.ts` ;
- `lib/plans.ts` ;
- les RPC de distribution ;
- le schéma de facturation des comptes ;
- les quotas de campagne ;
- les pages de l’éditeur créateur.

Si un changement de ces fichiers devient nécessaire, l’expliquer dans le commit et ajouter un test de non-régression spécifique.

---

## 17. Critères de fin

La fonctionnalité est considérée comme terminée uniquement si toutes ces phrases sont vraies :

- Un participant sans compte peut choisir son pays et ouvrir un Checkout PawaPay.
- Le prix et la durée sont fixés par le serveur.
- Un paiement non confirmé n’active aucun pass.
- Un paiement `COMPLETED` active exactement un pass de 24 heures.
- Le webhook et le retour navigateur donnent le même résultat.
- Un callback rejoué ne double pas l’activation.
- Un deuxième achat actif est refusé.
- Un autre navigateur ne récupère pas automatiquement le pass.
- Le PNG sans pass conserve la politique de filigrane existante.
- Le PNG avec pass est rendu côté serveur sans badge.
- Le client ne peut pas forcer l’absence du badge avec DevTools.
- Les quotas et paiements existants restent fonctionnels.
- Le build et tous les tests obligatoires passent.
- Aucun déploiement ou paiement réel n’est annoncé sans preuve.

**Tant que le rendu PNG serveur n’est pas sécurisé, ne pas afficher l’offre comme achetable.**
