# Audit de l'interface — PHASE U0 (PROMPT-UI-TARIFS)

> **Aucune modification de fond n'a été faite dans cette phase.** Le seul changement
> appliqué est un **correctif de compilation bloquant** (voir §0) : le dépôt ne
> compilait pas, ce qui rendait impossible toute mesure de rendu. Il est signalé
> explicitement pour validation.

- **Date de mesure** : 2026-10-04
- **Commit de travail** : `master` (arbre modifié — voir `git status`)
- **Méthode** : lecture du code + `npm run build` + `next start` + captures Chrome
  headless 360 / 1440 px + sonde CDP de débordement (`scrollWidth` vs `innerWidth`).
- **Règle appliquée** : aucune affirmation sans mesure par exécution.

---

## 0. Blocage préalable — le dépôt ne compilait pas

`npm run build` échouait :

```
./app/tarifs/page.tsx:133:42
Type error: Type '"outline"' is not assignable to type 'Variant | undefined'.
```

`components/ui/button.tsx:5` ne déclare que `primary | secondary | ghost | destructive`.
`variant="outline"` n'existe pas → **build de production cassé**, donc déploiement
Vercel cassé.

**Correction appliquée** (`app/tarifs/page.tsx:133`) : `variant="outline"` → `variant="secondary"`.
Le style visé (bouton clair secondaire) est identique à l'intention.

Après correctif : `npm run build` → **✓ Compiled successfully**, sortie `✓ /tarifs 5.14 kB`.
> ⚠️ Ce point n'est pas cosmétique : sans lui, U1→U4 ne peuvent pas être déployées.
> **À valider au GATE U0.**

---

## 1. Relevé exhaustif des surfaces prix / quota / paiement

### 1.1 Page `/tarifs` — `app/tarifs/page.tsx`

| Ligne | Élément | État |
|---|---|---|
| 46 | Commentaire `{/* Les trois formules avec pawaPay */}` | **N11** — « pawaPay » interdit dans l'UI |
| 48 | `<PricingPlans />` (formules, période, bannière) | client + Suspense (voir §3) |
| 62-68 | Bloc « quota inclus » — texte « jusqu'à 5 FCFA par participant » | prix **en dur dans le JSX** (**N3**) |
| 112-116 | `DISTRIBUTION_OFFERS.map(→ OfferCard)` | **5 cartes** Starter/Popular/Growth/Large/Grand volume |
| 128 | « retirer le filigrane instantanément pour **{PARTICIPANT_PAYMENT.label}** » | ✓ vient de la config |
| 133-135 | Bouton « Recharger un pack » → `href="/tarifs"` | **lien mort** (auto-référence) |
| 153 | `<ComparisonTable />` | colonnes en **anglais** (voir §1.5) |
| 171-186 | `PREMIUM_MODULES.map(→ Card)` | ✓ alimenté par `lib/plans.ts` |
| 191-218 | Bloc « Sur devis » grands comptes | ✓ `ENTERPRISE_CONTACT` |
| 228 | « Aucun engagement, aucune mauvaise surprise. » | réassurance à reformuler (U1) |

### 1.2 Formules — `components/plans/pricing-plans.tsx`

- **`'use client'`** (ligne 1) + fallback **`<Suspense>` « Chargement des formules... »** (l. 255-260)
  → la page est **prérendue statique** (build : `○ /tarifs`), le contenu des formules
  n'apparaît **qu'après hydratation**. C'est la cause du premier rendu vide.
- **N11, occurrences visibles** : l. 128 (« paiement pawaPay »), l. 137
  (« URL de redirection renvoyée par pawaPay »), **l. 239** (« … via la passerelle
  sécurisée **pawaPay** ») — cette dernière est **affichée à l'utilisateur**.
- **N11, occurrences non affichées** (commentaires/logs/identifiants techniques, à conserver) :
  l. 29, 60, 96, 109, **110** (code d'API `PAWAPAY_NOT_CONFIGURED`), 133, 140.
- l. 196 : « Prépaiement direct sans reconduction automatique » → ✓ conforme **N12**.
- Appelle `/api/payments/pawapay/initiate` et `/check`.

### 1.3 Carte de formule — `components/plans/plan-card.tsx`

- l. 103 : `0 FCFA` + « 25 exports filigranés inclus à vie ».
- l. 114 : prix mensuel équivalent via `formatFcfaPrice(periodPricing.monthlyEquivalentFcfa)` → ✓ config.
- l. 126-133 : total prépayé + prix barré (6 m / 12 m).
- l. 136-140 : pastille `costPerParticipantLabel` → ✓ config.
- **l. 174 : `'Connexion sécurisée pawaPay…'`** → **N11 affiché pendant le paiement**.

### 1.4 Achat de quota (crédits) — tunnel

Fichiers : `components/campaign/topup-button.tsx`, `topup-confirm-modal.tsx`,
`topup-return-notice.tsx`, `lib/pawapay-confirm.ts`, `lib/quota.ts` ;
surface : `app/(creator)/campaigns/[id]/page.tsx` **l. 564-660**.

| Ligne | Élément | État |
|---|---|---|
| `[id]/page.tsx:611` | « Les paliers reprennent la grille de `/tarifs` » | 2ᵉ source de la grille |
| `[id]/page.tsx:640` | « Paiement par Mobile Money, traité par **pawaPay** » | **N11 affiché** |
| `topup-confirm-modal.tsx:139` | « redirigé vers la page de paiement **pawaPay** » | **N11 affiché** |
| `topup-confirm-modal.tsx:149` | « … entièrement par **pawaPay** » | **N11 affiché** |

### 1.5 Matrice comparative — `components/plans/comparison-table.tsx`

- l. 37-39 (desktop) et l. 76, 82, 88 (mobile) : en-têtes **« Free » / « Creator » / « Organisation »**
  → **anglais**, à renommer en « Gratuit · Créateur · Organisations & ONG ».
- Alimentée par `COMPARISON` (`lib/plans.ts`) ; l. 252 : ligne Watermark
  (free « Oui », creator/organisation « Non ») → formulation à revoir.

### 1.6 Accueil, tableau de bord, pages légales, e-mails

- **`app/page.tsx` (accueil)** : **aucun prix, aucun quota, aucun filigrane affiché.**
  → rien à propager côté prix affiché.
- **`app/(creator)/dashboard/page.tsx`** : **aucun prix** (uniquement quota indirect).
- **Pages légales** : `app/conditions/page.tsx` — **l. 195** lien `/tarifs` (✓) ;
  **l. 213 « L'activation d'une formule payante se fait par échange direct avec l'équipe »**
  → **OBSOLÈTE** (l'activation est désormais en ligne par Mobile Money). À corriger en U3.
  `app/aide/page.tsx:132` renvoie vers `/tarifs` (✓).
- **E-mails transactionnels** : **aucun template dans le dépôt** (pas de `app/api/*/email`,
  pas de dossier `emails/`, pas de fournisseur d'e-mail). → **rien à mettre à jour** ;
  à re-signaler si un service d'e-mail est ajouté plus tard.

---

## 2. Montants obsolètes (N9) et passerelles concurrentes

`grep -rn "4900|4 900|19900|19 900|CinetPay|Paydunya|Fedapay|Stripe"` sur
`app/ components/ lib/ supabase/ public/` :

> **Aucun résultat.** Les montants obsolètes (`4 900`, `19 900`) et les noms de
> passerelles concurrentes **ne survivent que dans `docs/`**, jamais dans le code source.

**N9 est donc déjà satisfait côté code.** Les valeurs en vigueur sont bien
**3 000 FCFA/mois (Créateur)** et **5 000 FCFA/mois (Organisations & ONG)**.

---

## 3. Formules : d'où vient « Chargement des formules… »

1. La route `/tarifs` est **statiquement prérendue** (`○ /tarifs`, 5.14 kB).
2. `PricingPlans` est un composant **client** (`'use client'`) enveloppé dans un
   **`<Suspense>`** dont le `fallback` est « Chargement des formules... » (l. 255-260).
3. Le fallback s'affiche au **premier rendu (SSR/statique)** ; le contenu réel
   (période + 3 cartes + bannière) n'apparaît qu'**après hydratation**.

→ Le prompt demande un rendu **serveur** des formules pour supprimer ce clignotement
et le rendu vide initial. Le contenu étant entièrement dérivable de
`lib/pricing/config.ts` (données statiques), **rien n'empêche le rendu serveur** :
le `Suspense` + le fetch de vérification `depositId` sont les seuls points client à
isoler.

**Mesuré (serveur de production `next start`)** :

| Taille | `innerWidth` | `scrollWidth` | Débordement | Éléments hors cadre |
|---|---|---|---|---|
| 360 px | 360 | 345 | **−15 (aucun)** | 0 |
| 1440 px | 1440 | 1425 | **−15 (aucun)** | 0 |

> ⚠️ La capture `--window-size=360` de Chrome headless **ne** reflète **pas** la
> largeur CSS réelle (artefact de fenêtre, pas de débordement réel) : la mesure CDP
> ci-dessus fait foi. Le rendu à 360 px est **sain**.

---

## 4. Intégration de paiement existante

**Oui, elle existe déjà** (contrairement à ce que le prompt suppose) :

- Routes : `app/api/payments/pawapay/{initiate,check,webhook}/route.ts`.
- Client : `lib/pawapay.ts` — PawaPay **Merchant API v2**, *Hosted Payment Page*
  (`/v2/paymentpage`), sandbox par défaut (`api.sandbox.pawapay.io`).
- Confirmation serveur unique : `lib/pawapay-confirm.ts` (+ **webhook signé**).
- Table `payments` + migration **`0018_campaign_topup.sql`** ; garde sur `TRUNCATE`
  en **`0019_lock_down_truncate.sql`**.
- Contrôle falsifiable : `tools/topup-check/` (webhook rejoué → **pas de double crédit**).

Écarts avec la cible du prompt (à traiter en U2) :
- Le flux actuel passe par une **page hébergée** redirigée, pas par un **écran Mobile
  Money interne** (téléphone + opérateur + montant) tel que décrit au §U2.
- `isPawaPayConfigured()` dépend de `PAWAPAY_API_TOKEN` (variable d'environnement).
- **N11** : le nom « pawaPay » fuit dans l'UI à **6 endroits affichés** (voir §1).

---

## 5. Sources de prix dupliquées — atteinte à **N3**

Une **seule** source de vérité est requise (`src/lib/pricing/config.ts`). Aujourd'hui :

| Fichier | Ce qu'il contient | Lien avec la config |
|---|---|---|
| **`lib/pricing/config.ts`** | `PRICING_PLANS`, `DISTRIBUTION_PACKS`, `PARTICIPANT_PAYMENT`, `formatFcfaPrice`, `getPlanPeriodPrice` | **référence** |
| `lib/distribution.ts` | `DISTRIBUTION_OFFERS` (Starter/Popular/Growth/Large/Grand volume) | **duplique** la grille, noms **anglais** |
| `lib/quota.ts` | `TOPUP_TIERS` (mêmes volumes) | **duplique** la grille |
| `lib/plans.ts` | `PLANS` (lit les prix de `PRICING_PLANS` ✓) + `COMPARISON` + `PREMIUM_MODULES` | prix ✓ dérivés |

`components/campaign/topup-button.tsx:92-94` documente lui-même la duplication :
« Les deux grilles partagent les mêmes volumes : `lib/quota.ts` (TOPUP_TIERS) … ».

→ **U1** doit ramener `DISTRIBUTION_OFFERS` et `TOPUP_TIERS` sous `lib/pricing/config.ts`
(ou les faire dériver de `DISTRIBUTION_PACKS`), et franciser les libellés.

---

## 6. Captures

- `captures/tarifs-1440.png` — `/tarifs` à 1440 px.
- `captures/tarifs-360.png` — `/tarifs` à 360 px (largeur CSS réelle vérifiée par sonde :
  **pas** de débordement ; voir la mise en garde §3).

---

## 7. Synthèse — écart avec la cible

| # | Constat | Règle | Phase |
|---|---|---|---|
| 1 | **Build cassé** (`variant="outline"`) — corrigé | — | U0 |
| 2 | « pawaPay » affiché dans l'UI (**6 endroits**) | **N11** | U1/U2/U3 |
| 3 | « Chargement des formules… » ; formules non rendues au serveur | prompt §U1 | U1 |
| 4 | « 5 FCFA par participant » en dur dans le JSX | **N3** | U1 |
| 5 | Grille dupliquée (`distribution.ts`, `quota.ts`) | **N3** | U1 |
| 6 | Colonnes « Free/Creator/Organisation » en anglais | prompt §5 | U1 |
| 7 | Bouton mort « Recharger un pack » → `/tarifs` | — | U1 |
| 8 | 5 cartes de distribution sur `/tarifs` (à réduire en bannière + `<details>`) | prompt §3 | U1 |
| 9 | Conditions : « activation par échange direct » **obsolète** | — | U3 |
| 10 | Flux paiement = page hébergée, pas d'écran Mobile Money interne | prompt §U2 | U2 |
| 11 | Accueil / dashboard / e-mails : **aucun prix** → rien à propager | — | U3 |
| 12 | Aucun montant obsolète dans le code (N9 **déjà OK**) | **N9** | — |

---

## GATE U0

**Aucune modification de fond n'a été engagée.** Les seules actions ont été :
la lecture du code, la compilation, le lancement d'un serveur de production local,
les captures, et **le correctif de compilation bloquant** (§0).

**En attente de validation pour passer à U1.**
