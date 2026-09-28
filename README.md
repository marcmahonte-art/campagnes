# Campagnes

> **Créez. Animez. Partagez.**
> Une plateforme web pour créer et diffuser des cadres visuels que votre communauté
> applique à ses propres photos, **sans compte ni application côté participant**.

**Principe produit** : *je dépose → je positionne → c'est prêt.*
**Règle absolue** : ne jamais exposer de panneau de configuration complexe.

---

## État : Phase A (socle) + Phase B (formules, distribution, animation)

### Phase A — compte créateur et Frame Engine

| Livrable | État |
|---|---|
| Inscription / connexion (email + Google) | ✅ |
| Onboarding minimal (organisation, @pseudo, logo) | ✅ |
| Dashboard privé (brouillon / publiée, Nouvelle campagne, paramètres) | ✅ |
| Création de campagne (nom, slug unique, format) | ✅ |
| Frame Engine (import, déplacer, redimensionner, rotation, calques, texte) | ✅ |
| Format en langage naturel (Carré · Paysage · Vertical) | ✅ |
| Descripteur JSON versionné, visible et inspectable | ✅ |
| Page publique du créateur `campagnes.app/@pseudo` | ✅ |
| Paramètres de compte (nom, pseudo, logo, email, mot de passe, suppression) | ✅ |

### Phase B — formules, distribution, animation et export

| Livrable | État |
|---|---|
| Grille tarifaire publique `/tarifs` (Free · Creator · Organisation) | ✅ |
| Matrice comparative par fonctionnalité | ✅ |
| Grille de distribution en FCFA + demande de devis par email | ✅ |
| Changement de formule (paramètres, immédiat en recette) | ✅ |
| Verrouillage des modules premium selon la formule | ✅ |
| **Motion Engine** — presets + description en français | ✅ |
| Aperçu animé sur le canvas (même moteur que l'export) | ✅ |
| **Export vidéo WebM** dans le navigateur (`MediaRecorder`) | ✅ |
| Export PNG haute définition + filigrane du plan Free | ✅ |
| Analytics (`/analytics`) — consommation et formats | ✅ |
| QR Codes de campagne (`/qr-codes`) | ✅ |
| Galerie publique (`/galerie`) | ✅ |

**Hors périmètre (non construit)** : compte participant, page participant `/c/[slug]`,
paiement réel, branding, domaine personnalisé, multi-utilisateurs, rendu serveur.

---

## Formules

| | Free | Creator | Organisation |
|---|---|---|---|
| Prix | 0 FCFA | 4 900 FCFA / mois | 19 900 FCFA / mois |
| Watermark | Oui | Non | Non |
| Frame Pro · Motion · Analytics · QR · Branding | — | ✅ | ✅ |
| Domaine · Multi-utilisateurs · Galerie privée · Rapports | — | — | ✅ |

**Distribution** — facturée à l'usage, dans tous les plans. Les tarifs sont **indicatifs et
affichés en FCFA** (100 participants = 2 500, 500 = 5 000, 1 000 = 7 500, 5 000 = 20 000,
au-delà sur devis). Aucun paiement n'est simulé dans le produit : chaque volume renvoie à une
**demande de devis** (`mailto:`), et le reste se traite avec l'équipe.

Source unique de vérité : `lib/plans.ts` (droits) et `lib/distribution.ts` (volumes et prix).

---

## Démarrage

```bash
npm install
npm run dev          # http://localhost:3000
```

L'application démarre **sans configuration**. Elle tourne alors en *mode démonstration* :
mêmes écrans, mêmes parcours, persistance dans le navigateur (`localStorage`). Un bandeau
discret le signale en haut de page.

### Compte de démonstration

Le bouton **« Entrer dans la démonstration »** (écrans *Connexion* et *Inscription*) crée
un compte complet : profil, deux cadres, une campagne publiée et un brouillon. Le compte
arrive en formule **Creator**, ce qui permet de voir les modules premium (Motion, Analytics,
QR) sans rien payer.

Identifiants, si vous préférez passer par le formulaire :

```
demo@campagnes.app / campagnes2026
```

> Ce ne sont pas des identifiants de production : en mode démonstration, tout vit dans le
> navigateur et n'importe qui peut lire le `localStorage`.

### Passer sur Supabase (production)

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Exécuter les migrations **dans l'ordre** dans **SQL Editor** :
   - `supabase/migrations/0001_init.sql` — tables, policies RLS, trigger d'inscription,
     bucket `media`, vue publique `creator_profiles`.
   - `supabase/migrations/0002_plans_distribution.sql` — formules, grille tarifaire de
     distribution et fonction SQL de changement de formule.
3. Activer le fournisseur **Google** dans *Authentication → Providers*.
4. Copier `.env.example` en `.env.local` et renseigner :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Aucune ligne d'écran ne change : toute la couche données passe par la façade
`lib/backend/index.ts`.

> **Sécurité.** Les droits d'accès sont calculés côté application (`lib/plans.ts`) et la
> seule écriture sensible en base est le changement de formule, isolé dans une fonction
> `security definer`. Avant la mise en production, `set_own_plan` doit être révoquée pour
> `authenticated` et réservée au webhook de paiement (`service_role`). C'est documenté dans
> l'en-tête de la migration 0002.

### Déploiement Vercel

Importer le dépôt, ajouter les mêmes variables d'environnement, déployer.
L'hébergement des images passe par Supabase Storage (bucket `media`).

---

## Architecture

```
app/
  layout.tsx                     polices Inter + Satisfy, SessionProvider
  page.tsx                       landing (hero noir, dégradé en accent)
  tarifs/                        grille tarifaire publique + matrice comparative
  galerie/                       campagnes publiées, tous créateurs
  (auth)/                        login · signup · onboarding
  (creator)/                     dashboard · campaigns/[id] · analytics
                                 qr-codes · settings · campaigns/new
  u/[username]/                  profil public du créateur
  auth/callback/                 échange du code OAuth Google
components/
  ui/                            atomes du design system
  frame/frame-editor.tsx         Frame Engine (Fabric.js) + lecture d'animation
  campaign/motion-panel.tsx      Motion Engine : presets, description, export
  campaign/descriptor-viewer.tsx JSON du descripteur, inspectable
  plans/                         cartes de formule, matrice, verrou de module, offre
  dashboard/                     navigation (sensible à la formule) + vignette
lib/
  backend/                       façade données : Supabase ou mode local
  plans.ts                       formules, droits, libellés, matrice
  distribution.ts                grille tarifaire FCFA + demande de devis
  motion.ts                      Motion Engine — pur et déterministe
  video-export.ts                rendu hors écran : PNG et WebM
  descriptor.ts                  lecture / écriture du descripteur versionné
  ratios.ts                      Carré · Paysage · Vertical
  slug.ts                        slugify + normalisation du @pseudo
  supabase/                      clients navigateur et serveur
supabase/migrations/0001_init.sql
supabase/migrations/0002_plans_distribution.sql
middleware.ts                    /@pseudo → /u/pseudo + session
```

Détail complet : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Charte graphique appliquée

| Token | Valeur |
|---|---|
| Noir Campagnes | `#000000` |
| **Dégradé signature (unique)** | `linear-gradient(135°, #7B61FF → #FF6B6B → #FFD93D)` |
| Gris clair / texte | `#E5E7EB` / `#6B7280` |
| Rayons | 8 · 12 · 16 · 24 · 999 px |
| Ombres | `0 2px 8px .06` · `0 8px 24px .08` · `0 16px 48px .12` |
| Motion | 120–250 ms · `cubic-bezier(.2,.8,.2,1)` |
| Typo UI / logo | Inter / Satisfy |

Répartition imposée : **80 % neutres · 15 % noir · 5 % couleur**.
Le dégradé est un **accent** (CTA principal, état actif, halo, trait de signature),
jamais un fond permanent. **Aucun autre dégradé n'est créé dans le produit.**

---

## Le descripteur de cadre

Contrat de rejouabilité entre le créateur et le futur rendu participant :

```jsonc
{
  "version": 1,
  "ratio": "9:16",
  "background": "transparent",
  "motion": {                      // absent = cadre statique
    "preset": "auto",
    "durationMs": 3000,
    "stagger": 0.06,
    "layers": [
      { "fadeIn": 0.4, "floatY": 0.018, "floatX": 0, "pulse": 0.012, "rotate": 0.6, "cycles": 1 }
    ]
  },
  "layers": [
    { "id": "img1", "type": "image", "src": "…", "x": 0, "y": 0, "w": 1080, "h": 1920,
      "rotation": 0, "z": 10, "opacity": 1 },
    { "id": "txt1", "type": "text", "text": "Rentrée 2026", "font": "Inter", "size": 96,
      "color": "#FFFFFF", "align": "center", "x": 120, "y": 1500, "w": 840,
      "rotation": 0, "z": 20, "opacity": 1 }
  ]
}
```

Les coordonnées sont exprimées dans le **repère du ratio** (1080×1080, 1920×1080,
1080×1920), jamais dans celui de l'écran. Le canvas de l'éditeur travaille dans ce
repère et n'est réduit à l'affichage que par un zoom : le cadre se rejoue donc à
l'identique partout. Le JSON est affiché en clair dans l'éditeur de campagne.

---

## Motion Engine et export

L'utilisateur ne règle **jamais** de keyframes, d'easing, de FPS ni de durée technique. Il
choisit une intention (« Flottement », « Pulsation »…) ou la décrit en français — le moteur
traduit :

> « le cadre apparaît doucement puis flotte légèrement »
> → fondu + flottement vertical, rythme lent.

`lib/motion.ts` est **pur et déterministe** : il produit un `MotionPlan`, puis `sampleAt()`
donne la transformation de chaque calque à un instant donné. **Le même `sampleAt()`
alimente l'aperçu et l'export** — l'aperçu et le rendu ne peuvent donc pas diverger.

Le plan est stocké dans `descriptor.motion` : le cadre animé reste rejouable à l'identique,
comme un cadre statique.

### Export

`lib/video-export.ts` reconstruit un canvas hors écran à la **résolution native** du format
à partir du descripteur, puis :

- **PNG** — `toDataURL`, image nette, indépendante du zoom d'affichage ;
- **WebM** — `MediaRecorder` sur le flux du canvas, encodage dans le navigateur, aucune
  dépendance externe ni rendu serveur.

Le plan **Free** appose un filigrane discret `campagnes.app` sur les exports ; il disparaît
avec Creator. Vérifié par `hasFeature(plan, 'no_watermark')`.
