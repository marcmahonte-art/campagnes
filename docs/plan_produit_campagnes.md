# Campagnes — Plan d'implémentation du produit fini

> **Campagnes — Créez. Animez. Partagez.**
> Les campagnes visuelles, sans la complexité.

Version : 2.0 — Plan produit (cible : produit fini, pas un MVP)
Date : septembre 2026
Marché : Afrique francophone, puis international
Positionnement : « Simple. Créatif. Impactant. »

---

## 0. Ce qui change par rapport à la version précédente

Le plan précédent décrivait un MVP de 6 semaines. Ce document décrit **le produit fini tel qu'il doit être construit** : une plateforme simple pour créer et diffuser des **cadres statiques ou animés** sur des **photos et des vidéos**, pensée autour de trois moteurs (Frame, Motion, Media) et d'une expérience à 5 actions, sans jamais exposer à l'utilisateur un panneau de configuration complexe.

La philosophie centrale, qui ne doit jamais être trahie :

> **Campagnes masque toute la complexité technique. L'utilisateur dépose, positionne, anime, partage. C'est tout.**

---

## 1. Vision produit

### 1.1 Le problème

Créer une campagne visuelle mobilisatrice reste, pour une organisation, un parcours du combattant :

- Les outils existants sont en anglais, pensés pour le desktop, facturés en dollars par carte bancaire.
- Les participants doivent créer un compte, installer une app, et repartir avec une image couverte d'un watermark.
- Animer un cadre pour une vidéo impose d'ouvrir un logiciel de motion design (After Effects, CapCut) — inaccessible à 99 % des organisations.
- L'organisateur n'obtient **aucune donnée** exploitable pour prouver l'engagement à un bailleur, un sponsor ou une direction.

### 1.2 La proposition

**Campagnes** permet à une organisation de :

1. **Créer un cadre** (PNG transparent, logo, forme, texte, plusieurs éléments) sur un canvas ultra-simple.
2. **L'animer** en un clic via l'IA (ou en le décrivant en langage naturel).
3. **Publier une campagne** et obtenir un lien unique + un QR code.
4. **Laisser la communauté participer** : chaque personne ouvre le lien, ajoute sa **photo ou sa vidéo**, récupère son visuel fini — **sans compte, sans app**.
5. **Mesurer** : visites, créations, téléchargements, partages, appareils, pays, évolution.
6. **Personnaliser sa marque** : retirer le watermark, logo, couleur, domaine.

### 1.3 La promesse en une phrase

> **Une même campagne se vit de bout en bout : Créer → Personnaliser → Publier → Partager → Mesurer. Campagnes masque toute la complexité technique.**

Créateur et participant ne sont **pas deux produits** : c'est **une seule campagne**, deux points de vue.

### 1.4 Les trois moteurs

L'architecture du produit repose sur trois moteurs indépendants et composables :

| Moteur | Rôle | Sortie |
|---|---|---|
| **Frame Engine** | Création et placement du cadre (déplacer, redimensionner, pivoter, devant/derrière) | Descripteur de cadre (calques, PNG, texte, formes) |
| **Motion Engine** | Animation du cadre (presets IA + prompt libre) | Instructions de mouvement / assets animés |
| **Media Engine** | Application du cadre aux photos et vidéos + export | PNG / MP4 / WebM |

Cette séparation est ce qui rend le produit propre : elle permet de faire évoluer chaque moteur sans casser les autres, et surtout de **garder les coûts d'IA prévisibles** (voir § 6).

---

## 2. Expérience utilisateur

### 2.1 Les 5 grandes actions (côté créateur)

Le produit se limite à **cinq actions**. Rien d'autre.

```
1. Créer        → créer une campagne
2. Cadre        → créer / importer son frame
3. Animer ✨    → rendre le frame animé
4. Partager     → lien + QR code
5. Statistiques → analytics
```

### 2.2 Le canvas de création (action « Cadre »)

Pas de Photoshop miniature. Un canvas simple où l'utilisateur peut :

- **glisser** une image ici : `[ Glissez votre image ici ]`
- **déplacer**
- **redimensionner**
- **faire pivoter**
- **placer devant / derrière** le média (ordre des calques)

Le cadre peut être : un **PNG transparent**, un **logo**, une **forme**, du **texte**, ou **plusieurs éléments** empilés.

> **Principe : je dépose → je positionne → c'est prêt.**

### 2.3 Les trois formats

Trois formats, présentés en langage naturel — **jamais** une liste de résolutions :

| L'utilisateur choisit | Ratio | Utilisation |
|---|---|---|
| **Carré** | 1:1 | Instagram / Facebook, publications carrées |
| **Paysage** | 16:9 | YouTube, écrans, présentations |
| **Vertical** | 9:16 | TikTok, Reels, Stories, WhatsApp |

L'utilisateur choisit **Carré · Paysage · Vertical**. Campagnes s'occupe du reste (résolution, encodage, ratios sûrs).

### 2.4 Le parcours participant

```
Ajoutez votre photo ou vidéo

[ Choisir une photo ]   [ Choisir une vidéo ]

→ (le cadre est appliqué, ajustable au doigt)

[ Télécharger ]   [ Partager ]
```

Aucun compte. Aucune app. Aucune installation. Le lien s'ouvre dans le navigateur, se partage en un tap sur WhatsApp.

### 2.5 L'interface « Votre campagne » (déblocage des modules)

On ne présente **jamais** une grille de prix à la pièce (« Frame 2 €, Video 3 €, Analytics 4 €, IA 7 € ») — cela donne une impression de péage partout. À la place, chaque campagne affiche ses modules avec un état clair :

```
Votre campagne

Cadre      ✓
Photo      ✓
Vidéo      ✓

✨ Animation IA      Débloquer
📊 Analytics          Débloquer
▣ QR Code             Débloquer
```

L'utilisateur comprend immédiatement ce qui est disponible et ce qui est premium, sans jamais quitter le contexte de sa campagne.

---

## 3. Le Frame Engine

### 3.1 Fonction

Créer et placer un cadre composé de plusieurs calques.

### 3.2 Capacités

- Import PNG transparent, JPG, SVG, logo.
- Calques : image, forme (rectangle, cercle, polygone), texte (police, taille, couleur, alignement).
- Transformations : déplacement, mise à l'échelle, rotation, opacité, ordre (devant/derrière).
- **Cadres de zone sûre** : guides visuels pour ne pas couvrir le visage du participant (le 9:16 vertical a une zone de sécurité différente du 1:1).
- **Templates** : bibliothèque de cadres prêts à copier (fournis par Campagnes ou par la communauté).

### 3.3 Sortie

Un **descripteur de cadre** — un JSON versionné :

```json
{
  "version": 1,
  "ratio": "9:16",
  "layers": [
    { "type": "image", "src": "frame.png", "x": 0, "y": 0, "w": 1080, "h": 1920, "rotation": 0, "z": 10, "opacity": 1 },
    { "type": "text",  "text": "Rentrée 2026", "x": 60, "y": 1700, "font": "Inter", "size": 64, "color": "#FFFFFF", "z": 11 }
  ]
}
```

Ce descripteur est la **source de vérité** : il est rejoué à l'identique côté créateur (aperçu) et côté participant (rendu final). C'est ce qui garantit la cohérence entre les deux points de vue.

### 3.4 Rendu côté client

Le placement et l'aperçu sont faits **dans le navigateur** (Canvas / Fabric.js). Aucune donnée de l'utilisateur ne part vers un serveur à cette étape.

---

## 4. Le Motion Engine (animation IA)

### 4.1 Pourquoi c'est le vrai différenciateur

Le reste du produit est techniquement classique. **Le motion design IA est la fonctionnalité premium la plus intéressante** — et la partie qui doit être pensée le plus intelligemment.

L'objectif : rendre un cadre animé **sans demander à l'utilisateur de faire du motion design**.

### 4.2 L'interface

```
Animer mon cadre ✨

Comment voulez-vous l'animer ?

✨ Automatique
```

avec des presets optionnels :

| Preset | Effet |
|---|---|
| **Apparition** | Le cadre entre en fondu / glisse |
| **Flottement** | Léger va-et-vient continu |
| **Mouvement** | Déplacement fluide sur l'écran |
| **Pulsation** | Battement d'échelle doux |
| **Élégant** | Transitions lentes, feutrées |
| **Énergique** | Mouvements rapides, ressort |

et une option **« Décris le mouvement »** en langage naturel :

> Ex. : « le logo apparaît doucement puis les éléments bougent légèrement »

### 4.3 La décision d'architecture décisive

**On ne génère pas toute la vidéo de l'utilisateur par une IA.** Ce serait inutilement coûteux et imprévisible. Le pipeline correct est :

```
Vidéo utilisateur
      ↓
Détection du format
      ↓
Placement du cadre (Frame Engine)
      ↓
Animation du cadre (Motion Engine)
      ↓
Composition finale
      ↓
MP4
```

**L'IA ne travaille que sur le mouvement du frame / overlay, jamais sur toute la vidéo.** C'est beaucoup plus intéressant économiquement : on génère des instructions de mouvement et des assets légers, puis on applique le tout avec un moteur vidéo déterministe sur la vidéo de l'utilisateur.

### 4.4 Séparation IA / moteur vidéo

```
IA           → génère l'animation, les instructions, les assets
Moteur vidéo → applique l'animation aux vidéos des utilisateurs
```

Cette séparation garde les coûts **prévisibles** : le poste cher (IA) produit de petites sorties ; le poste volumineux (vidéo) tourne sur une infrastructure bon marché et élastique.

### 4.5 Sur le choix du fournisseur IA — avertissement vérifié

Les modèles vidéo génératifs sont chers à l'usage. Les tarifs publiés pour **Sora 2 Pro** sont de l'ordre de **0,30 à 0,70 $ par seconde** selon la résolution. Surtout : **l'API Sora (Videos API, famille Sora 2) est annoncée comme dépréciée, avec une fermeture au 24 septembre 2026** — l'expérience web/app Sora ayant elle-même été arrêtée le 26 avril 2026 [OpenAI Help Center](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation).

> **Conséquence : ne jamais bâtir l'architecture de Campagnes autour de l'API Sora.** Le Motion Engine doit passer par une **couche d'abstraction de fournisseurs** (voir § 6.3) pour rester portable.

---

## 5. Le Media Engine

### 5.1 Fonction

Appliquer le cadre (statique ou animé) aux **photos** et **vidéos** des participants, et produire un export.

### 5.2 Photos

- Composition côté client (Canvas) → export PNG/JPG.
- Aucune donnée personnelle transmise : **la photo ne quitte jamais le téléphone**.
- Coût marginal serveur ≈ 0, vitesse optimale même en 3G.

### 5.3 Vidéos

La vidéo nécessite plus de puissance que le canvas photo. Trois stratégies, dans cet ordre :

| Stratégie | Quand | Outil | Statut de compatibilité |
|---|---|---|---|
| **Rendu client (WebCodecs)** | Appareils compatibles, clips courts | `WebCodecs` (VideoEncoder / VideoDecoder) | Disponibilité limitée sur les principaux navigateurs [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) · [caniuse](https://caniuse.com/webcodecs) |
| **Rendu client (FFmpeg.wasm)** | Navigateurs sans WebCodecs | `ffmpeg.wasm` | Portage WebAssembly pur, sans accélération GPU matérielle ; environ **25 fps en H.264 1080p sur un MacBook Pro 2018 (CPU à 100 %)** [ffmpeg.wasm benchmarks](https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/942) |
| **Rendu serveur** | Appareils faibles, clips longs, export haute qualité | FFmpeg côté serveur + file de traitement | Déterministe, coût maîtrisé |

**Règle produit :** on tente le rendu client d'abord (gratuit, privé, instantané), et on **bascule automatiquement sur le rendu serveur** quand l'appareil ou la durée dépasse le seuil supportable. L'utilisateur ne voit jamais cette bascule — il voit une barre de progression.

### 5.4 Stockage et diffusion vidéo

Pour le stockage, l'encodage et la diffusion des vidéos, **Cloudflare Stream** est le candidat naturel :
- **Stockage : 5 $ / 1 000 minutes / mois** (facturé selon la durée conservée, chaque mois où l'asset existe).
- **Diffusion : 1 $ / 1 000 minutes diffusées.**
- [Cloudflare Stream — Pricing](https://developers.cloudflare.com/stream/pricing/)

> Les vidéos des participants peuvent rester **côté client** si l'utilisateur ne les publie pas. Le stockage serveur n'est utilisé que pour les rendus serveur et les galeries.

---

## 6. Architecture technique

### 6.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONT (Next.js)                       │
│   Créer · Cadre · Animer · Partager · Statistiques           │
│   Canvas (Fabric.js) · WebCodecs · ffmpeg.wasm               │
└───────────────┬──────────────────────────────┬──────────────┘
                │                              │
     ┌──────────▼──────────┐        ┌──────────▼───────────┐
     │   API / BFF          │        │   File de rendu      │
     │  (campagnes, events) │        │  (rendu serveur      │
     └──────────┬───────────┘        │   FFmpeg)            │
                │                    └──────────┬───────────┘
     ┌──────────▼───────────┐       ┌───────────▼──────────┐
     │  Postgres / Supabase │       │  Stockage objets     │
     │  (données + events)  │       │  (R2 / Stream)       │
     └──────────────────────┘       └──────────────────────┘
                │
     ┌──────────▼───────────────────────────────────────────┐
     │  Couche d'abstraction IA (Motion Engine providers)   │
     │  → preset → instructions de mouvement                │
     └──────────────────────────────────────────────────────┘
```

### 6.2 Stack

```
Front                 Next.js (App Router) + Tailwind CSS
Canvas / composition  Fabric.js · <canvas>
Vidéo client          WebCodecs (si dispo) → ffmpeg.wasm (fallback)
Vidéo serveur         FFmpeg + workers (queue)
Stockage objets       Cloudflare R2 (assets) / Cloudflare Stream (vidéo diffusée)
Base de données       Supabase / Postgres
Auth créateur         Supabase Auth (email / Google)
Paiement              CinetPay / FedaPay (Mobile Money + carte, FCFA)
Analytics             Table `events` en Postgres + agrégation SQL
QR Code               génération serveur (lib `qrcode`)
Hébergement           Vercel + Cloudflare CDN
```

### 6.3 Couche d'abstraction IA (essentielle)

Le Motion Engine ne doit **jamais** appeler un fournisseur IA en dur. Une interface interne :

```
MotionProvider
  ├── describeToMotion(prompt, frameDescriptor) → MotionInstructions
  ├── presetToMotion(preset, frameDescriptor)   → MotionInstructions
  └── generateAsset(...)                        → asset léger (optionnel)

Implémentations interchangeables :
  ├── ProviderA (texte → instructions de mouvement)
  ├── ProviderB (modèle vidéo, usage marginal)
  └── FallbackLocal (presets déterministes, sans IA)
```

Avantages : portabilité, coût maîtrisé, dégradation gracieuse (si un fournisseur tombe ou disparaît — comme Sora —, on bascule sans réécrire le produit).

### 6.4 Modèle de données (complet)

```sql
-- Utilisateurs / organisations
users (
  id, email, org_name, plan, brand_color, logo_url,
  custom_domain, created_at
)

-- Cadres (Frame Engine) — réutilisables entre campagnes
frames (
  id, owner_id, name, descriptor_json,      -- calques (voir § 3.3)
  thumbnail_url, created_at
)

-- Animations (Motion Engine) — rattachées à un cadre
motions (
  id, frame_id, mode,        -- 'auto' | 'preset' | 'prompt'
  preset, prompt, instructions_json, status, created_at
)

-- Campagnes
campaigns (
  id, owner_id, name, slug, visibility,     -- public | unacces | prive
  frame_id, motion_id, ratio,               -- '1:1' | '16:9' | '9:16'
  media_types,                              -- {photo:true, video:true}
  badge_visible, unlock_motion, unlock_analytics,
  unlock_qr, unlock_branding, created_at
)

-- Rendu média (Media Engine)
renders (
  id, campaign_id, kind,      -- 'photo' | 'video'
  route,                      -- 'client' | 'server'
  status, duration_seconds, output_url, created_at
)

-- Événements analytics (append-only)
events (
  id, campaign_id, type,      -- view | apply | download | share |
                              -- photo_created | video_created
  device, os, browser, country, city, referrer,
  route, created_at
)

-- Abonnements / entitlements
subscriptions (
  id, owner_id, plan, provider, amount_fcfa,
  status, started_at, renews_at
)

entitlements (
  id, owner_id, module,       -- frame_pro | motion | analytics | qr | branding
  source,                     -- plan | achat_unitaire | essai
  expires_at
)
```

### 6.5 Endpoints principaux

```
# Campagnes
POST   /api/campaigns
GET    /api/campaigns/:id
PATCH  /api/campaigns/:id
DELETE /api/campaigns/:id

# Cadres
POST   /api/frames                 # créer un cadre (descriptor)
GET    /api/frames/:id
POST   /api/frames/:id/duplicate

# Animation
POST   /api/motions                # preset ou prompt → instructions
GET    /api/motions/:id

# Public / participant
GET    /api/c/:slug                # page campagne
POST   /api/c/:slug/event          # log analytics
POST   /api/c/:slug/render         # rendu serveur (si client impossible)

# Analytics & partage
GET    /api/campaigns/:id/analytics
GET    /api/campaigns/:id/qr
GET    /api/campaigns/:id/export   # CSV / rapport sponsor PDF

# Paiement & entitlements
POST   /api/payments/init
POST   /api/payments/webhook
GET    /api/entitlements
```

---

## 7. Monétisation et entitlements

### 7.1 Le principe

Chaque fonctionnalité avancée est une **unité monétisable**, mais on ne la présente **jamais** comme une grille de péage. On présente des **modules à débloquer dans le contexte de la campagne**.

### 7.2 Gratuit — Campagnes Free

| Inclus | Détail |
|---|---|
| Créer une campagne | illimité |
| Cadre statique | création et placement complets |
| Photo | oui |
| Vidéo | oui |
| 3 formats | Carré / Paysage / Vertical |
| Lien de campagne | oui |
| Watermark Campagnes | oui (sur la page, retirable en payant) |

### 7.3 Modules premium à débloquer

| Module | Ce qu'il débloque |
|---|---|
| **Frame Pro** | Création avancée de cadres (multi-calques illimités, templates premium, zones sûres, export de cadre) |
| **Motion** | Animation IA du cadre (presets + prompt libre) |
| **Analytics** | Statistiques complètes de campagne (voir § 7.4) |
| **QR Code** | Génération automatique : `campagnes.app/c/ramadan` → QR code |
| **Branding** | Suppression du watermark, logo, couleur de marque, domaine personnalisé |

### 7.4 Analytics — liste complète

Le module Analytics doit être **le plus complet du marché local**, car c'est lui qui justifie l'abonnement auprès d'une ONG, d'une école ou d'un sponsor :

- **Visites** (vues de la page campagne)
- **Photos créées**
- **Vidéos créées**
- **Téléchargements**
- **Partages**
- **Appareils** (mobile / desktop, OS, navigateur)
- **Pays** (et ville, si disponible)
- **Évolution dans le temps** (courbe par jour / par heure)
- **Source / référent** (WhatsApp, Instagram, lien direct, QR)
- **Taux de conversion** : visites → créations → téléchargements
- **Export CSV** et **rapport sponsor PDF**

### 7.5 Grille tarifaire indicative (FCFA)

| Plan | Prix | Cible | Contenu |
|---|---|---|---|
| **Free** | 0 FCFA | Associations, écoles, particuliers | Modules de base + watermark |
| **Pro** | ~4 900 FCFA/mois | ONG, événements, PME, écoles privées | Frame Pro + Analytics + QR + suppression watermark |
| **Motion** | ~7 900 FCFA/mois (ou à l'unité) | Créateurs, marques, campagnes vidéo | Motion IA + rendus vidéo serveur |
| **Organisation** | ~19 900 FCFA/mois | Grandes ONG, universités, agences, partis | Multi-utilisateurs, Branding complet, domaine propre, galerie, support prioritaire |
| **Éducation** | Gratuit | Universités publiques, lycées | Pro offert |

**Pourboire volontaire** sur la page participant (100 / 200 / 500 FCFA) : monétisation non-intrusive. **Jamais** de paywall sur la photo ou la vidéo du participant.

### 7.6 Paiement

- Agrégateur : **CinetPay** (ou **FedaPay**) — plus de 8 à 10 pays d'Afrique francophone avec un seul contrat.
- Frais marchand indicatifs : **1,5 % à 3,5 %** selon le pays ; Mobile Money ~ 1 % à 3,5 % ; ordre de grandeur courant **~3 % + 50 FCFA** par transaction MoMo ; carte ~3,2 % + 100 FCFA [CinetPay Pricing](https://cinetpay.com/pricing).
- **Toujours facturer en FCFA.** Plusieurs rails (Wave + Orange Money + MTN MoMo + carte) pour réduire les échecs. Retry + fallback USSD.

---

## 8. Sécurité, modération et données

### 8.1 Protection des données (principe par défaut)

- La photo et la vidéo du participant **restent sur son appareil** par défaut.
- Rendu serveur uniquement si nécessaire (appareil faible / clip long), avec **suppression automatique** après un délai court et consentement explicite.
- Conformité RGPD / lois locales (Côte d'Ivoire, Sénégal, etc.) : minimisation, durées de conservation courtes, journalisation des accès.

### 8.2 Modération

- Campagnes publiques : **modération a posteriori** + signalement par les utilisateurs.
- Détection automatique de contenus interdits (nudité, violence, haine) avant publication d'une galerie publique.
- Campagnes de sensibilisation sensibles (santé, politique) : règles renforcées.

### 8.3 Abus et fraude

- Limitation de débit (rate limiting) sur les endpoints de rendu.
- Vérification des paiements via webhook signé.
- Détection des campagnes de spam / phishing (nom, slug, contenu).

### 8.4 Sécurité des assets

- URLs signées, expirantes, pour les rendus et les cadres privés.
- Watermark appliqué **côté serveur** pour garantir qu'il ne peut pas être retiré en client.

---

## 9. Passage à l'échelle

### 9.1 Le levier principal : tout faire côté client

Le rendu photo en client rend le **coût marginal quasi nul** et garantit la vitesse en 3G. C'est un avantage structurel sur les concurrents qui rendent côté serveur.

### 9.2 Vidéo : maîtriser le coût

- Rendu client en priorité (WebCodecs, puis ffmpeg.wasm).
- Bascule serveur uniquement pour les cas lourds.
- File de rendu avec priorité par plan (Free = différé, payant = prioritaire).
- Plafonds de durée et de résolution, adaptés au plan.

### 9.3 Infrastructure

- CDN global (Cloudflare) pour les cadres et les assets statiques.
- Base de données avec agrégats pré-calculés pour les analytics (au lieu de compter les `events` en direct sur de gros volumes).
- Recherche/annuaire de campagnes séparé, indexé, pour le SEO.

### 9.4 Coûts d'IA maîtrisés

- L'IA ne produit que de **petites sorties** (instructions de mouvement, assets légers).
- Cache des animations : un preset appliqué à un même cadre est réutilisé.
- Quotas et budgets par compte pour éviter les dérives.

---

## 10. Roadmap vers le produit fini

### Phase A — Socle : Frame Engine + campagne
- Charte « Campagnes » codée : noir `#000000`, dégradé `#7B61FF → #FF6B6B → #FFD93D`, logo en Satisfy Bold, texte en Inter.
- Auth créateur, création de campagne, canvas de cadre (déplacer / redimensionner / pivoter / devant-derrière), 3 formats.
- Descripteur de cadre versionné.

### Phase B — Media Engine photo + participant
- Page participant mobile-first : lien → photo → cadre appliqué → téléchargement (tout en client).
- Sans compte, sans app.

### Phase C — Analytics + QR + partage
- Table `events`, dashboard complet (§ 7.4), QR code, partage WhatsApp.
- Billing : Free + Pro, CinetPay/FedaPay en FCFA, entitlements.

### Phase D — Media Engine vidéo
- Détection de format, placement + composition, export MP4.
- WebCodecs → ffmpeg.wasm → bascule serveur.
- Stockage/diffusion (Cloudflare Stream).

### Phase E — Motion Engine (animation IA)
- Presets (Apparition / Flottement / Mouvement / Pulsation / Élégant / Énergique) + prompt libre.
- Couche d'abstraction fournisseurs IA.
- Module Motion premium + rendus vidéo.

### Phase F — Branding & Organisation
- Suppression du watermark, logo, couleur, domaine personnalisé.
- Multi-utilisateurs, galerie publique modérée, rapport sponsor PDF, export CSV.

### Phase G — Internationalisation et annuaire
- Anglais, annuaire public de campagnes (SEO), templates communautaires.
- Application mobile native **uniquement** après traction significative.

---

## 11. Indicateurs de réussite (produit fini)

| Indicateur | Définition | Cible |
|---|---|---|
| Completion participant | Visite → téléchargement | **> 40 %** |
| Campagnes actives / semaine | Nouvelles campagnes | forte croissance mensuelle |
| Adoption Motion | % de campagnes avec cadre animé | levier premium principal |
| Conversion Free → payant | Modules débloqués | 5 à 8 % |
| Coût marginal / campagne | Rendu photo + vidéo | aussi bas que possible (rendu client) |
| Viralité | Visiteurs rapportés par participant | ≥ 0,5 |

---

## 12. Risques et parades

| Risque | Parade |
|---|---|
| Dépendance à une API IA (ex. Sora dépréciée) | Couche d'abstraction fournisseurs + fallback déterministe local |
| Coût vidéo explosif | Rendu client prioritaire, plafonds par plan, file de rendu |
| Faible support WebCodecs | Fallback ffmpeg.wasm puis rendu serveur, transparent pour l'utilisateur |
| Contenus abusifs | Modération a posteriori + détection automatique |
| Échecs de paiement mobile | Multi-rails + retry + fallback USSD |
| Un acteur global ajoute le français + Mobile Money | Profondeur locale : WhatsApp, FCFA, rapport sponsor, support en français |
| Complexité qui s'invite dans l'UX | Règle absolue : jamais de panneau de configuration. Déposer → positionner → prêt. |

---

## 13. L'identité du produit, à ne jamais perdre

> **Campagnes — Les campagnes visuelles, sans la complexité.**

Trois moteurs (Frame, Motion, Media). Cinq actions (Créer, Cadre, Animer, Partager, Statistiques). Deux points de vue (créateur, participant) sur **une même campagne**. Et une discipline constante : **masquer toute la complexité technique**.

---

*Sources vérifiées : [OpenAI — Sora discontinuation](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation) (API fermée le 24 septembre 2026 ; web/app arrêtés le 26 avril 2026) · [Cloudflare Stream — Pricing](https://developers.cloudflare.com/stream/pricing/) (5 $ / 1 000 min stockées, 1 $ / 1 000 min diffusées) · [MDN — WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) (disponibilité limitée) · [ffmpeg.wasm — benchmarks](https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/942) (~25 fps H.264 1080p, MacBook Pro 2018) · [CinetPay — Pricing](https://cinetpay.com/pricing) (1,5 % à 3,5 %).*
