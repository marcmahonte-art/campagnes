# Campagnes — Architecture (Phase A : socle + compte créateur · Phase B : formules, distribution, animation)

> **Règle absolue du produit** : ne jamais exposer de panneau de configuration complexe.
> **Principe** : *je dépose → je positionne → c'est prêt.*

---

## 1. Ce qui a été analysé

| Source | Ce qu'elle apporte |
|---|---|
| `docs/design (8).md` | Design system officiel : direction artistique, palette, typo, rayons, ombres, boutons, motion. |
| `docs/plan_implementation_campagnes (1).md` | Stack cible, positionnement marché, roadmap par phases. |
| `docs/plan_produit_campagnes.md` | Vision produit, les 3 moteurs (Frame / Motion / Media), les 5 actions. |
| `docs/revue_plan_campagnes.md` | Revue critique (QR code : gratuit vs premium). Hors périmètre Phase A. |
| `logo campagnes final.svg`, `logo dégradé.png`, `echanti.png` | Wordmark script « Campagnes », terminaison dégradée sur le `s`. |

### Point de vigilance relevé : deux définitions du dégradé

| Source | Dégradé |
|---|---|
| Brief de cette phase (et Phase 0 du plan d'implémentation) | `#7B61FF → #FF6B6B → #FFD93D` |
| `design (8).md` §3.2 / §28 | `#7B1FFF → #FF36B8 → #FF6B68 → #FFD93D` |

**Décision retenue** : un seul dégradé dans tout le produit, celui du brief —
`linear-gradient(135°, #7B61FF → #FF6B6B → #FFD93D)`, exposé sous **un unique token**
`--gradient-brand` / `bg-brand-gradient`. Aucun autre dégradé n'est créé nulle part
(pas de dégradé « au survol », pas de variante, pas de dégradé de substitution).
La variante à 4 arrêts de `design (8).md` reste documentée ci-dessus pour arbitrage.

---

## 2. Arborescence du projet

```
campagnes/
├── app/
│   ├── layout.tsx                    # <html>, polices Inter + Satisfy, SessionProvider
│   ├── globals.css                   # tokens Campagnes (couleurs, rayons, ombres, motion)
│   ├── page.tsx                      # landing / hero marketing (§23 du design system)
│   │
│   ├── (auth)/                       # groupe de routes publiques sans chrome dashboard
│   │   ├── layout.tsx
│   │   ├── login/page.tsx            # connexion email/mot de passe + Google
│   │   ├── signup/page.tsx           # inscription
│   │   └── onboarding/page.tsx       # nom d'organisation + @pseudo + logo (1 écran)
│   │
│   ├── (creator)/                    # groupe privé (garde d'accès)
│   │   ├── layout.tsx                # coquille : barre latérale desktop / tab bar mobile
│   │   ├── dashboard/page.tsx        # « Mes campagnes » + bouton Nouvelle campagne
│   │   ├── campaigns/
│   │   │   ├── new/page.tsx          # nom + slug + format → crée le brouillon
│   │   │   └── [id]/page.tsx         # Frame Engine + Motion + JSON + publication
│   │   ├── analytics/page.tsx        # usage des formats et état des campagnes
│   │   ├── qr-codes/page.tsx         # un QR code par campagne publiée
│   │   └── settings/page.tsx         # formule, profil, email, mot de passe, suppression
│   │
│   ├── tarifs/page.tsx               # grille publique + matrice comparative
│   ├── galerie/page.tsx              # campagnes publiées, tous créateurs
│   ├── c/[slug]/page.tsx             # parcours participant : public, sans compte
│   ├── u/[username]/page.tsx         # profil public du créateur (URL canonique)
│   └── auth/callback/route.ts        # échange du code OAuth (Google) contre une session
│
├── components/
│   ├── ui/                           # atomes du design system
│   │   ├── button.tsx                # primary / secondary / ghost / destructive
│   │   ├── input.tsx                 # hauteur 48px, rayon 12px, focus violet
│   │   ├── card.tsx
│   │   ├── badge.tsx                 # brouillon / publié / PRO
│   │   ├── feedback.tsx              # erreurs en ligne, info, bandeau démo
│   │   ├── logo.tsx                  # wordmark « Campagnes » (Satisfy)
│   │   ├── logo-upload.tsx
│   │   └── ratio-picker.tsx          # Carré · Paysage · Vertical (jamais une résolution)
│   ├── dashboard/
│   │   ├── nav.tsx                   # navigation sensible à la formule
│   │   └── campaign-card.tsx
│   ├── campaign/
│   │   ├── motion-panel.tsx          # Motion Engine : presets, description, export
│   │   └── descriptor-viewer.tsx     # le JSON du descripteur, inspectable
│   ├── plans/
│   │   ├── plan-card.tsx             # carte de formule + pastille de formule
│   │   ├── comparison-table.tsx      # matrice, repliée en blocs sur mobile
│   │   ├── feature-gate.tsx          # verrou d'un module premium
│   │   ├── pricing-plans.tsx         # grille interactive (activation de formule)
│   │   └── offer-card.tsx            # offre de distribution : volume, prix, devis
│   ├── participant/
│   │   └── participant-stage.tsx     # photo du participant derrière le cadre (Fabric)
│   └── frame/
│       └── frame-editor.tsx          # canvas Fabric.js (Frame Engine + lecture d'animation)
│
├── lib/
│   ├── types.ts                      # User, Frame, Campaign, Descriptor, GalleryItem…
│   ├── plans.ts                      # formules, droits, libellés, matrice, modules premium
│   ├── distribution.ts               # grille tarifaire FCFA + demande de devis
│   ├── participant.ts                # composition cadre + photo, couverture, contraintes
│   ├── motion.ts                     # Motion Engine — pur et déterministe
│   ├── video-export.ts               # rendu hors écran : PNG + WebM, badge du plan Free
│   ├── watermark.ts                  # badge « Créé avec Campagnes » — géométrie partagée
│   ├── descriptor.ts                 # création / lecture / validation du JSON versionné
│   ├── ratios.ts                     # 1:1 · 16:9 · 9:16 → dimensions de travail
│   ├── slug.ts                       # slugify + génération de slug unique
│   ├── backend/
│   │   ├── index.ts                  # façade unique (détecte Supabase ou mode local)
│   │   ├── types.ts                  # contrat `Backend`
│   │   ├── supabase.ts               # implémentation réelle
│   │   ├── local.ts                  # implémentation de démo (localStorage)
│   │   └── session.tsx               # SessionProvider / useSession
│   └── supabase/
│       ├── client.ts                 # client navigateur
│       └── server.ts                 # client serveur (cookies)
│
├── middleware.ts                     # /@pseudo → /u/pseudo  +  rafraîchissement de session
├── supabase/migrations/0001_init.sql          # tables + RLS + trigger + storage + vue
├── supabase/migrations/0002_plans_distribution.sql # formules + grille tarifaire + fonction SQL
├── docs/ARCHITECTURE.md              # ce document
├── .env.example
├── tailwind.config.ts
├── next.config.mjs
└── tsconfig.json
```

### Deux décisions d'URL à connaître

1. **`/@pseudo` en Next.js App Router** : un dossier nommé `@pseudo` serait interprété
   comme un *slot* de route parallèle. Le profil vit donc sur `/u/[username]`, et
   `middleware.ts` réécrit `/@pseudo` → `/u/pseudo`. L'URL publique promise au créateur
   (`campagnes.app/@nomdutilisateur`) fonctionne à l'identique.
2. **`/c/[slug]`** (page participant) est réservé mais **volontairement non construit**
   en Phase A — c'est le hors-périmètre explicite du brief.

---

## 3. Schéma Postgres

Fichier exécutable : `supabase/migrations/0001_init.sql`.

### 3.1 Tables

```
users (
  id uuid pk → auth.users(id) on delete cascade,
  email text unique not null,
  username text unique not null,        -- ^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$
  org_name text,
  logo_url text,
  plan plan_kind not null default 'free',   -- 'free' | 'pro' | 'org'
  onboarded_at timestamptz,                 -- ← seule colonne ajoutée au brief
  created_at timestamptz not null default now()
)

frames (
  id uuid pk default gen_random_uuid(),
  owner_id uuid not null → users(id) on delete cascade,
  name text not null default 'Cadre',
  descriptor_json jsonb not null default {version:1, ratio:"1:1", layers:[]},
  thumbnail_url text,
  created_at timestamptz not null default now()
)

campaigns (
  id uuid pk default gen_random_uuid(),
  owner_id uuid not null → users(id) on delete cascade,
  name text not null,
  slug text unique not null,
  frame_id uuid → frames(id) on delete set null,
  ratio frame_ratio not null default '1:1',   -- '1:1' | '16:9' | '9:16'
  status campaign_status not null default 'draft',  -- 'draft' | 'published'
  created_at timestamptz not null default now()
)
```

**Pourquoi `onboarded_at` ?** Le brief liste les colonnes métier, pas les colonnes
d'état. Sans ce champ, l'application devrait deviner si l'onboarding est terminé en
testant si le pseudo commence par un motif réservé — fragile. C'est le seul écart,
il est explicite et réversible (une ligne à supprimer).

### 3.2 Contraintes qui protègent le produit

- `frames_descriptor_shape` : le JSON doit **toujours** contenir `version`, `ratio` et
  un tableau `layers`. Un descripteur non rejouable est rejeté par la base, pas par
  le client. C'est la garantie du contrat « rejouable à l'identique ».
- `users_username_format` / `campaigns_slug_format` : le pseudo et le slug sont des
  segments d'URL ; la regex empêche les collisions et les caractères invalides.
- Types énumérés plutôt que `text` libre : `plan`, `status`, `ratio`.

### 3.3 Policies RLS

| Table | Opération | Qui | Règle |
|---|---|---|---|
| `users` | SELECT | authenticated | `id = auth.uid()` — **on ne lit que sa propre ligne** (email, plan privés) |
| `users` | INSERT / UPDATE / DELETE | authenticated | `id = auth.uid()` |
| `frames` | SELECT | anon + authenticated | propriétaire **ou** cadre référencé par une campagne `published` |
| `frames` | INSERT / UPDATE / DELETE | authenticated | `owner_id = auth.uid()` |
| `campaigns` | SELECT | anon + authenticated | `owner_id = auth.uid()` **ou** `status = 'published'` |
| `campaigns` | INSERT / UPDATE / DELETE | authenticated | `owner_id = auth.uid()` |
| `storage.objects` (bucket `media`) | SELECT | anon + authenticated | `bucket_id = 'media'` |
| `storage.objects` (bucket `media`) | INSERT / UPDATE / DELETE | authenticated | dossier racine = `auth.uid()` |

### 3.4 Le profil public sans fuite de données

RLS filtre des **lignes**, pas des **colonnes**. Comme `users` contient `email` et
`plan`, on n'ouvre pas la table aux anonymes : on expose une **vue**
`public.creator_profiles` (`id, username, org_name, logo_url, created_at, watermark`)
accordée à `anon` et `authenticated`. La page `/u/[username]` et le parcours participant
lisent la vue, jamais la table.

`watermark` est un booléen **dérivé** de la formule (`plan = 'free'`), pas la formule
elle-même : le parcours participant doit savoir s'il doit marquer le visuel qu'il produit,
et rien de plus. Voir §9.4.

### 3.5 Création automatique du profil

Un trigger `on_auth_user_created` insère la ligne `public.users` à chaque inscription
dans `auth.users`, avec un pseudo provisoire dérivé de l'email (dédupliqué par boucle).
Raison : Google OAuth ne permet pas d'intercepter l'inscription côté client — le trigger
couvre les deux chemins. `/onboarding` ne fait ensuite qu'un `UPDATE`.

---

## 4. Le descripteur de cadre (contrat de rejouabilité)

```jsonc
{
  "version": 1,
  "ratio": "9:16",
  "background": "transparent",
  "photo_anchor": "l1",          // facultatif — voir §9.2
  "layers": [
    { "id": "l1", "type": "image", "src": "…", "x": 0, "y": 0, "w": 1080, "h": 1920,
      "rotation": 0, "z": 10, "opacity": 1 },
    { "id": "l2", "type": "text",  "text": "Rentrée 2026", "font": "Inter",
      "size": 96, "color": "#FFFFFF", "align": "center",
      "x": 120, "y": 1500, "w": 840, "rotation": 0, "z": 20, "opacity": 1 }
  ]
}
```

Règles :

- `version` est **obligatoire** et incrémentée à tout changement de structure.
- Les coordonnées sont exprimées dans le **repère du ratio** (1080×1080, 1920×1080,
  1080×1920) — jamais dans le repère de l'écran. C'est ce qui rend le cadre rejouable
  sur un écran de créateur comme sur le futur rendu participant.
- `lib/descriptor.ts` est le seul endroit qui écrit ou relit ce JSON.
- `photo_anchor` est **facultatif et omis quand absent** : un cadre en mode Cadre se
  sérialise exactement comme avant l'introduction de la zone photo. La contrainte
  `frames_descriptor_shape` n'exige que `version`, `ratio` et `layers` — les champs
  additionnels sont donc acceptés sans migration.
- Le composant `DescriptorViewer` l'affiche en clair dans l'éditeur : c'est le livrable
  « JSON visible/inspectable » demandé. Il affiche aussi le mode retenu (cadre entier ou
  zone photo) et les avertissements de `validateDescriptor()`.

---

## 5. Mode de fonctionnement des données

`lib/backend/index.ts` expose une façade unique. Au démarrage :

- Si `NEXT_PUBLIC_SUPABASE_URL` **et** `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont définis →
  **mode Supabase** (Auth réelle, Postgres, RLS, Storage).
- Sinon → **mode local de démonstration** : mêmes signatures, persistance
  `localStorage`. Permet de parcourir tout le parcours Phase A (inscription →
  onboarding → campagne → cadre → publication → profil public) sans provisionner
  quoi que ce soit. Un bandeau discret signale le mode actif.

Le code applicatif ne connaît **jamais** le mode : il appelle la façade. Brancher
Supabase ne demande donc aucune réécriture d'écran.

---

## 6. Design tokens appliqués

Tout est défini une fois dans `app/globals.css` et `tailwind.config.ts` :

```
Noir           #000000
Gris clair     #E5E7EB      Gris texte  #6B7280      Blanc #FFFFFF
Violet #7B61FF   Corail #FF6B6B   Jaune #FFD93D       (les 3 arrêts du brief)

--gradient-brand: linear-gradient(135deg, #7B61FF 0%, #FF6B6B 50%, #FFD93D 100%)

Rayons  8 / 12 / 16 / 24 / 999
Ombres  0 2px 8px rgba(0,0,0,.06) · 0 8px 24px rgba(0,0,0,.08) · 0 16px 48px rgba(0,0,0,.12)
Motion  120–180ms micro · 180–250ms transition · cubic-bezier(.2,.8,.2,1)
Typos   Inter (UI) · Satisfy (wordmark uniquement)
```

Répartition imposée : **80 % neutres · 15 % noir · 5 % couleur**. Le dégradé reste un
accent (CTA principal, état actif, halo), jamais un fond permanent.

---

## 7. Formules et distribution (Phase B)

Fichier exécutable : `supabase/migrations/0002_plans_distribution.sql`.

### 7.1 Le modèle, en une phrase

**L'abonnement paie les outils, la distribution se paie à l'usage.**
Les modules (Frame Pro, Motion, Analytics, QR, Branding, Domaine…) sont binaires : une
formule les a, ou ne les a pas. La diffusion, elle, se facture par volume — sur devis.

### 7.2 Décision de schéma : renommer plutôt que recréer

La migration 0001 créait `plan_kind as enum ('free','pro','org')` — des brouillons. La
grille tarifaire fixe les noms définitifs. 0002 fait donc un `alter type … rename value`
(Postgres ≥ 10) au lieu de recréer le type : les lignes existantes ne sont pas perdues.
`'pro'` → `'creator'`, `'org'` → `'organization'`. Un filet de sécurité recrée le type
si la 0001 n'avait pas encore été appliquée.

### 7.3 Pas de solde, pas de compteur, pas de journal

Décision produit assumée : **le produit n'affiche jamais un faux bouton d'achat.** La
distribution se traite au cas par cas, donc il n'existe volontairement aucune de ces
colonnes ni tables :

- pas de `users.credits`, pas de `campaigns.distribution_budget` ni `credits_consumed` ;
- pas de `credit_transactions` ni d'enum `credit_reason` ;
- pas de fonction `consume_participation` ni `purchase_credit_pack`.

Conséquence directe : rien à décompter, donc **aucune logique d'argent à faire respecter
côté serveur**. C'est le principal gain de simplicité de cette version.

> Une version antérieure de la migration portait un système de crédits (1 participant =
> 1 crédit). Il a été retiré sur décision produit. La base n'ayant jamais été
> provisionnée, le fichier 0002 a été réécrit plutôt que corrigé par une 0003.

### 7.4 La grille tarifaire vit en base

`public.distribution_offers(id, name, participants, price_fcfa, sort_order)` porte les
volumes et les prix. Le fichier `lib/distribution.ts` n'en est que le **miroir
d'affichage** — il ajoute ce que la table n'a pas à porter : la description commerciale
de chaque offre et le libellé du palier « sur devis ».

Conséquence voulue : un changement de prix ne demande **aucun redéploiement**, une simple
édition de ligne dans le tableau de bord Supabase suffit.

RLS : **lecture publique** (`anon`, `authenticated`) — la grille est affichée sur la page
tarifs sans compte. **Aucune policy d'écriture** : la grille se modifie en `service_role`.

Le palier « Grand volume » (10 000 participants et plus) n'est **pas** dans la table : il
se traite sur devis, cas par cas.

### 7.5 La demande de devis remplace l'achat

`lib/distribution.ts` expose `quoteHref(offer)` : une URL `mailto:` pré-remplie (objet et
corps reprenant le volume et le prix affiché). Chaque `OfferCard` pointe dessus. C'est le
seul « bouton d'action » de la section distribution — pas de panier, pas de paiement
simulé, pas de redirection vers un prestataire.

`formatFcfa()` centralise l'affichage (`fr-FR`, espace insécable fine normalisée en espace
simple, suffixe ` FCFA`). Aucun écran ne réécrit un prix à la main.

### 7.6 Activation d'une formule

Une seule fonction `security definer` subsiste : `set_own_plan(p_plan plan_kind)`. Elle
vérifie `auth.uid()` puis met à jour la ligne de l'appelant — rien d'autre.

> **À verrouiller avant production.** `set_own_plan` est exécutable par `authenticated`
> pour permettre la recette sans prestataire branché. En production elle doit être
> révoquée pour `authenticated` et réservée au webhook de paiement (`service_role`).
> C'est écrit dans l'en-tête et dans le commentaire de la fonction.

### 7.7 Où vit chaque règle

| Règle | Fichier | Consommé par |
|---|---|---|
| Quels modules pour quelle formule | `lib/plans.ts` → `hasFeature()` | nav, verrous, export |
| Volumes, prix affichés, libellé du devis | `lib/distribution.ts` | page tarifs |
| Prix faisant foi pour un devis | `distribution_offers` (Postgres) | tableau de bord Supabase |
| Activation d'une formule | `set_own_plan` (`0002_plans_distribution.sql`) | Postgres uniquement |

Un seul point de vérité par règle. Aucun écran ne redéfinit un droit ni un prix en local.

---

## 8. Motion Engine et export

### 8.1 Le Motion Engine est pur et déterministe

`lib/motion.ts` ne touche ni au DOM ni au canvas. Il produit un `MotionPlan`
(paramètres), puis `sampleAt(plan, layerIndex, tMs, w, h)` renvoie la transformation d'un
calque à un instant donné : `{ opacity, dx, dy, scale, rotation }`.

**Le même `sampleAt()` alimente l'aperçu et l'export.** C'est la garantie structurelle
que l'aperçu et la vidéo ne peuvent pas diverger — il n'y a pas deux implémentations à
tenir synchronisées.

### 8.2 L'utilisateur ne règle rien

`interpretPrompt()` traduit une phrase française en plan, par mots-clés, après
normalisation (accents retirés, minuscules) :

> « le cadre apparaît doucement puis flotte légèrement » → fondu + flottement, rythme lent.

Aucun keyframe, aucun easing, aucun FPS, aucune durée n'est exposé — conformément à la
règle absolue du produit. `interpretPrompt` est le point de branchement naturel d'un vrai
modèle de langage : la signature ne changerait pas, seul le corps.

Le plan est **stocké dans le descripteur** (`descriptor.motion`). Un cadre animé reste donc
rejouable à l'identique, exactement comme un cadre statique — c'est ce qui permet de le
rejouer côté participant en Phase C sans stocker de vidéo.

### 8.3 Le rendu ne capture jamais le canvas d'édition

`lib/video-export.ts` reconstruit un `StaticCanvas` **hors écran**, à la résolution native
du format, à partir du descripteur. Conséquence : l'export ne dépend ni du zoom, ni de la
taille de la fenêtre, ni du DPR de la machine.

| Sortie | Mécanisme |
|---|---|
| PNG | `toDataURL` sur le canvas hors écran |
| WebM | `MediaRecorder` sur `canvas.captureStream(fps)` |

Aucune dépendance externe, aucun rendu serveur, aucun téléversement : la vidéo est produite
dans le navigateur. Le type MIME est négocié (`vp9` → `vp8` → `webm` → `mp4`) et
l'extension du fichier suit le type réellement obtenu.

### 8.4 Le badge « Créé avec Campagnes »

Le plan Free appose un badge dans le coin inférieur droit : une pastille blanche à 94 %
(rayon = demi-hauteur), contenant le mot « Créé avec » puis le logo Campagnes. La pastille
n'est pas décorative — la photo du participant peut être sombre, claire ou bariolée, et un
texte nu y disparaîtrait.

Toute la géométrie vit dans `lib/watermark.ts`, en pixels **natifs** du format, et
`addBadge()` est appelée par les trois rendus : l'export PNG, l'export vidéo **et** l'aperçu
participant. C'est délibéré : un aperçu redessiné en HTML finirait par diverger de quelques
pixels, et le participant ne découvrirait le badge qu'après téléchargement.

Le badge est ajouté **après** le calcul des transformations et n'entre pas dans la liste des
objets animés : il reste donc immobile pendant toute la séquence.
`hasFeature(plan, 'no_watermark')` est le seul arbitre.

---

## 9. Le parcours participant (Phase C)

Route publique : `app/c/[slug]/page.tsx`. Aucune garde d'accès, aucune session, aucun
formulaire. C'est le seul écran que voit la communauté du créateur.

### 9.1 Une seule idée : la photo est un calque comme un autre

Le descripteur du créateur n'est **jamais** modifié. `composeDescriptor()`
(`lib/participant.ts`) y glisse une couche image à la bonne place. Le rendu emprunte ensuite
le chemin déjà existant — `exportPng()` et `exportVideo()` de `lib/video-export.ts`.

Conséquence recherchée : **l'aperçu et le fichier téléchargé ne peuvent pas diverger**, et
le parcours participant n'a introduit aucune nouvelle logique de rendu. Le contrat de
rejouabilité du descripteur tient sa promesse.

### 9.2 Deux modes, une seule géométrie : la zone

Le descripteur porte un champ optionnel `photo_anchor` — l'identifiant du calque qui
délimite la zone photo.

| `photo_anchor` | Mode | Où va la photo |
|---|---|---|
| absent | **Cadre** | sous tous les calques ; visible à travers les zones transparentes du PNG |
| présent | **Fond** | **juste au-dessus** du calque désigné ; elle le masque dans la zone, son décor reste visible autour |

Le choix « au-dessus de l'ancre » est délibéré : si la photo passait *sous* un calque
opaque, elle serait invisible. Au-dessus, l'ancre sert de repère et disparaît dans la zone —
ce qui rend le mode Fond impossible à rater, même avec un calque plein.

`photoZone()` (`lib/descriptor.ts`) renvoie le rectangle à couvrir : le cadre entier en mode
Cadre, l'**emprise** du calque désigné en mode Fond — rotation comprise, car la rotation
s'applique autour du centre et le rectangle englobant est la seule forme pour laquelle la
règle de couverture reste exacte.

Conséquence architecturale : **tout le reste du module s'écrit en arithmétique de
rectangle**, sans jamais connaître le format. Un seul jeu de tests couvre les deux modes.

### 9.3 La photo couvre toujours la zone

Un cadre est un PNG à zones transparentes : si la photo laissait un trou, on verrait le
damier. Le domaine de déplacement est donc borné, et il est **toujours inclus dans les
négatifs ou nuls** — la photo déborde de la zone, jamais l'inverse.

| Fonction | Rôle |
|---|---|
| `coverSize()` | taille minimale pour couvrir la zone (zoom = 1) |
| `placementBounds()` | domaine autorisé du coin supérieur gauche |
| `clampPlacement()` | ramène un placement dans ce domaine |
| `zoomAroundCenter()` | zoome en gardant fixe le point sous le centre de la zone |
| `movableAxes()` | dit si la photo peut encore bouger sur chaque axe |

Au zoom minimal, l'axe qui contraint la couverture a un domaine réduit à un point : il est
donc verrouillé, ce qui est le comportement attendu et non un bug. `zoomAroundCenter()`
existe parce que zoomer sans compenser ferait « sauter » la photo vers un coin — le
réglage paraîtrait cassé.

Les contraintes sont appliquées **aussi pendant le glissement** (`object:moving`), pas
seulement à la fin : le participant ne voit jamais un trou apparaître puis disparaître.

Deux détails qui comptent :

- **La découpe est `absolutePositioned`.** Le rectangle de découpe vit dans le repère du
  canvas, donc il ne suit ni le déplacement de la photo ni le zoom de la vue. Un rectangle
  relatif à l'objet glisserait avec la photo — c'est la différence entre « la photo
  apparaît dans la fenêtre » et « la fenêtre se promène sur la photo ». Fabric neutralise
  pour cela la transformation de l'objet dans le contexte de découpe, et
  `shouldLayoutClipPath()` renvoie `false` : la découpe n'affecte donc pas la boîte
  englobante, ce qui est indispensable puisque `clampPlacement()` lit `left`/`top`.
- **Aucun arrondi dans `photoLayer()`.** Le placement affiché et le placement exporté sont
  les mêmes nombres, au bit près. Un `Math.round()` sur la taille de la photo pouvait la
  rétrécir d'un demi-pixel et rouvrir un liseré de damier sur le bord de la zone.

### 9.4 En mode Fond, la zone est fixe

`sampleAt()` (`lib/motion.ts`) indexe les mouvements **par position de calque**, et chaque
calque s'anime autour de sa propre origine. Une fenêtre qui bougerait pendant que la photo
reste immobile laisserait donc forcément dépasser la photo d'un côté : la couverture est
impossible à garantir dès que l'ancre est animée.

Le mouvement du calque qui délimite la zone est donc **neutralisé** par
`effectiveMotion()`. Les autres calques continuent d'animer normalement — c'est même le
rendu attendu d'une affiche à fenêtre photo : une fenêtre stable, un décor qui vit.

Cette règle vit dans **une seule fonction**, appelée par trois consommateurs :

| Consommateur | Fichier |
|---|---|
| Aperçu du créateur | `components/frame/frame-editor.tsx` |
| Export PNG / vidéo | `lib/video-export.ts` |
| Parcours participant | `lib/participant.ts` → `composeDescriptor()` |

C'est ce qui interdit à l'aperçu du créateur de mentir : s'il voyait son fond bouger alors
que le participant le verra fixe, il validerait un cadre qui ne ressemble pas à ce qui sera
produit. `validateDescriptor()` avertit d'ailleurs le créateur quand sa zone sera figée.

### 9.5 L'insertion de la photo ne décale pas l'animation

Puisque `sampleAt()` lit `plan.layers[layerIndex % plan.layers.length]`, glisser la photo
au milieu du descripteur décalerait tous les calques suivants : le cadre ne jouerait plus
la même animation.

`composeDescriptor()` appelle donc `insertNeutralMotion()` (`lib/descriptor.ts`), qui
complète le plan jusqu'au nombre de calques puis insère un **mouvement neutre** à la
position de la photo. Les calques du créateur gardent très exactement le leur, et
`motion.layers.length === layers.length` reste vrai — donc l'avertissement de validation
sur un décalage de longueur ne se déclenche pas à tort.

### 9.6 Rien ne quitte l'appareil

La photo est lue en data URL dans le navigateur (`readPhotoFile()`) et n'est **jamais**
téléversée. Il n'y a ni compte, ni stockage, ni trace, ni modération à prévoir. C'est une
promesse produit, écrite dans l'interface (« Votre photo reste sur votre appareil »), pas
un détail d'implémentation.

Le fichier n'est pas filtré sur son type MIME déclaré — peu fiable sur mobile — mais sur la
capacité réelle du navigateur à le décoder.

### 9.7 Le badge suit la formule du créateur

Le participant n'a pas de formule. Le badge est donc décidé par celle du créateur.

`creator_profiles` (la vue publique) n'expose **pas** `plan`, seulement un booléen dérivé
`watermark = (plan = 'free')`. C'est exactement — et seulement — l'information dont le
parcours a besoin : exposer `plan` révélerait le niveau d'abonnement du créateur.

Deux points d'honnêteté :

- le badge est **dessiné dans le canvas, par la même fonction que l'export**
  (`addBadge()` de `lib/watermark.ts`), donc visible **avant** que le participant ne
  télécharge quoi que ce soit. Un aperçu redessiné en HTML finirait par diverger ;
- en cas de doute (créateur inconnu), `rowToCreator()` retombe sur `watermark = true`.
  Mieux vaut un export marqué qu'un export qui contourne la formule par accident.

### 9.8 Aucune migration supplémentaire

Les policies de `0001_init.sql` avaient été écrites pour ce parcours :

| Policy | Ce qu'elle permet ici |
|---|---|
| `campaigns_select_owner_or_published` | `anon` lit une campagne publiée |
| `frames_select_owner_or_published` | `anon` lit le cadre de cette campagne |
| `media_read_public` | `anon` charge les images du cadre |

`getPublicCampaign(slug)` filtre en plus explicitement sur `status = 'published'` : un
brouillon doit être **indiscernable d'un slug inexistant**. Un lien partagé ne doit jamais
révéler l'existence d'une campagne non publiée.

---

## 10. Verrouillage des modules premium

Principe : **on ne cache jamais ce qui existe.** Un module verrouillé reste visible, avec sa
description et la formule qui le débloque. C'est ce qui donne envie de monter en gamme sans
jamais bloquer un créateur Free dans son parcours de base.

| Endroit | Comportement |
|---|---|
| `components/dashboard/nav.tsx` | l'entrée reste listée, marquée `PRO`, et mène au verrou |
| Pages `analytics` / `qr-codes` | `FeatureGate` en tête, si `hasFeature()` est faux |
| `MotionPanel` | remplacé par le verrou, si le plan n'inclut pas `motion` |
| Export | filigrane si `no_watermark` est absent |

`FeatureGate` renvoie toujours vers `Paramètres → Formule`, où le changement s'effectue —
pas vers la page publique des tarifs.

---

## 11. Ce qui n'est PAS construit

Paiement réel (aucun prestataire branché : le changement de formule est **immédiat en
recette**, et la migration 0002 dit explicitement qu'il doit être réservé au webhook de
paiement en production) · branding · domaine personnalisé · multi-utilisateurs · galerie
privée · rapports PDF · tout rendu serveur.

Côté participant, il n'y a **rien** à construire de plus : pas de compte, pas de stockage,
pas de modération. C'est une conséquence directe du choix de tout traiter dans le navigateur
(§9.3).

Les tables `events` et `subscriptions` du plan d'implémentation ne sont **pas** créées :
`events` supposerait de tracer les participations, ce que le parcours participant ne fait
délibérément pas (la photo ne quitte jamais l'appareil) ; `subscriptions` attend le
prestataire de paiement.
