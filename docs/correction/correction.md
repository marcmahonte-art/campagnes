

\# CORRECTION — LIEN PRIVÉ DE DISTRIBUTION

\#\# CONTEXTE

Dans l'écran de gestion d'une campagne, nous avons actuellement :

\- « Adresse publique »  
\- « Lien de participation »  
\- « Lien privé de distribution »

Le problème est que :

\- « Adresse publique » et « Lien de participation » pointent tous les deux vers \`/c/:slug\`  
\- ils représentent donc actuellement le même lien ;  
\- le bloc « Lien privé de distribution » avait été masqué à cause d'un ancien commentaire indiquant que la migration \`0009\` n'était pas appliquée ;  
\- la migration \`0009\` est maintenant appliquée ;  
\- \`create\_distribution\_link\` existe en base ;  
\- \`generatePrivateLink()\` existe déjà ;  
\- la route \`/d/\[token\]\` existe ;  
\- la résolution d'un token privé fonctionne ;  
\- la création d'un lien privé est protégée par authentification ;  
\- la RLS de \`distribution\_links\` doit rester active.

Le backend et la majorité de la logique existent déjà.

Le travail demandé est donc principalement de \*\*réactiver, corriger et fiabiliser l'expérience de distribution privée\*\*, sans recréer un système parallèle.

\---

\# OBJECTIF

À la fin :

\#\#\# L'adresse publique

\`\`\`text  
/c/:slug

doit être clairement identifiée comme :

> Adresse publique

Elle correspond à la page publique de la campagne.

---

### **Le lien de distribution privée**

/d/:token

doit être clairement identifié comme :

> Lien privé de distribution

Il permet de distribuer la campagne à un public déterminé avec les règles de distribution privées.

Ces deux liens doivent être clairement différenciés dans l'interface.

---

# **1\. ANALYSER AVANT DE MODIFIER**

Avant toute modification :

1. Lire l'architecture du projet.  
2. Lire la page de gestion de campagne concernée.  
3. Identifier le composant qui affiche :  
   * Adresse publique  
   * Lien de participation  
   * Lien privé de distribution  
4. Identifier `generatePrivateLink()`.  
5. Identifier `create_distribution_link`.  
6. Identifier la table `distribution_links`.  
7. Identifier la route `/d/[token]`.  
8. Identifier le service utilisé pour résoudre un token.  
9. Vérifier la migration `0009`.  
10. Vérifier les politiques RLS de `distribution_links`.  
11. Vérifier le système actuel de quota.  
12. Vérifier comment les liens existants sont récupérés au chargement d'une campagne.

NE PAS coder avant cette analyse.

---

# **2\. SUPPRIMER L'AMBIGUÏTÉ ENTRE LES LIENS**

Actuellement :

Adresse publique  
/c/mon-campagne

Lien de participation  
/c/mon-campagne

Cela crée une confusion.

Le produit doit avoir une terminologie claire.

## **Adresse publique**

Afficher :

### **Adresse publique**

Description :

> Lien public de votre campagne.

URL :

/c/:slug

Actions :

* Copier  
* Ouvrir

---

## **Lien de participation**

Si « Lien de participation » pointe exactement vers `/c/:slug`, NE PAS afficher deux fois le même lien.

Choisir une seule représentation.

La préférence est :

> conserver « Adresse publique »

et supprimer le doublon « Lien de participation » de cet écran.

NE PAS supprimer une fonctionnalité métier ailleurs si « Lien de participation » est utilisé dans un autre contexte.

Avant suppression, rechercher toutes ses utilisations.

---

# **3\. RÉACTIVER LE LIEN PRIVÉ**

Réactiver le bloc précédemment masqué.

Il ne doit plus dépendre de l'ancien commentaire concernant la migration `0009`.

Le bloc doit utiliser les fonctions existantes.

Ne pas recréer :

* une nouvelle table ;  
* une nouvelle RPC ;  
* un nouveau service ;  
* une nouvelle route.

---

# **4\. INTERFACE DU LIEN PRIVÉ**

Créer une interface claire :

┌──────────────────────────────────────────────┐  
│ Lien privé de distribution                  │  
│                                              │  
│ Distribuez votre campagne sans la rendre    │  
│ publique.                                    │  
│                                              │  
│ Nombre d'utilisations                        │  
│ \[ 1000 \]                                     │  
│                                              │  
│ \[ Générer le lien privé → \]                 │  
└──────────────────────────────────────────────┘

Le champ quota doit être explicite.

Label :

> Nombre d'utilisations

Placeholder / valeur par défaut raisonnable :

1000

Le quota doit être un nombre entier positif.

Validation :

* minimum : 1  
* pas de valeur négative  
* pas de texte  
* pas de valeur vide lors de la génération  
* empêcher les valeurs absurdes si le backend possède déjà une limite

Utiliser les contraintes existantes du backend si elles existent.

---

# **5\. RÈGLE IMPORTANTE SUR LE QUOTA**

NE PAS faire :

participants\_granted

comme quota automatique du lien privé.

Le quota du lien privé est indépendant du quota de participation de la campagne.

Le créateur doit choisir explicitement :

distribution quota

Donc :

generatePrivateLink({  
  campaignId,  
  quota  
})

et NON :

generatePrivateLink({  
  campaignId,  
  quota: campaign.participants\_granted  
})

Respecter l'invariant existant :

> participants\_granted et distribution\_links.quota ne mesurent pas la même chose.

---

# **6\. APRÈS GÉNÉRATION**

Après création réussie, afficher :

Lien privé de distribution

campagnes.app/d/Ab8xK...

1 000 utilisations  
0 / 1 000 utilisées

\[ Copier le lien \] \[ Ouvrir \]

Ajouter éventuellement :

> Ce lien permet de distribuer la campagne selon le quota défini.

Ne pas afficher de jargon technique.

---

# **7\. PERSISTANCE DU LIEN**

C'est un point CRITIQUE.

Actuellement `privateLink` semble être uniquement conservé dans l'état local de l'interface.

Cela signifie :

Génération  
↓  
privateLink en mémoire  
↓  
Refresh  
↓  
privateLink disparaît de l'écran

Alors que le lien existe toujours en base.

CORRIGER ce comportement.

Au chargement de la page de campagne :

1. rechercher le lien privé existant associé à la campagne ;  
2. récupérer ses informations ;  
3. afficher le lien existant ;  
4. afficher son quota ;  
5. afficher son nombre d'utilisations ;  
6. afficher son statut ;  
7. afficher son expiration si cette donnée existe.

NE PAS créer automatiquement un nouveau lien au chargement.

---

# **8\. RÈGLE SUR LE NOMBRE DE LIENS**

Avant de modifier le modèle de données, vérifier le comportement actuel de `distribution_links`.

Déterminer si le système est conçu pour :

### **Option A**

Un seul lien privé actif par campagne.

ou :

### **Option B**

Plusieurs liens privés par campagne.

NE PAS inventer cette règle.

Lire :

* migration ;  
* contraintes SQL ;  
* service ;  
* RPC ;  
* code existant.

Puis respecter le modèle déjà implémenté.

Si le système prévoit un seul lien privé actif :

Campagne  
 ├── Adresse publique  
 │    /c/:slug  
 │  
 └── Distribution privée  
      /d/:token

Si plusieurs liens sont déjà supportés :

Campagne  
 ├── Adresse publique  
 │    /c/:slug  
 │  
 └── Liens privés  
      ├── /d/token-1  
      ├── /d/token-2  
      └── /d/token-3

Dans ce deuxième cas, ne pas supprimer les liens existants.

---

# **9\. RÉGÉNÉRATION**

Ne pas afficher :

> Régénérez-le

si aucun bouton de régénération n'existe réellement.

Le texte de l'interface doit refléter exactement le comportement réel.

Si une fonctionnalité de régénération existe déjà, vérifier :

* ce qu'elle fait de l'ancien token ;  
* si l'ancien token est révoqué ;  
* si l'ancien lien continue de fonctionner ;  
* comment cela est enregistré en base.

NE PAS créer une régénération approximative.

Si la fonctionnalité n'existe pas :

ne pas afficher de bouton « Régénérer ».

---

# **10\. AFFICHAGE DU QUOTA**

Afficher clairement :

Quota  
1 000 utilisations

et si les données sont disponibles :

Utilisations  
127 / 1 000

Calculer le nombre à partir des données backend existantes.

NE PAS confondre :

* visites de `/d/:token`  
* téléchargements  
* participations  
* utilisations du lien

Une utilisation doit respecter la définition métier déjà présente dans le système.

---

# **11\. EXPIRATION**

Si `distribution_links` possède déjà une date d'expiration :

l'afficher.

Exemple :

Expire le 15 novembre 2026

Si le lien est expiré :

Lien expiré

et désactiver l'action appropriée.

NE PAS inventer une logique d'expiration si elle n'existe pas encore.

---

# **12\. ÉTATS UI**

Prévoir les états :

### **Aucun lien**

Lien privé de distribution

Distribuez votre campagne à un public déterminé.

Nombre d'utilisations  
\[ 1000 \]

\[ Générer le lien privé → \]

### **Génération**

Génération...

Le bouton doit être désactivé pendant la requête.

### **Succès**

Afficher le lien.

### **Erreur**

Afficher une erreur utilisateur claire.

Exemple :

> Impossible de générer le lien. Veuillez réessayer.

Ne pas afficher d'erreur SQL brute.

### **Lien existant**

Afficher directement le lien récupéré depuis la base.

---

# **13\. SÉCURITÉ**

Conserver absolument :

* authentification pour créer un lien ;  
* RLS ;  
* token difficile à deviner ;  
* accès public uniquement via le token ;  
* aucune exposition de données privées dans l'URL ;  
* aucune possibilité de créer un lien privé en tant qu'anonyme.

NE PAS désactiver RLS pour faciliter le fonctionnement.

NE PAS déplacer la sécurité côté client.

Le serveur doit rester la source de vérité.

---

# **14\. ROUTE /d/\[token\]**

Ne pas modifier cette route si elle fonctionne déjà.

Vérifier simplement que :

/d/:token

continue de :

1. résoudre le token ;  
2. retrouver la campagne ;  
3. vérifier son statut ;  
4. vérifier quota / expiration si applicable ;  
5. permettre l'expérience de participation prévue ;  
6. appliquer les règles de watermark / export prévues pour la distribution privée.

Ne pas dupliquer le workflow participant.

---

# **15\. URL**

Créer ou réutiliser un helper unique pour construire :

/c/:slug

et

/d/:token

Éviter de reconstruire les URLs manuellement dans plusieurs composants.

Exemple conceptuel :

getPublicCampaignUrl(slug)

getPrivateDistributionUrl(token)

Utiliser la source unique existante du projet si elle existe déjà.

---

# **16\. ANALYTICS**

Réutiliser l'analytics existant.

Si les événements existent déjà, ne pas en créer de nouveaux inutilement.

Sinon, prévoir au minimum :

distribution\_link\_generate  
distribution\_link\_copy  
distribution\_link\_open  
distribution\_download

Ne pas collecter de données personnelles supplémentaires.

---

# **17\. TESTS À FAIRE**

Créer ou adapter les tests existants.

## **Test 1 — Public**

/c/:slug

fonctionne.

## **Test 2 — Création anonyme**

Une requête anonyme vers `create_distribution_link` doit être refusée.

## **Test 3 — Création authentifiée**

Un utilisateur authentifié peut créer un lien selon les permissions existantes.

## **Test 4 — Résolution**

/d/:token

résout correctement la campagne.

## **Test 5 — Token inconnu**

Un token inexistant ne doit pas exposer une campagne.

## **Test 6 — RLS**

Une lecture non autorisée de `distribution_links` ne doit pas exposer les données privées.

Ne jamais désactiver RLS dans la version finale.

## **Test 7 — Quota**

Le quota envoyé à la création doit provenir du champ de quota du lien privé.

Il ne doit PAS provenir automatiquement de :

participants\_granted

## **Test 8 — Refresh**

Créer un lien :

Générer  
↓  
Refresh

Le lien doit toujours apparaître si le modèle de données prévoit sa persistance.

## **Test 9 — Build**

npm run build

doit passer.

## **Test 10 — TypeScript**

Le contrôle TypeScript doit passer.

---

# **18\. NE PAS CASSER L'EXISTANT**

IMPORTANT :

NE PAS :

* refaire le backend ;  
* recréer `distribution_links` ;  
* recréer `create_distribution_link` ;  
* recréer `/d/[token]` ;  
* supprimer la RLS ;  
* modifier inutilement la migration `0009` ;  
* modifier le workflow public ;  
* modifier l'éditeur ;  
* modifier les exports existants ;  
* modifier les campagnes existantes ;  
* changer le design system global.

Réutiliser les composants, services, RPC et conventions existants.

---

# **19\. CRITÈRE FINAL**

À la fin, sur l'écran de campagne, l'utilisateur doit comprendre immédiatement :

ADRESSE PUBLIQUE  
Votre campagne publique  
/c/ma-campagne  
\[ Copier \] \[ Ouvrir \]

DISTRIBUTION PRIVÉE  
Distribuez votre campagne à un public déterminé.

Nombre d'utilisations  
\[ 1000 \]

\[ Générer le lien privé → \]

Après génération :

DISTRIBUTION PRIVÉE

campagnes.app/d/Ab8xK...

1 000 utilisations  
0 / 1 000 utilisées

\[ Copier le lien \] \[ Ouvrir \]

Après actualisation de la page :

campagnes.app/d/Ab8xK...

doit toujours être récupérable depuis la base.

---

# **ORDRE D'EXÉCUTION**

1. Analyse du code existant.  
2. Vérification migration 0009\.  
3. Vérification RPC.  
4. Vérification RLS.  
5. Vérification `distribution_links`.  
6. Vérification `/d/[token]`.  
7. Vérification du modèle de quota.  
8. Correction du doublon « Adresse publique / Lien de participation ».  
9. Réactivation du bloc privé.  
10. Ajout du quota explicite.  
11. Persistance/récupération du lien existant.  
12. Correction des libellés.  
13. Tests de sécurité.  
14. Tests de quota.  
15. Test refresh.  
16. TypeScript.  
17. Build.  
18. Vérification finale du rendu.

Avant chaque modification importante, privilégier le code existant plutôt que créer une nouvelle abstraction.

À la fin, fournir un résumé très court :

* fichiers modifiés ;  
* comportement corrigé ;  
* tests exécutés ;  
* résultat du build ;  
* éventuels points restant à traiter.

