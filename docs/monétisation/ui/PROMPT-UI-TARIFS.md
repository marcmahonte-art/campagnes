# Prompt — Refonte de l'interface tarifs Campagnes (PawaPay / Mobile Money)

> **Usage** : ouvrir ce fichier à la racine du dépôt Campagnes, copier-coller le bloc `PROMPT`
> dans le chat de l'agent, puis exécuter **phase par phase** (un `GATE` = un arrêt pour validation).
>
> **Source de vérité unique** : `.agent/skills/monetisation-campagnes/references/grille-tarifaire.md`
> (ou `.agents/skills/...` selon votre arborescence). Ce prompt ne contient volontairement que les
> montants nécessaires à la lecture humaine : l'agent **doit** lire le fichier avant d'écrire du code.
>
> **Paiement** : PawaPay, présenté à l'utilisateur comme **Mobile Money**. Aucune carte bancaire.

---

## PROMPT (à coller)

```
# RÔLE

Tu es un ingénieur front-end senior, spécialisé produit et conversion, travaillant sur **Campagnes**
(campagnes.app, SARLU MPIXEL AGENCY, Ouagadougou). Application **Next.js (App Router)** déployée sur
Vercel. Devise **FCFA (XOF)**. Marché **Burkina Faso / UEMOA**.

Ta priorité absolue est le **mobile**. Plus de 85 % du trafic arrive sur un smartphone Android
d'entrée de gamme, en 3G. Chaque arbitrage se fait en faveur du mobile, de la sobriété du bundle et
de la lisibilité en plein soleil.

# OBJECTIF

Refondre l'interface de monétisation, en commençant par la page publique
**`campagnes-nu.vercel.app/tarifs`**, pour l'aligner sur la nouvelle grille tarifaire, puis propager
la correction à toutes les surfaces qui affichent un prix.

Deux chantiers indissociables :

1. **Les montants et le positionnement.** La page en ligne affiche encore 4 900 et 19 900 FCFA,
   des noms d'offres en anglais, aucun quota, aucune durée autre que le mois, et des packs vendus par
   « Demander un devis ».
2. **Le paiement.** Tout se paie désormais en **Mobile Money via PawaPay**. L'interface de paiement
   doit être pensée pour un utilisateur qui n'a jamais payé en ligne, qui n'a pas de carte bancaire,
   et qui va recevoir un prompt PIN sur son téléphone.

# SOURCE DE VÉRITÉ

Fichier : `.agent/skills/monetisation-campagnes/references/grille-tarifaire.md`
(à défaut `.agents/skills/monetisation-campagnes/references/grille-tarifaire.md`)

1. **Lis ce fichier en entier avant d'écrire la moindre ligne de code.** Il contient les 3 offres,
   les durées 1/6/12 mois, les quotas, les packs de distribution, les suppléments, le prix
   participant, le quota Gratuit, les paramètres PawaPay et la liste des corrections de la page
   publique (§10).
2. **Il est la seule référence.** Si ce prompt et le fichier divergent, le fichier gagne.
3. **Tu ne modifies aucun montant.** Si un montant te semble incohérent, tu t'arrêtes et tu le
   signales au lieu de le corriger.
4. Sections à lire en priorité : §1 (offres), §2 (distribution), §7 (le défaut de la grille et sa
   correction), §8 (PawaPay), §10 (écarts de la page publique).

# ÉTAT ACTUEL DE LA PAGE — ET CORRECTIONS À APPLIQUER

Relevé fait sur la page en production. C'est ta liste de courses.

| Actuellement en ligne | Correction |
|---|---|
| `4 900 FCFA` (Creator) | **3 000 FCFA** |
| `19 900 FCFA` (Organisation) | **5 000 FCFA** + bloc « Sur devis » entreprise, sans prix |
| Noms `Free` / `Creator` / `Organisation` | **Gratuit · Découverte** / **Créateur** / **Organisations & ONG** |
| Aucun sélecteur de durée | Ajouter **1 / 6 / 12 mois** |
| Aucun quota affiché | « 100 distributions incluses par mois » / « 1 000 … » |
| Aucun coût par participant | « soit 30 FCFA par participant » / « soit **5 FCFA** par participant » |
| Badge « Popular · Meilleur rapport » posé sur un *pack* | Le badge « Offre recommandée » va sur **Organisations & ONG** |
| 5 cartes de distribution affichées sur la page tarifs | À retirer de cette page (voir §Distribution ci-dessous) |
| CTA « Demander un devis » sur les packs | Vrai achat Mobile Money. « Devis » réservé au 10 000+ |
| « Aucun engagement, aucune surprise… » | Réécrire : prépaiement, **pas de reconduction automatique**, échéance affichée |
| « Chargement des formules… » au premier rendu | Offres en dur dans la config — rendu serveur, zéro suspense client |
| Ligne « Watermark : Oui / Non / Non » | Gratuit « Filigrane Campagnes » · payants « Sans filigrane (quota non épuisé) » |
| 10 lignes de fonctions avancées ONG | Ne garder **que ce qui est développé** : retirer, ou marquer « Prochainement » sans date. En cas de doute, retirer. |
| Aucune mention du moyen de paiement | « Paiement par Mobile Money (Orange, Moov) » sous chaque CTA |

**À conserver tel quel** — ce positionnement est juste et déjà en ligne :
« *L'abonnement paie les outils. La distribution se paie à l'usage.* »
et « *partager un lien à 10 000 personnes ne coûte rien tant que personne ne participe* ».

# SPÉCIFICATION DE LA PAGE /tarifs

## 1. Sélecteur de durée

- Trois positions : **1 mois · 6 mois · 12 mois**. Défaut : 1 mois.
- À 6 mois : prix total affiché, prix barré = prorata simple (mensuel × 6), argument **« 1 mois offert »**.
- À 12 mois : prix total affiché, prix barré = prorata simple (mensuel × 12), argument **« 3 mois offerts »**.
- Afficher aussi **l'équivalent par mois** en petit sous le total (ex. « soit 2 250 FCFA / mois »).
- **Ne jamais afficher de pourcentage de remise** au-delà de −25 %. L'argument est « X mois offerts »,
  pas un pourcentage. Les acheteurs sont des ONG qui doivent justifier la dépense.
- Le sélecteur est un groupe de boutons accessible (radio / `role="tablist"`), utilisable au pouce.

## 2. Les trois cartes — et seulement trois

Chaque carte contient, dans cet ordre :

1. Nom de l'offre (+ sous-titre de cible : « Pour les indépendants », « Pour les ONG, entreprises… »).
2. Prix, au format **« 3 000 FCFA »** puis **« / mois »** en plus petit.
3. Le quota : « **100 distributions incluses par mois** » / « **1 000 distributions incluses par mois** »
   / pour le Gratuit « **25 exports à vie** ».
4. Le **coût par participant** en gras : « soit **30 FCFA** par participant » /
   « soit **5 FCFA** par participant ». C'est l'argument le plus fort de la page, il ne doit pas être
   relégué en bas de carte.
5. La liste des fonctionnalités — uniquement celles qui existent (N5).
6. Le CTA.

- **Gratuit** : CTA « Commencer gratuitement ».
- **Créateur** : CTA « Payer avec Mobile Money ».
- **Organisations & ONG** : badge **« Offre recommandée »** + CTA « Payer avec Mobile Money ».
- Sous chaque CTA payant : « Paiement par Mobile Money (Orange, Moov) · sans carte bancaire ».
- Une seule carte peut porter le badge « recommandée » : Organisations & ONG.
- **Aucune 4ᵉ carte.** Le 19 900 FCFA disparaît.

## 3. Distribution — à sortir de la page tarifs

Les cartes Starter / Popular / Growth / Large / Grand volume **ne restent pas** sur cette page :
affichées côte à côte avec l'offre ONG, elles se font cannibaliser (l'abonnement ONG revient moins
cher à l'unité que le pack de taille équivalente — voir §7 de la grille).

Remplacer par **un bandeau compact** :

- Titre : « La distribution se paie à l'usage. »
- Une phrase : « Le partage du lien est gratuit. Vous ne payez que les participations réellement
  exportées — de **25 à 4 FCFA par participant** selon le volume. »
- Préciser la règle qui fait la valeur des crédits : « Les crédits achetés **n'expirent jamais** et
  se reportent d'une campagne à l'autre. Le quota inclus, lui, est mensuel. »
- Un bloc replié `<details>` « Voir la grille des crédits » contenant le tableau des 5 paliers
  (100 → 2 500 · 500 → 5 000 · 1 000 → 7 500 · 5 000 → 20 000 · 10 000+ sur devis), **fermé par défaut**.
- CTA : « Acheter des crédits » → redirige vers le tunnel d'achat dans le tableau de bord.

## 4. Bloc entreprise « Sur devis »

En bas de page, **sans carte et sans prix** : domaine personnalisé, galerie privée, rapports PDF,
multi-utilisateurs. CTA « Nous contacter » vers bonjour@campagnes.app, mention « Réponse sous
48 heures ouvrées ». Conserver le bloc « Un volume qui ne figure pas dans la grille ? » pour le 10 000+.

## 5. Matrice fonctionnelle

- Renommer les colonnes : **Gratuit · Créateur · Organisations & ONG**.
- Corriger la ligne filigrane : Gratuit « Filigrane `Campagnes` » · Créateur et ONG
  « Sans filigrane — tant que le quota n'est pas épuisé ».
- Passer la matrice au crible de N5 : **toute ligne qui correspond à une fonctionnalité non
  développée est retirée**, ou marquée « Prochainement » sans date. Ne pas inventer.
- La section « Les modules premium, un par un » est conservée : les modules verrouillés restent
  **visibles**, c'est ce qui crée l'envie.

## 6. Réassurance

Remplacer le texte ambigu « Aucun engagement, aucune surprise » par une formulation exacte :
« **Prépaiement sans reconduction automatique.** Vos droits restent actifs jusqu'au [date
d'échéance]. Vous recevrez un rappel 7 jours avant. » Aucune mention de prélèvement récurrent.

## 7. Format et mise en page

- Nombres : espace fine insécable entre milliers — **« 3 000 FCFA »**, pas « 3000 FCFA » ni « 3,000 ».
  Utiliser `Intl.NumberFormat('fr-FR')`, jamais un formatage maison.
- **Mobile d'abord** : concevoir à 360 px, puis étendre. Les cartes s'empilent en colonne unique.
  Aucun défilement horizontal. Cibles tactiles ≥ 44 px. Contraste ≥ 4.5:1.
- Aucun décalage de mise en page au chargement (CLS ≈ 0) : les prix sont rendus côté serveur,
  pas chargés en asynchrone.
- Aucun script tiers ajouté. Aucune police lourde. Le budget de la page est serré.

# PAIEMENT — PawaPay, présenté comme Mobile Money

## Règles d'interface

1. **Un seul champ : le numéro de téléphone.** Pas de carte, pas d'IBAN, pas de portefeuille
   international, pas de formulaire d'adresse.
2. Préfixe pays **+226** affiché en dur à gauche du champ, indicatif national attendu (8 chiffres).
   Un sélecteur de pays est autorisé mais doit rester secondaire.
3. **Opérateur** : détection automatique à partir du numéro (endpoint *predict-correspondent*) avec
   correction manuelle possible. Deux opérateurs sur ce marché : **Orange** et **Moov**.
   Ne jamais deviner silencieusement sans laisser le choix à l'utilisateur.
4. Le mot « **PawaPay** » n'apparaît **jamais** dans l'interface, ni sur la page tarifs, ni dans les
   e-mails. On dit **Mobile Money**.
5. Après soumission, écran d'attente explicite : « **Une demande de validation a été envoyée sur votre
   téléphone. Composez votre code PIN pour confirmer.** » + minuteur + bouton « Je n'ai rien reçu ».
   L'utilisateur doit comprendre que l'action se passe sur son téléphone, pas dans le navigateur.
6. États visibles : `initiated` → `pending` → `confirmed | failed | expired`.
   Le succès n'est affiché qu'après **validation par webhook serveur** — jamais sur la seule réponse
   d'initiation.
7. Messages d'échec en français, actionnables : solde insuffisant · numéro non reconnu · délai dépassé ·
   paiement refusé · opérateur indisponible. Toujours proposer une action de sortie
   (« Réessayer » / « Continuer avec le filigrane » pour le participant).
8. Pour le paywall participant (500 FCFA / 24 h) : **aucune création de compte**, aucun e-mail
   obligatoire. Le re-téléchargement dans la fenêtre de 24 h est gratuit.

## Paramètres techniques PawaPay

| Paramètre | Valeur |
|---|---|
| Devise | `XOF` |
| Pays | `BFA` |
| Décimales | **non supportées** — montants entiers (`"3000"`, jamais `"3000.00"`) |
| Correspondents | `ORANGE_BFA` · `MOOV_BFA` |
| Payer | `type: MSISDN`, numéro en **E.164** (`+2267XXXXXXX`) |
| `statementDescription` | 4 à 22 caractères alphanumériques |
| Sandbox | `https://api.sandbox.pawapay.cloud` — pas de prompt PIN en sandbox |

1. Générer et **persister le `depositId` (UUIDv4) avant** l'appel PawaPay : c'est la seule clé de
   réconciliation en cas de perte de réponse réseau.
2. Le webhook ne livre que des statuts **finaux** (`COMPLETED` / `FAILED`). Vérifier la signature du
   callback avant toute mise à jour d'état. Whitelister les IP d'émission PawaPay.
3. Prévoir un **polling de secours** sur *check deposit status* si aucun callback n'arrive.
4. Journaliser l'écart entre `requestedAmount` et `depositedAmount` (frais opérateur).
5. Clés d'API côté serveur uniquement, jamais exposées au client.

# CONTRAINTES NON NÉGOCIABLES

- **N1.** Le filigrane est appliqué **côté serveur**. Aucun actif non filigrané servi sans paiement
  validé serveur. Si la composition finale se fait aujourd'hui dans le navigateur : vulnérabilité
  bloquante, tu t'arrêtes et tu le signales.
- **N2.** Un seul point de vérité pour le compteur de distribution et pour le filigrane : la route
  d'export.
- **N3.** **Aucun prix en dur dans un composant.** Toutes les offres, durées, packs, quotas et
  suppléments viennent d'un unique fichier de configuration typé (`src/lib/pricing/config.ts`).
- **N4.** Aucun paiement affiché comme confirmé sans **webhook serveur** validé.
- **N5.** Aucune fonctionnalité affichée si elle n'est pas développée.
- **N6.** Aucun script publicitaire, aucune régie display.
- **N7.** Le filigrane est visible dès l'aperçu d'édition, pas seulement à l'export.
- **N8.** Le partage privilégie **WhatsApp**, puis Facebook. Jamais Twitter/X en premier.
- **N9.** Aucun montant en dur. Aucun `4 900`, aucun `19 900` ne doit survivre dans le dépôt.
- **N10.** L'UI de paiement ne propose **que** le Mobile Money. Pas de carte bancaire.
- **N11.** Le nom « PawaPay » n'apparaît jamais côté utilisateur. On dit « Mobile Money ».
- **N12.** Aucune reconduction automatique, aucun prélèvement récurrent. Prépaiement uniquement.

# MÉTHODE

- Produis un **plan** avant d'écrire du code, et un **rapport de vérification** à la fin de chaque phase.
- Utilise le navigateur intégré : captures à **360 px** et **1440 px** à chaque phase.
- À chaque `GATE`, **arrête-toi et attends ma validation.**
- Si tu découvres une violation de N1–N12 dans le code existant, arrête-toi et signale-la.

---

## PHASE U0 — Audit de l'interface (aucune modification)

1. Relevé exhaustif de **toutes les surfaces** qui affichent un prix, un quota ou un moyen de
   paiement : page `/tarifs`, page d'accueil, tableau de bord, modale d'export participant, tunnel
   d'achat de crédits, e-mails transactionnels, pages légales. Donne fichier et ligne.
2. `grep -rn "4900\|4 900\|19900\|19 900\|CinetPay\|Paydunya\|Fedapay\|Stripe" src/ public/`
   — liste complète des occurrences obsolètes.
3. Localise le composant des formules. Explique pourquoi la page affiche
   « Chargement des formules… » : les offres viennent-elles d'une base, d'un CMS ou du code ?
   Dis si le contenu peut être rendu côté serveur.
4. Vérifie s'il existe déjà une intégration de paiement, et laquelle.
5. Captures de la page `/tarifs` à 360 px et 1440 px, **avant** modification.

**Sortie** : `docs/audit-ui-tarifs.md` + 2 captures.
**GATE U0** → je valide avant toute modification.

---

## PHASE U1 — Configuration et page /tarifs

1. Crée `src/lib/pricing/config.ts` : 3 offres × 3 durées, quotas mensuels, grille de distribution,
   suppléments, prix participant, quota Gratuit, paramètres PawaPay. Types TypeScript exportés.
2. Refonds `/tarifs` : sélecteur de durée, 3 cartes, bandeau distribution, bloc « Sur devis »,
   matrice fonctionnelle corrigée, réassurance reformulée. **Rendu serveur, plus de suspense client.**
3. Corrige 4 900 → 3 000 et 19 900 → 5 000 + bloc sans prix.
4. Retire les cartes de distribution de cette page (bloc replié à la place).
5. Applique N5 sur la matrice : liste ce que tu retires et pourquoi.

**Sortie** : config + page refondue + captures 360/1440 px + liste des lignes retirées (N5).
**GATE U1** → je valide les montants, les libellés et le rendu mobile.

---

## PHASE U2 — Paiement Mobile Money

1. Écran de paiement : numéro (+226), opérateur, montant, récapitulatif de la période
   (« Créateur · 6 mois · 15 000 FCFA · valable jusqu'au … »).
2. Appel d'initiation PawaPay avec `depositId` persisté avant l'appel. Montants entiers, XOF, BFA.
3. Écran d'attente avec minuteur, message PIN, et issue de secours.
4. Webhook signé + mise à jour d'état + polling de secours. Aucun succès sans webhook.
5. Messages d'échec actionnables. Journalisation des écarts de montant.
6. Aucune clé d'API côté client. Tests en sandbox.

**Sortie** : écran de paiement + intégration + webhook + captures des 4 états.
**GATE U2** → je valide le tunnel en sandbox.

---

## PHASE U3 — Propagation

1. Tableau de bord : bandeau de quota « 18 / 100 distributions utilisées ce mois-ci » + solde de
   crédits achetés + date d'échéance du prépaiement.
2. Modale d'export participant : 500 FCFA / 24 h, sans compte, Mobile Money, issue
   « Continuer avec le filigrane ».
3. Bandeau organisateur : « Quota épuisé — vos participants paient 500 FCFA chacun. »
4. Page d'accueil, e-mails, pages légales : alignement sur la nouvelle grille et sur le Mobile Money.
5. Suppression de toute référence résiduelle à un ancien moyen de paiement.

**Sortie** : surfaces alignées + captures.
**GATE U3** → je valide.

---

## PHASE U4 — Qualité

1. Checklist d'acceptation ci-dessous, exécutée et **documentée résultat par résultat**.
2. Performance mobile : Lighthouse mobile ≥ 90 en Performance et Accessibilité, CLS < 0,1.
3. Test de non-contournement (N1) : appel direct à l'API sans paiement → image filigranée.
4. Vérification qu'aucun prix n'est en dur (N3/N9).

**Sortie** : rapport de vérification.
**GATE U4** → fin.

---

## CHECKLIST D'ACCEPTATION

```
[ ] grep -rn "4900\|19900" src/ public/   →  0 résultat
[ ] grep -rn "4 900\|19 900" src/ public/ →  0 résultat
[ ] grep -rn "CinetPay\|Paydunya\|Fedapay" src/ → 0 résultat
[ ] grep -rn "PawaPay\|pawapay" src/components src/app → 0 résultat (N11 : jamais dans l'UI)
[ ] grep -rnE "[0-9]{3,}" src/components  →  aucun montant en dur (N3/N9)
[ ] Exactement 3 cartes tarifaires, aucune 4ᵉ, aucun prix sur le bloc entreprise
[ ] Sélecteur 1 / 6 / 12 mois fonctionnel, prix barré = prorata simple
[ ] Aucune remise affichée > −25 %
[ ] « 100 / 1 000 distributions incluses par mois » visible
[ ] « soit 30 FCFA » / « soit 5 FCFA par participant » visible
[ ] Badge « Offre recommandée » uniquement sur Organisations & ONG
[ ] Aucune carte de distribution sur la page tarifs
[ ] Nombres au format « 3 000 FCFA » (espace fine insécable)
[ ] « Paiement par Mobile Money (Orange, Moov) · sans carte bancaire » sous chaque CTA payant
[ ] Aucune mention de prélèvement automatique ou de reconduction
[ ] Matrice : aucune fonctionnalité non développée présentée comme disponible (N5)
[ ] Pas de « Chargement des formules… » au premier rendu (contenu rendu serveur)
[ ] Champ de paiement = numéro de téléphone uniquement, préfixe +226
[ ] Écran d'attente avec mention du code PIN
[ ] Succès affiché uniquement après webhook serveur (N4)
[ ] Rendu validé à 360 px ET 1440 px, sans défilement horizontal
[ ] Lighthouse mobile : Performance ≥ 90 · Accessibilité ≥ 90 · CLS < 0,1
[ ] Test de non-contournement du filigrane : OK
```

---

## CE QUE TU NE DOIS PAS FAIRE

- Ne pas modifier un montant de la grille sans me le demander explicitement.
- Ne pas afficher le mot « PawaPay » ni aucun logo de passerelle dans l'interface.
- Ne pas proposer de paiement par carte bancaire.
- Ne pas implémenter de reconduction automatique ni de prélèvement récurrent.
- Ne pas afficher de remise supérieure à −25 %.
- Ne pas remettre les cartes de distribution sur la page tarifs.
- Ne pas publier de 4ᵉ offre avec un prix.
- Ne pas conserver « Demander un devis » sur un pack achetable directement.
- Ne pas promettre une fonctionnalité non développée.
- Ne pas ajouter de script tiers, de police lourde ou de régie publicitaire.
- Ne pas déplacer la composition d'image côté client.
- Ne pas valider un paiement sur la seule réponse d'initiation.
```

---

## Variante courte — pour une itération rapide

À utiliser quand la structure existe déjà et qu'il ne s'agit que de corriger l'existant :

```
Corrige l'interface de Campagnes pour l'aligner sur
`.agent/skills/monetisation-campagnes/references/grille-tarifaire.md`.

Source de vérité : ce fichier, et lui seul. Lis-le avant de coder. Ne modifie aucun montant.

À corriger :
1. `/tarifs` : 4 900 → 3 000 FCFA, 19 900 → 5 000 FCFA + bloc « Sur devis » sans prix.
   Noms d'offres : Gratuit · Découverte / Créateur / Organisations & ONG.
2. Ajouter le sélecteur 1 / 6 / 12 mois, les quotas inclus (100 / 1 000 par mois) et le
   coût par participant (30 FCFA / 5 FCFA). Badge « Offre recommandée » sur Organisations & ONG.
3. Retirer les cartes de distribution de la page tarifs, les remplacer par un bandeau compact
   avec la grille repliée par défaut.
4. Paiement : PawaPay, présenté comme « Mobile Money ». Un seul champ : numéro de téléphone,
   préfixe +226, opérateurs Orange et Moov, XOF, montants entiers, pays BFA.
   Le mot « PawaPay » n'apparaît jamais dans l'UI. Pas de carte bancaire.
5. Toute la matrice fonctionnelle passe au crible : aucune fonctionnalité non développée ne doit
   être présentée comme disponible.
6. Aucun prix en dur dans un composant. Aucune reconduction automatique.

Contraintes : filigrane appliqué côté serveur · aucun paiement confirmé sans webhook ·
aucun script tiers · rendu serveur (pas de « Chargement des formules… ») · mobile d'abord à 360 px.

Arrête-toi et signale toute violation de ces contraintes dans le code existant.
Fais une capture à 360 px et à 1440 px avant et après.
```

---

## Ordre d'exécution conseillé

| Ordre | Fichier | Quand |
|---|---|---|
| 1 | `references/grille-tarifaire.md` | Déjà à jour — la relire (§8 PawaPay, §10 corrections) |
| 2 | `PROMPT-UI-TARIFS.md` | **Maintenant** — refonte de l'interface |
| 3 | `PROMPT-ANTIGRAVITY.md` | Ensuite — compteur, filigrane, paywall participant, packs |
