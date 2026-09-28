# Campagnes

> **Créez. Animez. Partagez.**
> Une plateforme web pour créer et diffuser des cadres visuels que votre communauté
> applique à ses propres photos, **sans compte ni application côté participant**.

**Principe produit** : *je dépose → je positionne → c'est prêt.*
**Règle absolue** : ne jamais exposer de panneau de configuration complexe.

---

## État : Phase A — Socle + compte créateur

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

**Hors périmètre (non construit)** : compte participant, animation IA, page `/c/[slug]`,
analytics, QR code, paiement, branding, rendu serveur.

---

## Démarrage

```bash
npm install
npm run dev          # http://localhost:3000
```

L'application démarre **sans configuration**. Elle tourne alors en *mode démonstration* :
mêmes écrans, mêmes parcours, persistance dans le navigateur (`localStorage`). Un bandeau
discret le signale en haut de page.

### Passer sur Supabase (production)

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Exécuter `supabase/migrations/0001_init.sql` dans **SQL Editor**.
   Le script crée les tables, les policies RLS, le trigger d'inscription, le bucket
   `media` et la vue publique `creator_profiles`.
3. Activer le fournisseur **Google** dans *Authentication → Providers*.
4. Copier `.env.example` en `.env.local` et renseigner :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Aucune ligne d'écran ne change : toute la couche données passe par la façade
`lib/backend/index.ts`.

### Déploiement Vercel

Importer le dépôt, ajouter les mêmes variables d'environnement, déployer.
L'hébergement des images passe par Supabase Storage (bucket `media`).

---

## Architecture

```
app/
  layout.tsx                     polices Inter + Satisfy, SessionProvider
  page.tsx                       landing (hero noir, dégradé en accent)
  (auth)/                        login · signup · onboarding
  (creator)/                     dashboard · campaigns/new · campaigns/[id] · settings
  u/[username]/                  profil public du créateur
  auth/callback/                 échange du code OAuth Google
components/
  ui/                            atomes du design system
  frame/frame-editor.tsx         Frame Engine (Fabric.js)
  campaign/descriptor-viewer.tsx JSON du descripteur, inspectable
  dashboard/                     navigation + vignette de campagne
lib/
  backend/                       façade données : Supabase ou mode local
  descriptor.ts                  lecture / écriture du descripteur versionné
  ratios.ts                      Carré · Paysage · Vertical
  slug.ts                        slugify + normalisation du @pseudo
  supabase/                      clients navigateur et serveur
supabase/migrations/0001_init.sql
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
