# Campagnes — Architecture (Phase A : socle + compte créateur)

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
│   │   │   └── [id]/page.tsx         # Frame Engine + inspecteur JSON + publication
│   │   └── settings/page.tsx         # nom, @pseudo, logo, email, mot de passe, suppression
│   │
│   ├── u/[username]/page.tsx         # profil public du créateur (URL canonique)
│   └── auth/callback/route.ts        # échange du code OAuth (Google) contre une session
│
├── components/
│   ├── ui/                           # atomes du design system
│   │   ├── button.tsx                # primary / secondary / ghost / destructive
│   │   ├── input.tsx                 # hauteur 48px, rayon 12px, focus violet
│   │   ├── card.tsx
│   │   ├── badge.tsx                 # brouillon / publié
│   │   ├── logo.tsx                  # wordmark « Campagnes » (Satisfy)
│   │   └── ratio-picker.tsx          # Carré · Paysage · Vertical (jamais une résolution)
│   ├── dashboard/
│   │   ├── nav.tsx
│   │   └── campaign-card.tsx
│   ├── campaign/
│   │   ├── publish-bar.tsx           # publier / dépublier + lien public
│   │   └── descriptor-viewer.tsx     # le JSON du descripteur, inspectable
│   └── frame/
│       ├── frame-editor.tsx          # canvas Fabric.js (le cœur du Frame Engine)
│       └── layer-panel.tsx           # 4 actions visibles + menu •••
│
├── lib/
│   ├── types.ts                      # User, Frame, Campaign, Descriptor…
│   ├── descriptor.ts                 # création / lecture / validation du JSON versionné
│   ├── ratios.ts                     # 1:1 · 16:9 · 9:16 → dimensions de travail
│   ├── slug.ts                       # slugify + génération de slug unique
│   ├── backend/
│   │   ├── index.ts                  # façade unique (détecte Supabase ou mode local)
│   │   ├── supabase.ts               # implémentation réelle
│   │   ├── local.ts                  # implémentation de démo (localStorage)
│   │   └── session.tsx               # SessionProvider / useSession
│   └── supabase/
│       ├── client.ts                 # client navigateur
│       └── server.ts                 # client serveur (cookies)
│
├── middleware.ts                     # /@pseudo → /u/pseudo  +  rafraîchissement de session
├── supabase/migrations/0001_init.sql # tables + RLS + trigger + storage + vue publique
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
`public.creator_profiles` (`id, username, org_name, logo_url, created_at`) accordée à
`anon` et `authenticated`. La page `/u/[username]` lit la vue, jamais la table.

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
- Le composant `DescriptorViewer` l'affiche en clair dans l'éditeur : c'est le livrable
  « JSON visible/inspectable » demandé.

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

## 7. Ce qui n'est PAS construit (hors périmètre Phase A)

Compte participant · Animation IA (Motion Engine) · page `/c/[slug]` · analytics ·
QR code · paiement · branding · tout rendu serveur. Les tables `events`,
`subscriptions` du plan d'implémentation ne sont **pas** créées.
