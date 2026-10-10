# Rapport et plan d'implementation du Super Admin Dashboard

**Projet :** Campagnes  
**Date :** 9 octobre 2026  
**Statut :** audit termine, implementation a planifier

---

## 1. Resume executif

Campagnes dispose deja d'un socle solide pour construire un dashboard administratif professionnel : Next.js 15, Supabase Auth, PostgreSQL, RLS, paiements Mobile Money via PawaPay, plans commerciaux, campagnes, quotas, distributions, factures, rapports et pass sans filigrane.

En revanche, le projet ne possede actuellement :

- aucune route `/super-admin` ;
- aucun role administratif applicatif ;
- aucune permission admin ;
- aucun journal d'audit ;
- aucun historique complet des changements de plan ;
- aucun journal durable des webhooks PawaPay ;
- aucune instrumentation complete des visites et funnels ;
- aucun suivi detaille de l'utilisation des pass sans filigrane.

Le dashboard ne doit donc pas etre developpe comme une simple page de graphiques. Il faut d'abord construire une frontiere de securite serveur, puis une couche de lecture admin, ensuite les pages metier et enfin l'instrumentation analytics.

---

## 2. Resultats de l'audit technique

### 2.1 Stack existante

- Next.js `15.5.27` avec App Router.
- React 19.
- Supabase Auth, PostgreSQL, RLS et Storage.
- `@supabase/ssr` et `@supabase/supabase-js`.
- Fabric.js 7 pour l'editeur visuel.
- Lucide React deja disponible pour les icones.
- Tailwind CSS.
- Backend applicatif abstrait dans `lib/backend/` avec un mode Supabase et un mode local/demo.

### 2.2 Sources de donnees existantes

Tables principales reutilisables :

- `public.users`
- `public.frames`
- `public.campaigns`
- `public.payments`
- `public.invoices`
- `public.account_credit_balances`
- `public.account_credit_ledger`
- `public.distribution_links`
- `public.distribution_usages`
- `public.distribution_export_operations`
- `public.distribution_funding_requests`
- `public.campaign_events`
- `public.campaign_likes`
- `public.content_reports`
- `public.watermark_pass_orders`

Vues et donnees derivees existantes :

- `creator_profiles`
- `campaign_quota`
- `campaign_stats`
- `campaign_share_stats`
- `distribution_stats`

### 2.3 Routes existantes importantes

- `/dashboard`
- `/analytics`
- `/dashboard/acheter`
- `/dashboard/factures/[id]`
- `/campaigns/new`
- `/campaigns/[id]`
- `/c/[slug]`
- `/d/[token]`
- `/api/billing/summary`
- `/api/payments/pawapay/initiate`
- `/api/payments/pawapay/webhook`
- `/api/payments/pawapay/check`
- `/api/passes/checkout`
- `/api/passes/status`
- `/api/passes/sync`
- `/api/passes/export`
- `/api/cron/expire-plans`

Aucune route admin n'existe encore.

### 2.4 Securite actuelle

Le projet utilise Supabase Auth et des politiques RLS. Le client `service_role` existe dans `lib/supabase/admin.ts` et est reserve aux traitements serveur.

Il n'existe toutefois pas de modele applicatif pour les administrateurs. Le champ commercial `users.plan` ne doit pas etre utilise pour controler l'acces admin : un plan `creator` ou `organization` est une offre commerciale, pas un role d'autorisation.

### 2.5 Plans et regles commerciales

Les plans sont centralises dans :

- `lib/plans.ts`
- `lib/pricing/config.ts`

Plans existants :

- `free`
- `creator`
- `organization`

Regles importantes deja presentes :

- le compte gratuit est limite a **une campagne** ;
- les formes et textes sont reserves aux offres payantes ;
- les fonctions premium sont controlees par des droits ;
- les montants sont centralises dans la configuration de tarification ;
- les distributions et les paiements disposent de mecanismes serveur dedies.

Le dashboard ne doit pas modifier ces regles sans une evolution commerciale explicite.

---

## 3. Metriques disponibles aujourd'hui

### 3.1 Metriques fiables ou calculables

#### Utilisateurs

- nombre total de comptes ;
- nouveaux comptes par periode ;
- repartition par plan ;
- comptes onboardes et non onboardes ;
- comptes ayant cree au moins une campagne ;
- comptes n'ayant encore cree aucune campagne ;
- dates d'inscription.

#### Campagnes

- nombre total ;
- brouillons ;
- publiees ;
- repartition par type ;
- creations par periode ;
- campagnes par createur ;
- campagnes sans participation connue ;
- quota accorde, utilise et restant.

#### Paiements

- paiements en attente ;
- paiements confirmes ;
- paiements echoues ;
- paiements annules ;
- chiffre d'affaires brut confirme ;
- revenus par type de produit ;
- revenus par pays si le pays est present dans les metadata ;
- revenus par fournisseur ou operateur si la donnee est disponible ;
- motifs d'echec.

#### Facturation et credits

- factures emises ;
- total des factures ;
- soldes de credits ;
- credits achetes ;
- credits alloues ;
- credits rembourses ;
- ajustements.

#### Distributions

- liens crees ;
- liens actifs, expires, revoques ou epuises ;
- exports reserves ;
- exports confirmes ;
- historiques d'utilisation ;
- credits achetes, consommes et rembourses.

#### Pass sans filigrane

- commandes par statut ;
- pass actifs et expires ;
- revenus ;
- pays ;
- echecs d'activation ;
- duree d'activation.

#### Moderation

- rapports nouveaux, en cours et fermes ;
- rapports par motif ;
- rapports non traites ;
- volume de rapports par periode.

---

## 4. Metriques non disponibles sans instrumentation

Les metriques suivantes ne doivent pas etre inventees :

- visiteurs uniques ;
- pages vues ;
- ouvertures de liens de campagne ;
- scans QR ;
- debut et abandon de participation ;
- taux de conversion visiteur vers inscription ;
- taux de conversion inscription vers premiere campagne ;
- taux de conversion participation vers export ;
- nombre d'exports reussis par pass ;
- campagne utilisee par un pass anonyme ;
- appareils et geolocalisation des participants ;
- historique detaille des webhooks ;
- churn, MRR et ARR fiables ;
- revenu net apres frais, taxes ou remboursements.

Dans l'interface, ces indicateurs doivent afficher :

> Non mesure — instrumentation necessaire

---

## 5. Architecture cible

```text
Interface /super-admin
        |
        v
Garde serveur : session + role + permission
        |
        v
Routes /api/admin/*
        |
        v
Repository de lecture administrative
        |
        +--> RPC / vues / agregations Supabase
        |
        +--> Journal d'audit pour les operations sensibles
        |
        v
Tables existantes et futures tables d'instrumentation
```

Principes :

1. aucune requete administrative directe depuis le navigateur ;
2. aucune cle `service_role` exposee au client ;
3. pagination serveur pour les tableaux ;
4. agregations serveur pour les KPI ;
5. donnees reelles uniquement ;
6. filtres portes par l'URL pour rendre les pages partageables et reproductibles ;
7. definitions explicites pour chaque metrique ;
8. journalisation des actions sensibles ;
9. RLS jamais desactivee ;
10. aucune exposition des tokens prives de distribution.

---

## 6. Plan d'implementation par phases

### Phase 0 — Stabilisation et verification

Avant de developper l'interface :

- verifier que toutes les migrations sont appliquees dans Supabase ;
- verifier les fonctions RPC et les politiques RLS ;
- confirmer les colonnes finales de `payments` ;
- confirmer les fonctions de distribution transactionnelle ;
- verifier le pass sans filigrane ;
- corriger l'incoherence entre `lib/pawapay-confirm.ts` et la signature SQL de `complete_payment_and_activate_plan` ;
- documenter les definitions officielles des revenus et des exports.

Point important : une migration presente dans le depot n'est pas une preuve qu'elle est appliquee en production.

### Phase 1 — Acces Super Admin

Ajouter une migration dediee, par exemple :

```text
0025_super_admin_access.sql
```

Table proposee : `admin_members`

Champs :

- `user_id` ;
- `role` ;
- `status` ;
- `created_at` ;
- `created_by` ;
- `last_seen_at`.

Roles initiaux :

- `super_admin` ;
- `support_readonly` ;
- `finance_readonly`.

Creer une garde serveur centrale :

```text
lib/admin/require-admin.ts
```

Cette garde doit verifier :

- la session Supabase ;
- l'identite de l'utilisateur ;
- l'existence dans `admin_members` ;
- le role ;
- le statut actif ;
- la permission necessaire pour l'action.

Le premier super administrateur doit etre designe manuellement avec son UUID Supabase. Aucun role ne doit etre attribue automatiquement a tous les comptes.

### Phase 2 — Journal d'audit

Ajouter une migration, par exemple :

```text
0026_admin_audit_log.sql
```

Table proposee : `admin_audit_log`

Champs :

- `id` ;
- `admin_user_id` ;
- `action` ;
- `resource_type` ;
- `resource_id` ;
- `reason` ;
- `metadata_safe` ;
- `created_at` ;
- empreinte IP facultative ;
- empreinte User-Agent facultative.

Actions a journaliser :

- export CSV ;
- consultation d'un paiement sensible ;
- correction de quota ;
- changement manuel de plan ;
- remboursement ;
- modification de role ;
- resolution d'un rapport ;
- suspension d'un compte si cette fonction est ajoutee.

Le journal doit etre append-only pour les roles clients et administratifs.

### Phase 3 — Couche de lecture administrative

Creer :

```text
lib/admin/
  auth.ts
  permissions.ts
  repository.ts
  metrics.ts
  filters.ts
  csv.ts
  audit.ts
  types.ts
  errors.ts
```

La couche de lecture doit exposer des contrats types pour :

- overview ;
- utilisateurs ;
- paiements ;
- campagnes ;
- distributions ;
- systeme ;
- exports.

Commencer par des requetes SQL et RPC agreges. Ajouter des vues dediees ou des tables d'agregation seulement apres mesure des performances.

### Phase 4 — MVP du dashboard

Routes UI :

```text
/super-admin
/super-admin/users
/super-admin/payments
/super-admin/campaigns
/super-admin/system
```

Routes API :

```text
/api/admin/overview
/api/admin/users
/api/admin/payments
/api/admin/campaigns
/api/admin/system
/api/admin/exports
```

Le MVP doit fournir :

- securite serveur ;
- KPI issus des donnees reelles ;
- filtres de periode ;
- recherche et pagination serveur ;
- etats de chargement, vide et erreur ;
- definitions des metriques ;
- export CSV autorise et journalise ;
- aucune donnee fictive.

### Phase 5 — Revenus et distributions

Ajouter :

```text
/super-admin/revenue
/super-admin/subscriptions
/super-admin/distributions
/super-admin/plans
```


Regle de calcul du chiffre d'affaires brut :

```text
somme des paiements uniques dont status = completed
```

Les paiements en attente, echoues ou annules ne sont jamais comptabilises comme revenus encaisses.

Ne pas afficher de benefice net tant que les frais, taxes, remboursements et chargebacks ne sont pas modelises.

### Phase 6 — Instrumentation analytics

Ajouter une table minimaliste, par exemple :

```text
product_events
```

Evenements envisageables :

- `campaign_viewed` ;
- `participant_started` ;
- `upload_started` ;
- `upload_succeeded` ;
- `export_started` ;
- `export_succeeded` ;
- `share_clicked` ;
- `pricing_viewed` ;
- `checkout_started` ;
- `payment_confirmed`.

Ne pas stocker de photos, videos, tokens prives ou adresses IP en clair dans les evenements.

### Phase 7 — Observabilite des paiements

Ajouter une table du type :

```text
payment_webhook_events
```

Elle permettra de suivre :

- reception ;
- validite de signature ;
- paiement associe ;
- traitement ;
- erreurs ;
- tentatives ;
- temps de traitement ;
- reconciliation.

Les payloads sensibles doivent etre minimises et ne doivent pas etre visibles par les roles ordinaires.

### Phase 8 — Pass sans filigrane et moderations

Le dashboard peut afficher des maintenant les commandes et statuts du pass.

Pour mesurer l'utilisation reelle du pass, ajouter plus tard :

```text
watermark_pass_usage
```

Pour les rapports, ajouter une interface admin avec :

- consultation ;
- statut ;
- attribution ;
- note de resolution ;
- action effectuee ;
- trace d'audit.

### Phase 9 — Optimisation et industrialisation

Apres observation des volumes :

- ajouter les index necessaires ;
- optimiser les agregations lentes ;
- introduire un cache controle ;
- utiliser des vues materialisees seulement si justifie ;
- ajouter une verification automatique de derive entre migrations et base ;
- ajouter des alertes sur les paiements bloques et erreurs recurrentes.

---

## 7. Arborescence recommandee

```text
app/
  (admin)/
    super-admin/
      layout.tsx
      page.tsx
      users/page.tsx
      payments/page.tsx
      campaigns/page.tsx
      distributions/page.tsx
      revenue/page.tsx
      subscriptions/page.tsx
      system/page.tsx

  api/
    admin/
      overview/route.ts
      users/route.ts
      payments/route.ts
      campaigns/route.ts
      distributions/route.ts
      revenue/route.ts
      exports/route.ts
      system/route.ts
      audit/route.ts

components/
  admin/
    admin-shell.tsx
    admin-sidebar.tsx
    admin-header.tsx
    kpi-card.tsx
    metric-definition.tsx
    date-range-filter.tsx
    data-table.tsx
    status-badge.tsx
    empty-state.tsx
    error-state.tsx
    loading-skeleton.tsx

lib/
  admin/
    auth.ts
    permissions.ts
    repository.ts
    metrics.ts
    filters.ts
    csv.ts
    audit.ts
    types.ts
    errors.ts
```

---

## 8. Design de l'interface

### Navigation initiale

Commencer avec :

1. Vue d'ensemble ;
2. Utilisateurs ;
3. Paiements ;
4. Campagnes ;
5. Distributions ;
6. Systeme.

Ajouter ensuite :

7. Revenus ;
8. Abonnements ;
9. Pass sans filigrane ;
10. Analytics ;
11. Rapports ;
12. Offres et tarifs ;
13. Parametres.

Il vaut mieux une navigation courte et fonctionnelle qu'une longue navigation contenant des pages vides.

### Style

- fond principal clair ;
- typographie Inter ;
- cartes KPI sobres ;
- bordures fines ;
- accent Campagnes utilise avec parcimonie ;
- tableaux lisibles ;
- responsive tablette et mobile ;
- aucune animation decorative inutile ;
- etat "Non mesure" explicite pour les donnees absentes.

Chaque page doit afficher :

- un titre ;
- une description ;
- la periode active ;
- la date de derniere actualisation ;
- des definitions de metriques ;
- un etat de chargement ;
- un etat vide ;
- un etat d'erreur ;
- un bouton d'actualisation lorsque necessaire.

---

## 9. Criteres d'acceptation

La premiere version sera acceptee si :

- un utilisateur non autorise est refuse cote serveur ;
- connaitre `/super-admin` ne suffit pas pour acceder au dashboard ;
- aucune cle `service_role` n'arrive dans le navigateur ;
- les chiffres proviennent des tables Supabase reelles ;
- les paiements confirmes sont comptes une seule fois ;
- les paiements en attente ne sont pas consideres comme revenus ;
- la limite d'une campagne du compte gratuit reste intacte ;
- les formes et textes restent bloques pour le compte gratuit ;
- les tokens prives ne sont jamais exposes ;
- les exports CSV sont filtres, limites et journalises ;
- chaque KPI dispose d'une definition ;
- les metriques indisponibles sont marquees comme non mesurees ;
- les permissions sont testees ;
- les agrégations sont testees ;
- les erreurs et etats vides sont testes ;
- `npm run typecheck` passe ;
- `npm run build` passe ;
- le deploiement Vercel dispose des variables necessaires, dont `PAWAPAY_BASE_URL`.

---

## 10. Tests essentiels

Ajouter des tests pour :

### Securite

- utilisateur non connecte refuse ;
- utilisateur connecte mais non admin refuse ;
- admin lecture seule refuse les mutations ;
- super admin autorise les actions prevues ;
- service role absent ou expose interdit ;
- tokens et secrets absents des reponses.

### Metriques

- periode du jour ;
- periode des 7 jours ;
- periode des 30 jours ;
- somme des paiements `completed` uniquement ;
- exclusion des paiements `pending`, `failed` et `cancelled` ;
- absence de double comptage ;
- quotas confirmes et reserves distingues ;
- plans gratuits et payants correctement repartis.

### API et interface

- pagination ;
- recherche ;
- filtres ;
- export CSV ;
- etat vide ;
- erreur Supabase ;
- actualisation ;
- responsive basique.

---

## 11. Variables d'environnement et actions manuelles

Variables a verifier sur Vercel :

- `NEXT_PUBLIC_SUPABASE_URL` ;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ;
- `SUPABASE_SERVICE_ROLE_KEY` ;
- `PAWAPAY_BASE_URL` ;
- `PAWAPAY_API_TOKEN` ;
- `CRON_SECRET` si le cron est utilise.

Actions manuelles avant mise en production :

1. creer le premier compte super administrateur ;
2. inserer son UUID dans `admin_members` via une operation controlee ;
3. verifier les migrations en production ;
4. verifier les fonctions de paiement et leurs signatures ;
5. verifier les politiques RLS ;
6. tester l'acces admin avec un compte non admin ;
7. tester les exports CSV ;
8. confirmer les variables Vercel Preview et Production ;
9. lancer le build de production ;
10. verifier les routes deployees sans exposer de donnees sensibles.

Ne jamais lancer localement un achat PawaPay reel. Les tests de paiement doivent utiliser un environnement sandbox et des identifiants sandbox.

---

## 12. Resultat attendu

Le Super Admin doit devenir un centre de pilotage fiable, pas une page de demonstration.

La premiere version doit permettre de repondre de facon certaine a ces questions :

- combien de comptes existent ;
- combien de comptes sont gratuits ou payants ;
- combien de campagnes sont creees et publiees ;
- combien de paiements sont confirmes ou bloques ;
- quel chiffre d'affaires brut est reellement encaisse ;
- quelles campagnes utilisent leur quota ;
- combien de distributions sont confirmees ;
- quels rapports et problemes techniques necessitent une action.

Les questions de conversion, visiteurs uniques, funnels, churn et rentabilite nette doivent etre ajoutees seulement apres la mise en place de l'instrumentation correspondante.

## Conclusion

L'implementation recommandee est progressive :

1. securite et roles ;
2. journal d'audit ;
3. couche de lecture admin ;
4. Vue d'ensemble, Utilisateurs, Paiements et Campagnes ;
5. Revenus, Abonnements et Distributions ;
6. Analytics produit ;
7. Webhooks, pass, moderation et alertes ;
8. optimisation et industrialisation.

Cette approche reutilise le code et les tables existantes, protege les paiements, evite les faux chiffres et permet d'ajouter de nouvelles fonctions sans reecrire le dashboard.
