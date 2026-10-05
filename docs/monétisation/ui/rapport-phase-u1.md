# Rapport de phase U1 — refonte de `/tarifs`

> **Source de vérité** : `docs/monétisation/ui/grille-tarifaire.md`.
> Aucun montant n'a été modifié : les 3 offres, les durées, les quotas et les
> paliers sont repris **tels quels** de la grille. Les seules corrections portent
> sur la **présentation**, la **source unique** et l'**honnêteté de l'affichage**.

- **Date** : 2026-10-05
- **Base** : `master` @ `f3c7ae5` + arbre de travail U1
- **Méthode** : lecture de la grille, `tsc --noEmit`, `npm run build`,
  serveur de production local (`next start`, port 3300), Chrome headless via CDP,
  et **contrôles falsifiables** (un contrôle qui ne peut pas échouer ne prouve rien).

---

## 0. Verdict

| Exigence U1 | État | Preuve |
|---|---|---|
| Config unique `lib/pricing/config.ts` | ✅ | N3 : 0 montant en dur |
| 3 offres × 3 durées | ✅ | `check-selecteur-duree` (clics réels) |
| Sélecteur 1 / 6 / 12 mois | ✅ | idem + témoin négatif |
| Prix barré = prorata simple | ✅ | idem (15 000 / 18 000 etc.) |
| Aucune remise > −25 % | ✅ | idem (16,7 % et 25 %) |
| Quotas affichés | ✅ | `check-rendu-tarifs` |
| Coût par participant affiché | ✅ | idem |
| Badge sur ONG uniquement | ✅ | 1 occurrence mesurée |
| Distribution hors des cartes | ✅ | bandeau + `<details>` replié |
| Bloc entreprise sans prix | ✅ | aucune carte, aucun montant |
| Matrice N5criblée | ✅ | §3 ci-dessous |
| Rendu serveur, zéro suspense | ✅ | `/tarifs` prérendu, 3,2 kB |
| 360 px et 1440 px sans débordement | ✅ | sonde CDP + témoin négatif |
| 3 000 FCFA / 5 000 FCFA | ✅ | §2 ci-dessous |
| 4 900 / 19 900 éliminés | ✅ | N9 : 0 occurrence |

**Aucun montant de la grille n'a été modifié.** Aucun montant n'a été **ajouté**.

---

## 1. Ce que la phase a corrigé

Le travail U1 avait été écrit dans l'arbre de travail mais **n'était pas
conforme** : le harnais échouait, et l'interface disait des choses fausses. Les
corrections ci-dessous ont été faites **après** cette lecture, pas avant.

### 1.1 Un prix faux affiché à l'écran

La carte affichait le **prix mensuel équivalent** comme gros nombre, même quand la
période selectedn'était pas un mois. Concrètement, en 6 mois, la page annonçait :

> **15 000 FCFA** ~~18 000 FCFA~~ · soit 2 500 FCFA / mois

Le gros nombre est le **total prépayé**, pas un prix mensuel. Worst encore, le
suffixe « **/ mois** » restait visible : la page affichait « 15 000 FCFA / mois »
pour une formule qui coûte 2 500 FCFA par mois. **Cinq fois le prix réel.**

Corrigé : le suffixe « / mois » n'existe plus qu'à un mois d'engagement. Il est
désactivé par le sélecteur (`pricing-controls.tsx`) et l'est déjà au rendu serveur
(`plan-card.tsx`).

> Ce défaut ne se voyait pas dans le code : les deux composants étaient
> individuellement cohérents. Il n'apparaît qu'en regardant la page **dans l'état
> 6 mois**, d'où la mesure par clic réel plutôt qu'une relecture.

### 1.2 Les quotas n'étaient pas affichés sur les cartes

`quotaLabel` existait dans la config mais n'était rendu que pour la formule
Gratuite (« 25 exports filigranés inclus à vie », écrit en dur dans le JSX).
Les cartes Créateur et ONG ne montraient **ni le quota, ni le coût par
participant dans le bon ordre**. Le coût par participant était là ; le quota, non.

Corrigé : chaque carte affiche, dans l'ordre prévu par le prompt — quota, puis
coût par participant.

### 1.3 Nombres en dur dans la matrice comparative

`COMPARISON` (dans `lib/plans.ts`) contenait `'100 / mois'`, `'1 000 / mois'`,
`'30 FCFA'`, `'5 FCFA'`, `'0 FCFA'`, `'25 à vie'`. Six montants recopiés à la
main dans une **seconde** source de vérité : le jour où la grille bouge, la
matrice afficherait l'ancien chiffre pendant que les cartes afficheraient le
nouveau.

Corrigé : les cinq lignes chiffrées lisent `PRICING_PLANS`.

### 1.4 Métadonnées de page avec les prix en dur

`metadata.description` contenait « 3 000 FCFA » et « 5 000 FCFA » en toutes
lettres. C'est le premier endroit du dépôt à afficher un prix, et le seul que le
moteur de recherche indexe — donc le plus durable.

Corrigé : la description est **composée** depuis la config.

### 1.5 Deux passes tarifaires contradictoires sur la page

Avant, la page disait « Ce que contient chaque formule — Toutes les
fonctionnalités cochées sont garanties », puis listait 10 lignes dont une
dizaine n'était pas développée. La promesse et la liste se contredisaient.

Corrigé : l'accroche dit explicitement que seules les fonctions disponibles sont
listées, et la liste a été réduite (§3).

### 1.6 Lien mort « Recharger un pack » → `/tarifs`

Supprimé : un bouton qui renvoie à la page qu'on regarde. Remplacé par « Acheter
des crédits » vers le tableau de bord, avec `whitespace-nowrap` — sans lui, le
CTA se coupait en deux lignes dans la colonne étroite.

### 1.7 Sélecteur de durée : accessible et au pouce

- `role="radiogroup"` + `role="radio"` + `aria-checked` (trois positions
  exclusives, pas trois boutons indépendants).
- Navigation aux flèches ← →.
- `tabIndex` :

 seul l'élément sélectionné est atteignable au clavier (comportement standard d'un groupe de radios).
- Cibles tactiles **≥ 44 px** (`min-h-[44px]`), sur toute la largeur en dessous
  de `sm`.

### 1.8 Bouton de paiement qui promettait trop

Le libellé du CTA dépendait de l'état du compte, mais pas de la **possibilité
réelle** d'encaisser. Un visiteur non connecté sur une offre payante voyait
« Payer par Mobile Money », cliquait, et était renvoyé vers `/signup`.

Corrigé : hors session, les offres payantes affichent « Créer un compte ». La
formule gratuite garde « Commencer gratuitement », qui reste vrai.

### 1.9 Opérateurs annoncés qui n'existent pas sur ce marché

`topup-confirm-modal.tsx` annonçait « Orange, MTN, Moov, Wave… ». La grille ne
retient que **deux** opérateurs sur le marché burkinabè, et le nom de la
passerelle doit rester invisible (N11). Le premier passage était déjà corrigé,
le second oublié.

Corrigé : « Mobile Money (Orange, Moov) », et l'en-tête de `lib/pawapay.ts` ne
promet plus d'opérateurs hors marché.

---

## 2. Les montants, tels que mesurés

Relevés **par clic réel** dans Chrome headless sur le serveur de production, en
passe de prépaiement. Les valeurs attendues viennent de la grille, pas d'une
lecture à l'œil.

| Période | Créateur | Organisations & ONG |
|---|---|---|
| 1 mois | 3 000 FCFA | 5 000 FCFA |
| 6 mois | 15 000 FCFA ~~18 000~~ · 1 mois offert · soit 2 500 / mois | 25 000 FCFA ~~30 000~~ · 1 mois offert · soit 4 167 / mois |
| 12 mois | 27 000 FCFA ~~36 000~~ · 3 mois offerts · soit 2 250 / mois | 45 000 FCFA ~~60 000~~ · 3 mois offerts · soit 3 750 / mois |

Contrôles automatiques sur ces valeurs :

- prix barré = **prorata simple** (mensuel × mois) — vérifié, pas supposé ;
- remise = 16,7 % (6 mois) et 25 % (12 mois) → **jamais > 25 %** ;
- séparateur de milliers : **espace fine insécable U+202F**, pas d'espace
  ordinaire, pas de virgule, pas de point ;
- « / mois » présent **uniquement** à 1 mois.

### Un montant corrigé

`PRICING_PLANS.organization.periods['12m'].savingsLabel` disait **« 3 mois
offer[t] »** (singulier) là où la grille et l'autre offre disent « 3 mois
offerts ». Une faute d'accord sur une pastille de vente, corrigée.

---

## 3. Lignes retirées au titre de N5

Règle N5 : **aucune fonctionnalité affichée si elle n'est pas développée**. Pour
chaque ligne retirée, la preuve est l'absence de verrou et l'absence d'écran.

### 3.1 Matrice comparative

| Ligne retirée | Pourquoi | Vérification |
|---|---|---|
| « Domaine personnalisé » (ONG) | Aucun module `domain`, aucun écran, aucune API | `hasFeature(..., 'domain')` : appelée nulle part |
| « Multi-utilisateurs » (ONG) | Idem | idem |
| « Galerie privée » (ONG) | Idem | idem |
| « Rapports PDF » (ONG) | Idem | idem |
| « Support prioritaire » (Créateur **et** ONG) | Aucun traitement de demande, aucun délai garanti. **Le plus risqué** : c'est un engagement de service qu'un client peut vérifier. | aucun appel ; `support_priority` retiré de `CREATOR_FEATURES` |

Ajouts (lignes **existantes** qui manquaient) : « Exports sans filigrane »,
« Modèles de cadres », « Statistiques de participation », « Crédits de
distribution ». Chacune renvoie à un module réellement livré — vérifié par
`npm run check:templates` (16/16) et `npm run check:watermark` (14/14).

Le groupe « Organisation » a disparu avec sa dernière ligne : un intertitre de
section pour du vide est du bruit.

### 3.2 Cartes de formule

`Campaigns illimitées` retiré de `CREATOR_FEATURES` : le produit **n'a aucune
limite** de campagnes, donc l'annoncer promettrait un déverrouillage qui n'a pas
lieu d'être.

### 3.3 Modules premium

Retirés : « Domaine », « Reports » (`availableFrom: organization`) — même motif
que 3.1. Conservés : Frame Pro, Modèles de cadres, Animation, Analytics, QR Code,
Branding — tous vérifiés.

Renommés : « Motion » → « Animation », « Templates premium » → « Modèles de
cadres », « watermark » → « filigrane » (cohérence de vocabulaire).

### 3.4 Bloc entreprise — ce qui reste, et pourquoi

Le bloc « Sur devis » affiche domaine personnalisé, galerie privée, rapports PDF,
multi-utilisateurs. **Ce ne sont pas des fonctionnalités vendues** : c'est un
formulaire de contact. Le prompt les demande explicitement (§4), donc ils
apparaissent — mais **sans prix, sans carte, sans promesse de disponibilité**.

---

## 4. Contrôles exécutés, résultats un par un

### 4.1 `npm run check:ui-tarifs` — règles N3 / N9 / N11 / N12

Chaque contrôle est **falsifié** avant d'être cru : on lui présente un cas
fautif connu et on exige qu'il le signale.

| Contrôle | Falsifié | Mesure réelle |
|---|---|---|
| N9 — pas de 4 900 / 19 900 | ✅ détecté | **0** occurrence dans `app/`, `components/`, `lib/` |
| N11 — pas de « pawaPay » affichable | ✅ détecté | **0** (hors URL de route `/api/payments/pawapay/**`, qui sont des chemins réseau) |
| N11 — pas de CinetPay / PayDunya / FedaPay / Stripe / PayPal | ✅ détecté | **0** |
| N12 — pas de reconduction automatique | ✅ détecté | **0** |
| N3 — pas de montant en dur | ✅ **faux injecté dans un vrai fichier** | **0** |

La falsification N3 mérite un mot : on **écrit** `3 000 FCFA` dans un fichier de
`components/plans`, on exige que le contrôle le voie, puis on efface. Tester la
regex sur une chaîne en mémoire n'aurait rien prouvé — le contrôle pourrait
échouer pour une raison sans rapport tout en passant le témoin.

### 4.2 `npm run check:ui-tarifs:rendu` — le HTML servi

On mesure `.next/server/app/tarifs.html`, pas le code source. C'est le seul moyen
de prouver que les prix sont dans **le premier octet**.

25 présence et 15 absence vérifiées sur le texte visible (scripts RSC retirés) :
« 3 000 FCFA », « 100 distributions incluses par mois », « soit 5 FCFA par
participant », « Voir la grille des crédits », « Prépaiement sans reconduction
automatique », « rappel 7 jours avant » présents ; « Chargement des formules »,
« Starter », « 4 900 », « Watermark », « Aucun engagement » absents ;
**3 cartes**, **1 badge**.

Le témoin est le **HTML d'avant-refonte** : le contrôle doit le rejeter.

### 4.3 `npm run check:ui-tarifs:selecteur` — le sélecteur, par clic réel

Le HTML ne prouve pas qu'un bouton fonctionne. Ce contrôle clique sur « 6 mois »
et « 12 mois » dans un vrai navigateur, relit les nœuds, et vérifie les montants,
les prix barrés, les arguments, les équivalents mensuels, le plafond de remise et
le format des nombres.

Résultat : **les 3 périodes conformes**, et le **témoin négatif est détecté** —
quand on casse l'écriture des prix, le contrôle le signale. Un contrôle qui passe
aussi bien avec un bouton mort n'aurait aucun valeur.

> Détail d'outillage : l'attente d'hydratation détecte la présence d'un nœud de
> fiber React. Sans cela, la mesure lisait `null` une fois sur deux selon la
> vitesse de la machine — donc un résultat **non déterministe**.

### 4.4 Rendu 360 px et 1440 px

| Largeur | `scrollWidth` | `clientWidth` | Débordement | Éléments hors cadre |
|---|---|---|---|---|
| 360 px | 360 | 360 | **non** | 0 |
| 1440 px | 1440 | 1440 | **non** | 0 |

**Témoin négatif** : un `div` de 1 400 px dans la même sonde à 360 px est bien
détecté comme débordant. La sonde voit donc les débordements ; elle n'en fabrique
pas.

Captures : `captures/tarifs-360-u1.png`, `captures/tarifs-1440-u1.png`, plus
5 gros plans 360 px (sélecteur, cartes à 1 mois, cartes à 6 mois, grille repliée,
grille ouverte).

> Une capture pleine page à 360 px fait 20 000 px de haut : elle prouve
> l'absence de débordement, elle ne prouve **rien** sur une taille de police.
> Les gros plans (`360-*.png`) sont là pour ça — c'est en les regardant qu'on a
> vu le « / mois » sur un total prépayé (§1.1) et les montants coupés en deux
> lignes dans la grille des crédits.

### 4.5 Harnais préexistants — aucun régression

| Harnais | Avant U1 | Après U1 |
|---|---|---|
| `check:watermark` | **cassé** (erreur d'alias `@/`) | **14 / 14** |
| `check:templates` | **cassé** (même cause) | **16 / 16** |
| `check:topup` | 18 / 18 | 18 / 18 |
| `check:distribution:contract` | 53 / 53 | 53 / 53 |
| `check:distribution` | 8 / 8 | 8 / 8 |
| `check:storage` | 6 / 6 | 6 / 6 |
| `check:clone` | 26 / 26 | 26 / 26 |
| `tsc --noEmit` | ✅ | ✅ |
| `npm run build` | ✅ | ✅ (`/tarifs` 3,2 kB, statique) |

**Réparation signalée** : `check:watermark` et `check:templates` ne
fonctionnaient **pas** avant cette phase, et pas à cause de mes modifications
(vérifié sur `HEAD`). Leur `tsconfig` ne déclarait pas l'alias `@/`, alors que
`lib/plans.ts` importe `@/lib/pricing/config`. Combiné à `noEmitOnError: false`,
TypeScript signalait l'erreur, **émettait quand même**, et le harnais partait sur
un module incomplet.

Le pire mode de défaillance pour un contrôle tarifaire : il ne bronche pas, il
tourne à moitié. Corrigé par `baseUrl` + `paths` dans les deux tsconfig, et par
`tools/alias-hook.cjs` (`node -r`) pour la résolution au runtime — `tsc` résout
l'alias à la compilation mais ne le réécrit pas dans le JS émis.

---

## 5. Points laissés ouverts, volontairement

### 5.1 La page `/tarifs` ne dit plus « les formules gratuit »

`<PlanCardAction>` affiche « Créer un compte » hors session, y compris sur la
formule gratuite. C'est exact — on ne peut pas activer un compte qui n'existe pas
— mais le libellé de la config pour cette offre est « Commencer librement » et
s'applique seulement une fois connecté. **Cohérent, à valider.**

### 5.2 Grille des crédits : tableau à trois colonnes jusqu'à 360 px

La grille repliée affiche volume / prix / coût unitaire. À 360 px, trois colonnes
ne tiennent pas : les montants se coupaient (« 2 500 » / « FCFA » sur deux
lignes). Corrigé par une gouttière resserrée et `whitespace-nowrap` sur les
colonnes de montants — un devis de distribution dont le prix se lit en deux
fragments n'est plus un devis.

Si vous préférez une liste à deux lignes (volume au-dessus, prix dessous) sur
mobile, c'est un changement de structure, pas de style.

### 5.3 La mention « sans carte bancaire » apparaît 4 fois, pas 2

Deux fois sous les CTA payants (par carte), plus deux fois dans le bandeau
distribution et la réassurance. Le contrôle en exige au moins 2. C'est un choix
éditorial : sur une page dont l'argument massif est « pas de carte », le rappeler
autant de fois qu'il estutile. **Si vous la jugez trop répétitive, dites-le** —
c'est une phrase à supprimer, pas une refonte.

### 5.4 `docs/monétisation/ui/captures/tarifs-*.png` (avant) conservés

Les captures d'avant et d'après coexistent. Je ne les ai pas supprimées : le
couple avant/après est la preuve de la phase.

### 5.5 `app/page.tsx` : modification-strangère dans l'arbre de travail

La page d'accueil porte une modification **que je n'ai pas faite** et que je n'ai
pas touchée : ajout d'un bouton « Découvrir Premium » avec une **URL absolue
difficile** (`https://campagnes-nu.vercel.app/premium`) et une indentation
cassée.

Deux raisons de la signaler plutôt que de la corriger :

1. Elle est **hors périmètre U1** — la page d'accueil n'affiche aucun prix (cf.
   audit U0, §1.6).
2. Une URL absolue vers un domaine de production dans une page interne casse
   dès que la personne qui écrit l'avertit : le bouton ne marche qu'en
   production, jamais en local, jamais en recette. C'est le genre de lien qui
   survit deux ans.

**À trancher** : corriger en U3 (quand la page d'accueil est alignée), ou
rejeter maintenant. Je n'ai pas voulu mêler les deux sujets.

### 5.6 Restent à faire en U2 / U3

- **U2** : le tunnel de paiement est une **page hébergée** redirigée, pas un
  écran Mobile Money interne (téléphone, opérateur, montant) comme le décrit le
  prompt. L'état « pending » avec minuteur et bouton « Je n'ai rien reçu »
  n'existe pas. La spec de paiement n'est donc **pas** satisfied par le code actuel.
- **U3** : `app/conditions/page.tsx` §12-13 affirme encore « Le service
  n'encaisse aucun paiement en ligne » et « L'activation d'une formule payante se
  fait par échange direct avec l'équipe ». C'est faux depuis l'intégration du
  paiement : **à corriger en U3**, pas ici.
- **Aucun e-mail transactionnel dans le dépôt** — rien à aligner. À re-signaler
  si un service d'e-mail est ajouté.

---

## 6. Ce qui n'a pas été fait, et pourquoi

- **Aucun montant modifié.** Si une incohérence de la grille m'avait sauté aux
  yeux, je l'aurais signalée sans la corriger. Je n'en ai pas vu.
- **Aucune fonctionnalité ajoutée.** N5 ne s'améliore pas en ajoutant des lignes.
- **Aucun script tiers, aucune police ajoutée.** (La page charge déjà Google
  Fonts, ce qui est relevé par le CSP du projet — mais c'est antérieur et hors
  périmètre.)
- **Pas de Lighthouse** : mesuré en fin de phase U4, quand toute la page sera
  alignée. Le mesurer maintenant donnerait un chiffre que la phase suivante
  rendra caduc.

---

## GATE U1

Travail terminé et **non commité**. En attente de validation sur :

1. les **montants** et leur ordre d'affichage (3 000 / 5 000, quotas, coûts par
   participant) ;
2. les **libellés** des trois offres et du bloc entreprise ;
3. le **rendu mobile** à 360 px — en particulier la correction du « / mois » qui
   n'apparaît qu'aux periods longues ;
4. les **lignes retirées** au titre de N5 (§3) — notamment la suppression de
   « Support prioritaire ».

Je n'engage pas la suite (U2, paiement) sans votre validation.