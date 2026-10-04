# Grille tarifaire Campagnes — source de vérité

**Devise :** FCFA (XOF) · **Marché :** UEMOA · **Base :** grille validée par le responsable produit (3 offres)
**Statut :** cette grille **remplace** `tarifs_campagnes_v3.md` et **corrige** la page publique
`campagnes-nu.vercel.app/tarifs` (qui affiche encore 4 900 / 19 900 FCFA).

Toute modification de ce fichier doit être reflétée dans `src/lib/pricing/config.ts`.
Aucun montant ne doit exister en dur dans un composant (N3).

---

## 1. Abonnements — 3 offres

| Offre | 1 mois | 6 mois | 12 mois | Équivalent/mois | Argument affiché |
|---|---|---|---|---|---|
| **Gratuit** · Découverte | 0 FCFA | — | — | 0 | — |
| **Créateur** | 3 000 FCFA | 15 000 FCFA *(barré 18 000)* | 27 000 FCFA *(barré 36 000)* | 3 000 → 2 500 → **2 250** | 1 mois offert / **3 mois offerts** |
| **Organisations & ONG** · *Offre recommandée* | 5 000 FCFA | 25 000 FCFA *(barré 30 000)* | 45 000 FCFA *(barré 60 000)* | 5 000 → 4 167 → **3 750** | 1 mois offert / **3 mois offerts** |

**Règles d'affichage**

- Le prix barré est toujours le **total au prorata simple** (mensuel × nombre de mois), jamais un prix historique.
- **Remise maximale affichée : −25 %.** Ne jamais descendre en dessous. (6 mois = −16,7 % · 12 mois = −25 %.)
- Argument privilégié : « 1 mois offert » / « 3 mois offerts », pas un pourcentage.
- Sous le prix, afficher **le coût par participant**, c'est l'argument le plus fort :
  - Créateur : « 100 distributions incluses — soit **30 FCFA** par participant »
  - ONG : « 1 000 distributions incluses — soit **5 FCFA** par participant »

### Segmentation des fonctionnalités

| Fonctionnalité | Gratuit | Créateur | ONG |
|---|:--:|:--:|:--:|
| Création de campagnes | ✅ | ✅ | ✅ |
| Accès galerie publique | ✅ | ✅ | ✅ |
| Éditeur photo + arrière-plan | ✅ | ✅ | ✅ |
| Prévisualisation | ✅ | ✅ | ✅ |
| Partage de campagnes publiques | ✅ | ✅ | ✅ |
| Export avec filigrane `Campagnes` | ✅ | ✅ | ✅ |
| Achat de packs de distribution | ✅ | ✅ | ✅ |
| **Distributions incluses / mois** | **quota à vie** | **100** | **1 000** |
| Exports sans filigrane *(créations éligibles)* | ❌ | ✅ | ✅ |
| Campagnes personnalisées | ❌ | ✅ | ✅ |
| Statistiques de participation | ❌ | ✅ | ✅ |
| Gestion des liens de campagne | ❌ | ✅ | ✅ |
| Statistiques avancées | ❌ | ❌ | ✅ |
| Gestion de plusieurs campagnes | ❌ | ❌ | ✅ |
| Exports haute qualité | ❌ | ❌ | ✅ |
| Gestion de la distribution | ❌ | ❌ | ✅ |
| Support prioritaire | ❌ | ❌ | ✅ |

> **N5 — Attention.** Les lignes « Statistiques avancées », « Gestion de plusieurs campagnes »,
> « Exports haute qualité », « Gestion de la distribution », « Support prioritaire » sont une
> **proposition de segmentation**, pas des engagements validés. Une fonctionnalité non développée
> ne doit **jamais** apparaître sur la page tarifs. Tant qu'elle n'existe pas : la retirer de
> l'affichage, ou la marquer « Prochainement » sans date.

### Palier entreprise

Il n'y a **pas de 4ᵉ offre publiée**. Les fonctions réellement entreprise (domaine personnalisé,
galerie privée, rapports PDF, multi-utilisateurs) sont vendues **sur devis** via un bloc de contact
en bas de la page tarifs — jamais sous forme de carte avec un prix.
C'est ce qui permet de retirer le **19 900 FCFA** actuellement affiché en ligne sans perdre les
 prospects institutionnels.

---

## 2. Distribution — crédits de participation

Le partage du lien n'est **jamais** facturé. Une visite, un clic, un upload qui n'aboutit pas : rien.

| Pack | Tarif | Coût unitaire |
|---|---|---|
| 100 distributions | 2 500 FCFA | 25 FCFA |
| 500 distributions | 5 000 FCFA | 10 FCFA |
| 1 000 distributions | 7 500 FCFA | 7,5 FCFA |
| 5 000 distributions | 20 000 FCFA | 4 FCFA |
| 10 000 et plus | Sur devis | à négocier |

**Règles**

- **Une utilisation = un export réussi** (image finale composée côté serveur et remise au participant).
- Les packs sont des **crédits de participation supplémentaires**. Ce ne sont pas des frais de
  création de lien — cette nuance est un argument de vente, elle doit apparaître telle quelle dans l'UI.
- **Un pack acheté n'expire jamais** et se reporte d'une campagne à l'autre *(règle défensive, voir §7)*.
- Les durées 1 / 6 / 12 mois **ne s'appliquent pas** à la distribution. Abonnements uniquement.

### Quota inclus vs crédits achetés — la distinction qui fait tout

| | Quota inclus (abonnement) | Crédits achetés (packs) |
|---|---|---|
| Renouvellement | Mensuel | Jamais |
| Report | **Non — perdu si non utilisé** | **Oui — cumulable sans limite** |
| Portée | Toutes campagnes du compte | Toutes campagnes du compte |

C'est la seule différence, mais elle suffit à rendre les packs rationnels face à l'abonnement
(voir §7 : sans elle, 3 packs sur 4 n'ont aucun acheteur).

### Que se passe-t-il quand le quota est épuisé ?

**Dégradation douce, jamais de blocage.** La campagne continue de fonctionner, mais :

1. Les exports repassent **avec filigrane** `Campagnes` ;
2. Le participant se voit proposer le retrait à **500 FCFA / 24 h** ;
3. Un bandeau s'affiche côté organisateur : « Quota épuisé — vos participants paient 500 FCFA chacun. »

Un blocage dur tuerait la campagne et sa preuve sociale. La dégradation douce laisse la campagne
se diffuser **et** transforme chaque participant en argument de vente pour l'abonnement.

---

## 3. Suppléments au pack

| Volume | Pack Propre | Pack Sponsor |
|---|---|---|
| 100 | + 1 000 FCFA | + 2 000 FCFA |
| 500 | + 2 500 FCFA | + 5 000 FCFA |
| 1 000 | + 4 000 FCFA | + 8 000 FCFA |
| 5 000 | + 15 000 FCFA | + 30 000 FCFA |
| 10 000 + | sur devis | sur devis |

- **Pack Propre** : le filigrane est retiré pour tous les participants de la campagne.
- **Pack Sponsor** : le filigrane est remplacé par le logo de la marque.
  **Plancher de facturation : 50 000 FCFA.** Inclut la mise en place du logo et un rapport de diffusion.
- Ces suppléments se vendent **au checkout du pack de distribution**, jamais par e-mail après coup.
- Inutiles pour un compte Créateur ou ONG à jour : l'absence de filigrane est déjà incluse.
  Ils s'adressent aux comptes **Gratuit** qui achètent un pack.

---

## 4. Participant

| Produit | Prix | Conditions |
|---|---|---|
| Export propre | **500 FCFA / 24 h** | Paiement unique, sans compte, mobile money |
| Export filigrané | 0 FCFA | Illimité — c'est le canal d'acquisition |
| Export offert | 0 FCFA | Si l'organisateur est Créateur/ONG à jour, ou Pack Propre/Sponsor actif |

**Test A/B prévu :** 300 / 500 / 1 000 FCFA.

Le participant ne crée **jamais** de compte pour payer.

---

## 5. Quota Gratuit

- **25 exports filigranés, à vie, par compte** *(recommandation — à confirmer)*.
  Le quota est **par compte et non par campagne**, sinon il suffit de créer une nouvelle campagne
  pour le contourner.
- À titre de comparaison : 10 est trop court pour tester réellement, 50 trop généreux.
  **Test A/B proposé : 10 / 25 / 50.**
- Modules premium **verrouillés mais visibles** dans le produit.
- Le quota restant doit être affiché en permanence : « 7 / 25 exports utilisés ».

---

## 6. Filigrane — les trois états

| État | Apparence | Déclencheur | Payé par | Rôle |
|---|---|---|---|---|
| 1 · Défaut | `Campagnes` | Aucun paiement | personne | Canal d'acquisition gratuit |
| 2 · Payé | aucun | 500 FCFA / 24 h | le participant | Micro-revenu + preuve de valeur |
| 3 · Sponsorisé | `Offert par [Marque]` | Pack Sponsor | le sponsor | Revenu B2B |

Le filigrane est **visible dès l'aperçu d'édition**, pas seulement à l'export (N7).
Il est **toujours appliqué côté serveur** (N1).

**Définition d'une « création éligible » aux exports sans filigrane** (formule de l'offre Créateur) :
campagne appartenant à un compte **Créateur ou ONG à jour** et **dont le quota n'est pas épuisé**.
Une seule condition booléenne, évaluée côté serveur, au même endroit que le compteur (N2).

---

## 7. Le défaut de la grille, et sa correction sans changer un chiffre

**Constat.** L'offre ONG inclut 1 000 distributions pour 5 000 FCFA, soit **5 FCFA l'unité**.
Le pack de 1 000 coûte 7 500 FCFA, soit **7,5 FCFA l'unité**. L'abonnement est donc moins cher
à l'unité que le pack de taille équivalente.

Conséquences, calculées :

| Profil | Meilleur choix rationnel | Packs morts |
|---|---|---|
| Gratuit, 500 distributions | ONG à 5 000 (1 000 inclus) plutôt que le pack 500 à 5 000 | **pack 500** |
| Gratuit, 1 000 distributions | ONG à 5 000 plutôt que le pack 1 000 à 7 500 | **pack 1 000** |
| Créateur dépassant 100 | ONG à 5 000 plutôt que Créateur 3 000 + pack 2 500 = 5 500 | **pack 100** |

Autrement dit : **dès 101 distributions par mois, l'offre ONG domine strictement.**
Trois des quatre packs n'ont aucun acheteur rationnel ; le pack 100 (2 500) survit de justesse
parce qu'il reste 500 FCFA sous l'abonnement Créateur.

**Correction retenue — zéro changement de prix.**

1. **Les crédits achetés n'expirent jamais et se reportent** ; le quota inclus, lui, est perdu s'il
   n'est pas consommé dans le mois. Un organisateur au volume irrégulier achète des crédits ; un
   organisateur au volume régulier et élevé s'abonne. Les deux produits cessent de se comparer
   uniquement sur le prix unitaire.
2. **Afficher le coût par participant** (« 5 FCFA par participant ») plutôt que le volume brut.
   Le volume brut invite à la comparaison avec les packs ; le coût unitaire installe l'abonnement
   comme la référence de valeur.
3. **Ne pas afficher le pack 1 000 et le pack 500 côte à côte avec l'offre ONG** sur la même page.
   Les packs sont présentés dans le tunnel d'achat, après le choix d'une campagne — pas sur la
   page tarifs, où ils se font cannibaliser.

**Variante à considérer si vous préférez agir sur les chiffres** : ramener le quota ONG de 1 000 à
500 distributions (→ 10 FCFA l'unité, exactement le prix du pack 500). L'escalier devient :
≤ 100 → Créateur · 100–500 → packs · ≥ 500 → ONG. Cohérent, mais vous perdez l'argument
« 5 FCFA par participant », qui est le meilleur levier de vente de l'offre ONG.
**La recommandation est donc de garder 1 000 et d'appliquer la correction 1.**

---

## 8. Paiement — PawaPay (mobile money)

- **Passerelle unique : PawaPay.** Pas de CinetPay, Paydunya, Fedapay ou Stripe en passerelle
  principale. Toute proposition d'une autre passerelle doit m'être soumise.
- **Libellé public : « Mobile Money ».** Le nom « PawaPay » n'apparaît **jamais** dans l'interface,
  sur la page tarifs, ni dans les e-mails. C'est un choix de marque, pas technique.
- **Pas de carte bancaire.** L'UI de paiement ne propose ni numéro de carte, ni IBAN, ni portefeuille
  international. Un seul champ : le **numéro de téléphone**.
- **Pas de reconduction automatique.** Les durées 6 et 12 mois sont des **prépaiements**, pas des
  abonnements récurrents. Le mobile money ne garantit pas un débit récurrent fiable.
  Relance de renouvellement à **J−7**.
- Machine à états : `initiated → pending → confirmed | failed | expired`.
- Aucun export propre servi avant l'état `confirmed`, validé par **webhook serveur** (N4).
- Fenêtre de remboursement conseillée : 7 jours sur les prépaiements.

### Paramètres PawaPay — marché Burkina Faso

| Paramètre | Valeur |
|---|---|
| Devise | `XOF` |
| Pays | `BFA` (ISO 3166-1 alpha-3) |
| Décimales | **non supportées** — tous les montants sont des entiers (`"3000"`, jamais `"3000.00"`) |
| Correspondents | `ORANGE_BFA` (Orange Burkina) · `MOOV_BFA` (Moov Africa) |
| Payer | `type: MSISDN`, numéro en **E.164** : `+226 7X XX XX XX` |
| `statementDescription` | 4 à 22 caractères alphanumériques, visible par le client sur son relevé |
| Sandbox | `https://api.sandbox.pawapay.cloud` — le PIN prompt n'est pas déclenché en sandbox |

**Règles d'intégration**

1. Générer et **persister le `depositId` (UUIDv4) avant** l'appel à PawaPay — il est la seule clé de
   réconciliation en cas de perte de réponse réseau.
2. Le webhook est **asynchrone** et ne livre que des statuts finaux : `COMPLETED` ou `FAILED`.
   Vérifier la signature du callback (RFC 9421) avant toute mise à jour d'état.
3. Whitelister les IP d'émission PawaPay si un pare-feu filtre les entrants.
4. L'opérateur peut être déduit du numéro (endpoint *predict-correspondent*) puis corrigé
   manuellement par l'utilisateur. Ne jamais deviner silencieusement.
5. En cas d'absence de callback : prévoir un **polling de secours** sur *check deposit status*.
6. `depositedAmount` peut différer de `requestedAmount` (frais MMO) : journaliser l'écart,
   ne pas bloquer la commande si l'écart est inférieur au seuil défini.

---

## 9. Points ouverts et réponses retenues

| # | Question | Réponse retenue | Statut |
|---|---|---|---|
| 1 | Combien d'offres ? | **3** : Gratuit · Créateur 3 000 · ONG 5 000 | ✅ validé |
| 2 | Que devient le 19 900 FCFA affiché en ligne ? | Supprimé. Remplacé par un bloc **« Sur devis »** entreprise, sans prix | ⚠️ à corriger sur le site |
| 3 | Remises 6 / 12 mois ? | Oui : 1 mois offert (6 mois), 3 mois offerts (12 mois). Plafond −25 % | ✅ |
| 4 | Renouvellement du quota mensuel ? | **Oui, recommandé.** Sans report du quota inclus ; report illimité des crédits achetés | ⚠️ à confirmer |
| 5 | Les durées s'appliquent-elles à la distribution ? | Non. Abonnements uniquement | ✅ |
| 6 | Pack acheté une fois ou renouvelable ? | Crédits permanents, rechargeables, reportables | ✅ |
| 7 | Quel événement consomme une utilisation ? | Un export réussi | ✅ |
| 8 | Quota de test Gratuit ? | 25 exports filigranés à vie par compte (A/B : 10 / 25 / 50) | ⚠️ à confirmer |
| 9 | Fonctionnalités avancées ONG ? | Proposition de segmentation. N'afficher que ce qui est développé | ⚠️ N5 |
| 10 | Comportement à épuisement du quota ? | Dégradation douce : filigrane + paywall participant | ✅ |

---

## 10. Page publique `/tarifs` — écarts et corrections

Relevé sur `campagnes-nu.vercel.app/tarifs`. Cette section est la liste de courses de la refonte UI.

| Élément en ligne | Statut | Correction |
|---|---|---|
| `4 900 FCFA` (Creator) | ❌ obsolète | **3 000 FCFA** |
| `19 900 FCFA` (Organisation) | ❌ obsolète | **5 000 FCFA** + bloc « Sur devis » entreprise sans prix |
| Noms `Free` / `Creator` / `Organisation` | ⚠️ anglais | **Gratuit · Découverte** / **Créateur** / **Organisations & ONG** |
| Aucun sélecteur de durée | ❌ manquant | Ajouter **1 / 6 / 12 mois** |
| Aucune mention de quota | ❌ manquant | « 100 distributions incluses par mois » / « 1 000 … » |
| Aucun coût par participant | ❌ manquant | « soit 30 FCFA » / « soit **5 FCFA** par participant » |
| Badge « Popular · Meilleur rapport » sur un *pack* | ⚠️ | Le badge « Offre recommandée » va sur **Organisations & ONG** |
| Cartes de distribution affichées sur la page tarifs | ❌ | À retirer de cette page — vendues dans le tunnel d'achat (§7.3) |
| CTA « Demander un devis » sur les packs | ❌ | Devenir un vrai achat mobile money ; « devis » réservé au 10 000+ |
| « Aucun engagement, aucune surprise. Vous pouvez revenir en formule Free à tout moment. » | ⚠️ ambigu | Réécrire : prépaiement, **pas de reconduction automatique**, droits actifs jusqu'à l'échéance |
| Texte « Chargement des formules… » persistant | ❌ | Les offres sont en dur dans la config (N3) — rendu serveur, pas de suspense client |
| Ligne « Watermark : Oui / Non / Non » | ⚠️ à préciser | Gratuit « Filigrane `Campagnes` » · Créateur/ONG « Sans filigrane (quota non épuisé) » |
| 10 lignes de fonctionnalités ONG | ⚠️ N5 | Ne garder que ce qui est développé ; le reste « Prochainement » ou retiré |
| Aucune mention du moyen de paiement | ❌ manquant | Afficher « Paiement par Mobile Money (Orange, Moov) » sous chaque CTA |

**Positionnement à conserver** — il est juste et il est déjà en ligne :
« *L'abonnement paie les outils. La distribution se paie à l'usage.* »
et « *partager un lien à 10 000 personnes ne coûte rien tant que personne ne participe* ».
