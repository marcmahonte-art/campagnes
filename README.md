# Campagnes

> **Créez. Animez. Partagez.**  
> Une plateforme web pour créer et diffuser des cadres visuels que votre communauté  
> applique à ses propres photos, **sans compte ni application côté participant**.

**Principe produit** : *je dépose → je positionne → c'est prêt.*  
**Règle absolue** : ne jamais exposer de panneau de configuration complexe.

---

## État : Phase A (socle) + Phase B (formules, distribution, animation) + Phase C (participant)

### Phase A — compte créateur et Frame Engine

| Livrable                                                                   | État |
| -------------------------------------------------------------------------- | ---- |
| Inscription / connexion (email + Google)                                   | ✅    |
| Onboarding minimal (organisation, @pseudo, logo)                           | ✅    |
| Dashboard privé (brouillon / publiée, Nouvelle campagne, paramètres)       | ✅    |
| Création de campagne (nom, slug unique, format)                            | ✅    |
| Frame Engine (import, déplacer, redimensionner, rotation, calques, texte)  | ✅    |
| Format en langage naturel (Carré · Paysage · Vertical)                     | ✅    |
| Descripteur JSON versionné, visible et inspectable                         | ✅    |
| Page publique du créateur `campagnes.app/@pseudo`                          | ✅    |
| Paramètres de compte (nom, pseudo, logo, email, mot de passe, suppression) | ✅    |

### Phase B — formules, distribution, animation et export

| Livrable                                                            | État |
| ------------------------------------------------------------------- | ---- |
| Grille tarifaire publique `/tarifs` (Free · Creator · Organisation) | ✅    |
| Matrice comparative par fonctionnalité                              | ✅    |
| Grille de distribution en FCFA + demande de devis par email         | ✅    |
| Changement de formule (paramètres, immédiat en recette)             | ✅    |
| Verrouillage des modules premium selon la formule                   | ✅    |
| **Motion Engine** — presets + description en français               | ✅    |
| Aperçu animé sur le canvas (même moteur que l'export)               | ✅    |
| **Export vidéo WebM** dans le navigateur (`MediaRecorder`)          | ✅    |
| Export PNG haute définition + filigrane du plan Free                | ✅    |
| Analytics (`/analytics`) — consommation et formats                  | ✅    |
| QR Codes de campagne (`/qr-codes`)                                  | ✅    |
| Galerie publique (`/galerie`)                                       | ✅    |

### Phase C — le parcours participant

| Livrable                                                                 | État |
| ------------------------------------------------------------------------ | ---- |
| Page publique `/c/[slug]` — aucun compte, aucune application             | ✅    |
| Dépôt de la photo (clic ou glisser-déposer)                              | ✅    |
| Positionnement : glisser + zoom, cadre immobile, commandes sous l'aperçu | ✅    |
| La photo ne peut jamais découvrir la zone (contraintes de couverture)    | ✅    |
| **Mode Cadre** — la photo couvre tout le cadre, visible à travers le PNG | ✅    |
| **Mode Fond** — le créateur désigne une zone photo, la photo s'y découpe | ✅    |
| Enregistrement PNG à la résolution native du format                      | ✅    |
| Enregistrement vidéo quand le cadre est animé                            | ✅    |
| Filigrane affiché à l'écran **avant** le téléchargement, s'il s'applique | ✅    |
| La photo ne quitte jamais l'appareil du participant                      | ✅    |

**Hors périmètre (non construit)** : paiement réel, branding, domaine personnalisé,  
multi-utilisateurs, galerie privée, rendu serveur, modération des photos participantes  
(inutile : rien n'est stocké).

---

## Formules

|                                                          | Gratuit | Créateur          | Organisations & ONG |
| -------------------------------------------------------- | ------- | ----------------- | ------------------- |
| Prix                                                     | 0 FCFA  | 3 000 FCFA / mois | 5 000 FCFA / mois   |
| Distributions incluses                                   | 25 à vie| 100 / mois        | 1 000 / mois        |
| Coût unitaire par participant                            | —       | 30 FCFA           | 5 FCFA              |
| Watermark                                                | Oui     | Non               | Non                 |
| Frame Pro · Motion · Analytics · QR · Branding           | —       | ✅                 | ✅                  |
| Domaine · Multi-utilisateurs · Galerie privée · Rapports | —       | —                 | ✅                  |

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

### Base de données (Supabase)

Le projet Supabase est **provisionné**. Les migrations sont appliquées et vérifiées : les  
tables, les policies RLS, le trigger d'inscription, la vue publique, le bucket `media` et la  
grille tarifaire existent réellement en base.

Migrations, dans l'ordre :

| Fichier                             | Contenu                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `0001_init.sql`                     | tables `users`/`frames`/`campaigns`, policies RLS, trigger `handle_new_user`, vue `creator_profiles`, bucket `media`, realtime |
| `0002_plans_distribution.sql`       | formules `free`/`creator`/`organization`, table `distribution_offers`, fonction `set_own_plan`                                 |
| `0003_username_availability.sql`    | fonction `username_available(text)` — contrôle de disponibilité du pseudo                                                      |
| `0004_campaign_kind.sql`            | colonne `campaigns.kind` — cadre photo, cadre vidéo ou photo sur fond                                                          |
| `0005_restrict_plan_activation.sql` | supprime `set_own_plan`, ajoute `set_user_plan` réservée à `service_role`                                                      |

> **Pourquoi la 0003.** La policy `users_select_self` n'autorise à lire que sa propre ligne :  
> une requête `select` filtrée par pseudo ne voyait donc jamais le pseudo d'un autre créateur,  
> et l'écran d'onboarding affichait « disponible » pour un pseudo déjà pris. La fonction  
> `username_available` répond par un simple booléen, sans jamais laisser lire de ligne — et  
> n'expose rien de nouveau, la vue publique publiant déjà tous les pseudos.

Variables d'environnement (`.env.local`, jamais commité) :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...   # serveur uniquement
NEXT_PUBLIC_SITE_URL=https://campagnes-nu.vercel.app
```

`NEXT_PUBLIC_SITE_URL` doit pointer sur le domaine réel : il compose les liens de retour de  
l'authentification (`/auth/callback`). Côté Supabase, ce domaine doit aussi figurer dans  
*Authentication → URL Configuration* (`Site URL` et `Redirect URLs`).

Aucune ligne d'écran ne change : toute la couche données passe par la façade  
`lib/backend/index.ts`, qui bascule sur Supabase dès que l'URL et la clé anon sont présentes.

> **Email d'inscription — limite connue.** La confirmation par email est active et le service  
> d'email intégré de Supabase est plafonné à **2 envois par heure**, sans SMTP personnalisé.  
> Au-delà, l'inscription répond `429 over_email_send_rate_limit`. Deux issues : brancher un  
> SMTP (Resend, Brevo, SendGrid) dans *Authentication → SMTP Settings*, ou désactiver la  
> confirmation (*Authentication → Providers → Email → Confirm email*).

> **Sécurité.** Les droits d'accès sont calculés côté application (`lib/plans.ts`) et la  
> seule écriture sensible en base est le changement de formule, isolé dans une fonction  
> `security definer`. Depuis la migration 0005, `set_own_plan` est **supprimée** et  
> `set_user_plan` est réservée à `service_role` : plus aucun compte ne peut s'attribuer une  
> formule payante. Côté application, `canSelfActivatePlan` (`lib/backend/index.ts`) n'est vrai  
> qu'en mode démonstration — c'est ce qui rend les verrous de modules effectifs.

### Déploiement Vercel

Importer le dépôt, ajouter **les quatre** variables d'environnement ci-dessus, déployer.  
L'hébergement des images passe par Supabase Storage (bucket `media`).

Un déploiement resté en **mode démonstration** se reconnaît à la phrase « Mode démonstration  
— les données restent dans ce navigateur », affichée en bandeau sur toutes les pages : c'est  
le signe que `NEXT_PUBLIC_SUPABASE_URL` ou la clé anon manquent côté Vercel.

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
  c/[slug]/                      parcours participant (public, sans compte)
  auth/callback/                 échange du code OAuth Google
components/
  ui/                            atomes du design system
  frame/frame-editor.tsx         Frame Engine (Fabric.js) + lecture d'animation
  campaign/motion-panel.tsx      Motion Engine : presets, description, export
  campaign/descriptor-viewer.tsx JSON du descripteur, inspectable
  participant/participant-stage.tsx  positionnement de la photo dans sa zone
  plans/                         cartes de formule, matrice, verrou de module, offre
  dashboard/                     navigation (sensible à la formule) + vignette
lib/
  backend/                       façade données : Supabase ou mode local
  plans.ts                       formules, droits, libellés, matrice
  distribution.ts                grille tarifaire FCFA + demande de devis
  participant.ts                 composition cadre + photo, cadrage, contraintes
  motion.ts                      Motion Engine — pur et déterministe
  video-export.ts                rendu hors écran : PNG et WebM
  watermark.ts                   badge « Créé avec Campagnes » — géométrie partagée
  descriptor.ts                  lecture / écriture du descripteur versionné,
                                 zone photo, animation effectivement jouée
  ratios.ts                      Carré · Paysage · Vertical
  slug.ts                        slugify + normalisation du @pseudo
  supabase/                      clients navigateur et serveur
supabase/migrations/0001_init.sql
supabase/migrations/0002_plans_distribution.sql
supabase/migrations/0003_username_availability.sql
middleware.ts                    /@pseudo → /u/pseudo + session
```


Détail complet : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Charte graphique appliquée

| Token                          | Valeur                                                 |
| ------------------------------ | ------------------------------------------------------ |
| Noir Campagnes                 | `#000000`                                              |
| **Dégradé signature (unique)** | `linear-gradient(135°, #7B61FF → #FF6B6B → #FFD93D)`   |
| Gris clair / texte             | `#E5E7EB` / `#6B7280`                                  |
| Rayons                         | 8 · 12 · 16 · 24 · 999 px                              |
| Ombres                         | `0 2px 8px .06` · `0 8px 24px .08` · `0 16px 48px .12` |
| Motion                         | 120–250 ms · `cubic-bezier(.2,.8,.2,1)`                |
| Typo UI / logo                 | Inter / Satisfy                                        |

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

Le plan **Free** appose un badge discret « Créé avec Campagnes » dans le coin des exports ; il  
disparaît avec Creator. Vérifié par `hasFeature(plan, 'no_watermark')`.

---

## Le parcours participant

C'est la raison d'être de la plateforme : sans lui, un créateur fabriquerait des cadres que  
personne ne pourrait utiliser. Le participant ouvre `/c/[slug]`, dépose sa photo, la place,  
et repart avec son visuel — **sans compte, sans application, sans formulaire**.

Toute la mécanique tient dans une idée : **la photo du participant est un calque comme un  
autre**. Le descripteur du créateur n'est jamais modifié ; on y glisse une couche image à la  
bonne place (`lib/participant.ts`). Le rendu emprunte ensuite le chemin existant,  
`exportPng()` / `exportVideo()` : l'aperçu et le fichier téléchargé ne peuvent donc pas  
diverger — c'est la même garantie que côté créateur.

### Deux modes, une seule géométrie

Le descripteur porte un champ optionnel `photo_anchor` :

- **absent → mode Cadre.** La photo passe sous tous les calques et n'apparaît qu'à travers les  
  zones transparentes du PNG. C'est le mode historique, inchangé.
- **présent → mode Fond.** Il contient l'identifiant du calque qui délimite la zone photo. La  
  photo est découpée à son emprise et posée **juste au-dessus** de lui : elle masque ce calque  
  dans la zone, et le décor de celui-ci reste visible tout autour. Le créateur désigne cette  
  zone depuis l'inspecteur de calques (« Définir comme zone photo »).

Dans les deux cas, le reste du module ne connaît qu'un rectangle — la *zone* — et non le  
format. `photoZone()` renvoie le cadre entier en mode Cadre, l'emprise du calque désigné  
(rotation comprise) en mode Fond. Toute la géométrie s'écrit donc en arithmétique de  
rectangle, et un seul jeu de tests couvre les deux modes.

### Deux règles tenues par construction

- **La photo couvre toujours la zone.** Un cadre est un PNG à zones transparentes : si la  
  photo laissait un trou, on verrait le damier. Le domaine de déplacement est calculé pour  
  rendre ce trou impossible, y compris en cas de code fautif en amont (`clampPlacement`).  
  Au zoom minimal, l'axe qui contraint la couverture est simplement verrouillé.
- **Rien ne quitte l'appareil.** La photo est lue en data URL dans le navigateur et n'est  
  jamais téléversée. Il n'y a ni stockage, ni trace, ni modération à prévoir — et le  
  participant n'a rien à accepter.

### En mode Fond, la zone est fixe

`sampleAt()` indexe les mouvements **par position de calque**, et chaque calque s'anime autour  
de sa propre origine. Une fenêtre qui bougerait pendant que la photo reste immobile laisserait  
donc forcément dépasser la photo d'un côté. La zone photo est donc figée : le mouvement du  
calque qui la délimite est neutralisé (`effectiveMotion()`), les autres calques continuent  
d'animer normalement.

Deux conséquences assumées :

- `composeDescriptor()` réserve une **position neutre** dans le plan d'animation pour la photo.  
  Sans cela, l'insérer décalerait tous les calques suivants et le cadre ne jouerait plus la  
  même animation.
- La règle vit dans **une seule fonction**, `effectiveMotion()`, appelée par l'aperçu du  
  créateur, par l'export et par le parcours participant. C'est ce qui interdit à l'aperçu de  
  mentir — et `validateDescriptor()` avertit le créateur quand sa zone sera figée.

### Le badge suit la formule du créateur

Le participant n'a pas de formule. Le badge « Créé avec Campagnes » est donc décidé par celle  
du créateur, et il est **dessiné dans le canvas avant le téléchargement**, par la même fonction  
que l'export (`lib/watermark.ts`) : l'aperçu ne ment pas. La projection publique n'expose qu'un  
booléen `watermark` — jamais la formule elle-même (voir `creator_profiles` dans `0001_init.sql`).
