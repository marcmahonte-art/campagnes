# Campagnes — Plan d'implémentation

> **Plateforme de campagnes visuelles pour les organisations francophones.**
> Un template. Un lien. Ta communauté porte ta cause. Et toi, tu mesures tout.

Version : 1.0 — Document de travail
Marché visé : Afrique francophone (Côte d'Ivoire, Sénégal, Mali, Cameroun, Burkina, Bénin, Togo, Guinée, RDC…)
Positionnement : « Simple. Créatif. Impactant. »

---

## 1. Vision et cible

### 1.1 Le problème

Créer une campagne visuelle mobilisatrice (cadre photo à coller sur sa photo de profil) reste, pour une organisation francophone, un parcours du combattant :

- Les outils existants sont en anglais, pensés pour un usage desktop, et facturés en dollars par carte bancaire.
- Les participants doivent créer un compte, installer une app, et repartir avec une image couverte d'un watermark publicitaire.
- L'organisateur n'obtient **aucune donnée** exploitable pour prouver l'engagement à un bailleur, un sponsor ou une direction.

### 1.2 La proposition

**Campagnes** est une plateforme web mobile-first, en français, où :

1. L'organisation dessine ou importe un cadre (PNG transparent).
2. Elle publie une campagne et obtient un lien unique (`campagnes.app/c/rentree-ufhb`).
3. Chaque participant ouvre le lien, ajoute sa photo, la télécharge propre (sans watermark) — **sans compte, sans app**.
4. L'organisateur suit en temps réel : vues → applications → téléchargements → partages.

### 1.3 Cible

| Segment | Cas d'usage typiques | Pourquoi ils paient |
|---|---|---|
| **ONG & associations** | Journées internationales (femmes, santé, environnement, droits humains) | Preuve d'engagement auprès des bailleurs |
| **Écoles & universités** | Rentrée, diplômés, clubs, élections étudiantes | Mobilisation massive des étudiants |
| **Événements** | Conférences, festivals, tournois, mariages | Visibilité virale via les participants |
| **Marques & PME** | Onboarding, photo de profil corporate, campagne RH | Cohésion interne + image de marque |
| **Politique & cause** | Mobilisation, campagnes de sensibilisation | Volume et couverture terrain |

### 1.4 Le contexte qui joue pour nous

- **WhatsApp est le canal dominant**, pas Facebook. Le produit doit donc reposer sur un lien qui s'ouvre dans le navigateur, partageable en un tap.
- **Le Mobile Money est le rail de paiement quotidien** (Wave, Orange Money, MTN MoMo, Moov, Airtel Money). Aucun acteur global ne l'intègre pour ce cas d'usage.
- **Aucun concurrent francophone identifié** : les acteurs présents sont brésiliens (portugais, R$, LGPD), indiens (roupies), ou anglophones.

---

## 2. Paysage concurrentiel

> ⚠️ **Twibbon.com n'est plus un concurrent actif** — service arrêté le 31 juillet 2024 (site remplacé par un message de remerciement).

| Plateforme | Ce qu'elle fait | Modèle de prix (vérifié) | Watermark | Analytics | Marché |
|---|---|---|---|---|---|
| **Twibbonize** | Référence mondiale : cadres photo + backgrounds, campagnes, lien partageable, galerie, annuaire | Gratuit (watermark + pub sur la page de campagne) ; **Premium Creator ≈ 11,99 $/mois** ; **Premium Supporter ≈ 2,99 $/mois** ; crédits 500 = 62,99 $ | Oui en gratuit ; levé par abonnement **par compte** | Oui (Creator) | Mondial |
| **Phrames** | Campagnes de cadres, personnalisation texte, QR codes, analytics temps réel | 1 mois gratuit, puis **₹99 / 30 jours**, **₹249 / 90 jours** ; supporters illimités | **Non, sur aucun plan** | Oui (complet) | Inde + international |
| **Framefy** | Campagne + slug + lien, galerie publique modérée, mini-rapports sponsors | **Free** (watermark) ; **Pro R$ 89/mois** (3 campagnes actives, 3 cadres/campagne) | Oui en Free, levé en Pro | Simple (accès, clics, downloads, créations) | Brésil |
| **Ollabs** | Cadre de photo de profil, un seul lien, sans compte | **100 % gratuit**, pas de watermark, pas de signup | Non | Compteur de participations | Cause/ONG anglophone |
| **FotoFit** | Frame Maker, publication de campagnes, lien public | Non vérifié | Non précisé | Oui, selon le plan | Inde + international |
| **Frameyu** | Cadres + formulaires + notes, comparaison frontale avec Twibbonize | Free : 15 cadres, 5 pages de campagne, 3 formulaires. Pro non vérifié | **Jamais** (ni gratuit ni payant) | Oui (basique dès le free) | Anglais + pt-BR |
| **PicBadges** | Ajout de badges/cadres | Non vérifié | Non précisé | Non | Legacy |
| **Supportersframe.com** | Cadres de campagne sans watermark | Gratuit (auto-déclaré) | Non | Non communiqué | Asie du Sud |
| **GoodTwibbon** | Cadres gratuits | Gratuit | Publicité lourde | Non | Mondial |
| *Adjacents* | **Canva**, **Facebook Profile Frames**, **PhotoFunia** | Variable | Variable | Facebook : aucun | — |

### 2.1 Les failles à exploiter

1. **Paiement inaccessible au marché francophone** — carte bancaire et devises internationales uniquement, pas de Mobile Money ni de FCFA.
2. **Le watermark punit la communauté, pas le créateur** — en gratuit, chaque photo postée porte la marque ; et payer ne retire même pas les publicités de la page de campagne.
3. **Double monétisation** — Twibbonize vend un abonnement au créateur **et** au supporter, très mal vécu.
4. **Compte obligatoire pour le participant** — chaque friction coûte des participations.
5. **Qualité de produit critiquée** — bugs de connexion signalés par des abonnés payants, interface peu optimisée pour l'usage mobile rapide.

### 2.2 Notre espace

Personne ne combine aujourd'hui :

- (a) une interface **en français**,
- (b) un paiement **Mobile Money en FCFA**,
- (c) **zéro watermark** pour la communauté,
- (d) **zéro compte** pour le participant,
- (e) des **analytics clairs** et exportables pour l'organisateur.

C'est notre position exacte.

---

## 3. Périmètre du MVP

### 3.1 Ce qui est INCLUS (V1)

| Module | Contenu minimal | Effort estimé |
|---|---|---|
| **Studio de cadre** | Upload PNG transparent, positionnement, choix du ratio 1:1 / 9:16 / 16:9, aperçu live | 6 j |
| **Campagne** | Nom, slug (`campagnes.app/c/...`), visibilité public/privé, couleur d'accent | 3 j |
| **Page participant** | Ouvre le lien → upload photo → ajustement (zoom / déplacement) → texte personnalisé optionnel (prénom, ville, équipe) → téléchargement | 8 j |
| **Le lien magique** | Aucun compte, aucune app, aucune installation. Web pur, optimisé 3G | inclus |
| **Analytics v1** | Vues, applications, téléchargements, partages — par campagne, en temps réel | 6 j |
| **QR Code** | Généré automatiquement (flyer, affiche, écran) | 1 j |
| **Watermark** | **Aucun pour les participants, jamais.** Plan gratuit = badge discret en pied de page de la campagne, **pas** sur la photo | 1 j |
| **Paiement** | CinetPay ou FedaPay : Mobile Money + carte, facturation en **FCFA**, payout automatique | 5 j |
| **Auth créateur** | Email + Google. Le créateur a un compte ; le participant **jamais** | 2 j |

**Total MVP : ~6 semaines à 1 dev full-stack + 1 designer.**

### 3.2 Ce qui est HORS MVP (V2+)

- ❌ Animation IA du cadre (« Votre cadre prend vie ✨ ») → **V2**, différenciateur fort mais non vital au lancement
- ❌ Galerie publique modérée → V2
- ❌ Formulaires / RSVP / notes → V2
- ❌ Éditeur de design intégré (type Canva) → **jamais** : on dépend de Canva comme source de templates, on ne le concurrence pas
- ❌ App mobile native → jamais avant 10 000 campagnes
- ❌ Multi-langue → français d'abord, anglais ensuite

### 3.3 La règle d'or du MVP

> Un seul parcours critique doit être parfait : **lien ouvert sur téléphone → photo téléchargée en moins de 30 secondes sur une connexion 3G.**

Tout ce qui ne sert pas ce parcours est reporté.

---

## 4. Architecture technique et stack

### 4.1 Principe directeur : composition côté client

La photo du participant **ne quitte jamais son téléphone**. Le cadre est appliqué dans le navigateur via `<canvas>` (Fabric.js). Conséquences :

- Coût marginal serveur quasi nul.
- Ultra rapide, même en 3G.
- Aucune donnée personnelle transférée → conformité RGPD/LGPD naturelle.
- Aucune file d'attente de traitement.

C'est ce choix qui nous rend structurellement moins chers que Twibbonize.

### 4.2 Stack

```
Front                 Next.js (App Router) + Tailwind CSS
Composition           Fabric.js / <canvas> — 100 % côté client
Stockage images       Cloudflare R2 ou Supabase Storage (cadres PNG + résultats opt-in)
Base de données       Supabase / Postgres (campagnes, événements, agrégats)
Auth créateur         Supabase Auth (email / Google)
Paiement              CinetPay (ou FedaPay) : Mobile Money + carte, FCFA
Analytics             Table `events` en Postgres + agrégation SQL (pas d'outil tiers)
QR Code               génération côté serveur (lib `qrcode`)
Hébergement           Vercel + Cloudflare CDN
```

### 4.3 Schéma de données (simplifié)

```sql
-- Organisations / utilisateurs (créateurs)
users (id, email, org_name, plan, created_at)

-- Caméras
campaigns (
  id, owner_id, name, slug, visibility, accent_color,
  frame_url, ratio, badge_visible, created_at
)

-- Événements analytics (table append-only)
events (
  id, campaign_id, type,   -- view | apply | download | share
  device, country, created_at
)

-- Abonnements / paiements
subscriptions (id, owner_id, plan, provider, amount_fcfa, status, started_at)
```

### 4.4 Endpoints principaux

```
POST   /api/campaigns                 # créer une campagne
GET    /api/c/:slug                   # page publique participant
POST   /api/c/:slug/event             # log analytics (view/apply/download/share)
GET    /api/campaigns/:id/analytics   # dashboard propriétaire
GET    /api/campaigns/:id/qr          # QR code PNG
POST   /api/payments/init             # init CinetPay/FedaPay
POST   /api/payments/webhook          # callback confirmation
```

---

## 5. Paiement Mobile Money

### 5.1 Agrégateur recommandé

**CinetPay** (ou **FedaPay** en alternative), car il couvre plus de 8 à 10 pays d'Afrique francophone avec un seul contrat et agrège Mobile Money + carte.

### 5.2 Ordres de grandeur des frais (à vérifier avec chaque prestataire)

| Rail | Frais marchand indicatifs |
|---|---|
| Mobile Money (générique) | ~1 % à 3,5 % selon pays |
| Wave | bas (~1 %) |
| Orange Money | ~1,5 % |
| Agrégateur (CinetPay) | **1,5 % à 3,5 %** selon pays, ~3 % + 50 FCFA par transaction MoMo |

### 5.3 Règles de conception paiement

1. **Toujours facturer en FCFA**, jamais en dollar.
2. **Proposer plusieurs rails** (Wave + Orange + MTN + carte) : taux d'échec réduit.
3. **Prévoir un retry** et un fallback USSD pour les connexions instables.
4. **Payout automatique** vers le compte mobile money de l'organisation.
5. **Aucun paywall sur la photo** : le participant ne paie jamais.

---

## 6. Roadmap par phases

### Phase 0 — Fondations (Semaine 1)

| Objectif | Livrable vérifiable |
|---|---|
| Établir le socle technique et la charte | Repo Next.js + Tailwind + Supabase ; charte « Campagnes » codée (noir `#000000`, dégradé `#7B61FF → #FF6B6B → #FFD93D`, logo en Satisfy Bold, texte en Inter) ; auth créateur fonctionnelle |

### Phase 1 — Studio de cadre (Semaine 2)

| Objectif | Livrable vérifiable |
|---|---|
| Permettre de créer un cadre utilisable | Upload PNG, canvas Fabric.js, 3 ratios (1:1 / 9:16 / 16:9), positionnement, aperçu live |

### Phase 2 — Campagne & page participant (Semaine 3)

| Objectif | Livrable vérifiable |
|---|---|
| Fermer la boucle participant | Création campagne, slug, page publique mobile-first, upload photo, ajustement, **export PNG — tout en client** |

### Phase 3 — Analytics & QR (Semaine 4)

| Objectif | Livrable vérifiable |
|---|---|
| Mesurer et diffuser | Table `events`, compteurs vues / applications / téléchargements / partages, dashboard « 7 derniers jours », QR code |

### Phase 4 — Paiement & plans (Semaine 5)

| Objectif | Livrable vérifiable |
|---|---|
| Monétiser | Intégration CinetPay/FedaPay, plans Free / Pro en FCFA, webhook, levée du badge de marque |

### Phase 5 — Bêta fermée & lancement (Semaine 6)

| Objectif | Livrable vérifiable |
|---|---|
| Valider sur le terrain | 10 organisations pilotes (2 ONG, 2 écoles, 2 événements, 1 église, 1 club, 1 marque, 1 cause) ; corrections ; ouverture publique |

### Après le MVP (V2 — mois 2-4)

- Animation IA du cadre (Apparition / Flottement / Mouvement / Pulsation / Élégant / Énergique)
- Galerie publique modérée
- Rapport sponsor en PDF exportable
- Formulaires / RSVP

---

## 7. Budget et tarification

### 7.1 Pricing en FCFA (adapté au pouvoir d'achat local)

| Plan | Prix | Cible | Contenu |
|---|---|---|---|
| **Découverte** | **0 FCFA** | Associations, écoles, particuliers | Campagnes illimitées, **aucun watermark sur la photo**, badge discret sur la page de campagne, analytics 7 jours, QR code |
| **Pro** | **4 900 FCFA/mois** (≈ 8 $) | ONG, événements, PME, écoles privées | Badge retiré, analytics illimités + export CSV, campagnes privées, 5 cadres/campagne, rapport sponsor PDF |
| **Organisation** | **19 900 FCFA/mois** | Grandes ONG, universités, agences, partis | Multi-utilisateurs, marque blanche (domaine propre), campagnes illimitées, galerie publique modérée, support prioritaire |
| **Éducation** | **Gratuit** | Universités publiques, lycées | Plan Pro offert |

**Pourboire volontaire** en bas de page participant (100 / 200 / 500 FCFA) : monétisation non-intrusive, jamais un paywall.

### 7.2 Budget de démarrage

| Poste | Estimation mensuelle |
|---|---|
| Hébergement (Vercel + Cloudflare) | ~0 à quelques $ en tier gratuit |
| Supabase | tier gratuit au démarrage |
| Agrégateur paiement | ~1,5 % à 3,5 % par transaction (variable) |
| Nom de domaine + outils | quelques milliers de FCFA |
| **Total avant traction** | **quelques dizaines de milliers de FCFA / mois** |

**Équipe minimale :** 1 dev full-stack + 1 designer (ou le fondateur + le designer, en s'appuyant sur le système de design « Campagnes » déjà prêt).

---

## 8. Go-to-market

### 8.1 Cinq vagues, dans cet ordre

1. **ONG & associations** — Journées internationales. Elles doivent mobiliser **et prouver** l'engagement aux bailleurs. Le rapport export est l'argument de vente.
2. **Écoles & universités** — Rentrée, diplômés, clubs, élections. Entrée par les amicales et campus numériques ; plan éducation gratuit comme cheval de Troie.
3. **Événements** — Conférences, festivals, tournois, mariages. Le QR code sur l'affiche imprime la boucle virale.
4. **Marques & PME** — Onboarding, photo de profil corporate, anniversaires d'entreprise, campagnes RH.
5. **Politique & cause** — Hors période électorale pour l'image de marque ; plus gros volumes potentiels.

### 8.2 Canaux

- **WhatsApp avant tout** : le produit *est* son propre canal d'acquisition — chaque campagne se diffuse par un lien collé dans les groupes.
- **20 comptes TikTok/Instagram d'exemples** avec templates gratuits à copier (contenu infini).
- **Annuaire public de campagnes** (inspiré de Twibbonize) = moteur SEO.
- **Partenariats** avec créateurs de contenu locaux qui produisent déjà des visuels.
- **Pas de publicité payante au démarrage.**

---

## 9. KPIs de validation (à 90 jours)

| KPI | Définition | Objectif |
|---|---|---|
| **K1 — Taux de completion** | Visite → téléchargement | **> 40 %** (prouve que le « sans compte » gagne) |
| **K2 — Campagnes / semaine** | Nouvelles campagnes créées | 50 en bêta, **300 à 3 mois** |
| **K3 — Viralité** | Partages par participant | **≥ 0,5** visiteur rapporté par participant |
| **K4 — Conversion** | Free → Pro | **5 à 8 %** |
| **K5 — Coût marginal** | Par campagne | **< 50 FCFA** (grâce au rendu client) |

---

## 10. Risques et parades

| Risque | Parade |
|---|---|
| Un acteur global ajoute le français + Mobile Money | Profondeur locale : WhatsApp, FCFA, rapport sponsor, support en français |
| Fraude photo / contenus abusifs | Modération a posteriori des campagnes publiques + signalement |
| Échecs de paiement mobile | Agrégateur multi-rails (Wave + Orange + MTN + carte), retry, fallback USSD |
| Clone local mal financé | Vitesse d'exécution + marque « Campagnes » + annuaire + communauté (pas de barrière technique, donc course à l'exécution) |
| Faible willingness-to-pay des associations | Free généreux + pourboires + Pro ancré sur **le rapport sponsor**, pas sur le cadre |

---

## 11. Prochaines étapes

1. **Cahier des charges technique détaillé** (schéma DB complet, endpoints, flux CinetPay, structure des événements analytics) prêt pour un développeur.
2. **Maquette cliquable** des 6 écrans du MVP (création, page participant, analytics, pricing, QR, rapport sponsor) depuis la charte existante.
3. **Deck de vente ONG/écoles** démontrant le ROI d'une campagne mesurée.

---

*Document de travail — les montants de frais de paiement sont des ordres de grandeur à confirmer auprès de CinetPay / FedaPay avant contractualisation.*
