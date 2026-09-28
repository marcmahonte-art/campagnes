# Campagnes — Design System

> **Créer. Animer. Partager.**
>
> Design system officiel de Campagnes : une identité visuelle minimaliste, expressive et orientée création.

---

## 1. Direction artistique

Campagnes doit donner une impression de :

- **Simplicité** — peu de paramètres, peu de friction.
- **Créativité** — gradients, mouvement et compositions vivantes.
- **Confiance** — interfaces propres, lisibles et professionnelles.
- **Énergie** — accents lumineux et animations discrètes.
- **Accessibilité** — l'utilisateur comprend quoi faire immédiatement.

### Principe fondamental

> **La complexité doit être cachée.**

L'interface ne doit jamais ressembler à un logiciel de motion design ou de montage vidéo complexe.

---

# 2. Logo

Le logo principal est le wordmark cursif **Campagnes** en noir.

Le logo possède une terminaison dynamique sur la dernière lettre, utilisée comme élément de signature de marque.

### Versions

- `Campagnes / Black` — logo principal sur fonds clairs.
- `Campagnes / White` — logo blanc sur fonds noirs ou très colorés.
- `Campagnes / Gradient` — uniquement pour des usages marketing ou hero.
- `Campagnes / Monochrome` — pour les contextes où la couleur n'est pas disponible.

### Règles

- Ne jamais déformer le logo.
- Ne jamais ajouter d'ombre directement au logo.
- Ne jamais utiliser plusieurs couleurs dans les lettres.
- Le gradient peut apparaître dans la signature ou dans les éléments graphiques autour du logo.
- Conserver une zone de protection généreuse autour du wordmark.

---

# 3. Palette de couleurs

## 3.1 Couleur principale

### Noir Campagnes

```text
#000000
```

Usage :

- texte principal ;
- navigation ;
- boutons principaux ;
- logo ;
- éléments forts de l'interface.

Le noir est la base de l'identité.

---

## 3.2 Gradient signature

Gradient principal :

```text
#7B1FFF → #FF36B8 → #FF6B68 → #FFD93D
```

Direction recommandée :

```text
135deg
```

Le gradient représente :

**créativité → mouvement → énergie → lumière**

### Usage

Le gradient doit être utilisé comme **accent**, pas comme couleur de fond permanente.

Utilisations recommandées :

- CTA premium ;
- boutons principaux ;
- bordures actives ;
- halos ;
- éléments de décoration ;
- animations ;
- illustrations ;
- états actifs.

Éviter de remplir toute l'interface avec le gradient.

---

## 3.3 Couleurs secondaires

```text
Violet      #7B1FFF
Rose        #FF36B8
Corail      #FF6B68
Jaune       #FFD93D
Gris clair  #E5E7EB
Gris texte  #6B7280
Blanc       #FFFFFF
```

### Règle

80 % neutres  
15 % noir  
5 % couleur / gradient

Le gradient doit rester rare pour conserver son impact.

---

# 4. Typographie

## Police UI

**Inter**

Utilisation :

- navigation ;
- boutons ;
- formulaires ;
- tableaux ;
- statistiques ;
- messages ;
- paramètres.

### Graisses

```text
Regular     400
Medium      500
SemiBold    600
Bold        700
```

---

## Logo / branding

Le wordmark Campagnes reste une typographie script personnalisée.

Ne pas utiliser la police du logo comme police d'interface.

---

# 5. Échelle typographique

```text
Display       64px / 1.0 / 700
H1            48px / 1.1 / 700
H2            36px / 1.15 / 700
H3            24px / 1.2 / 600
H4            20px / 1.3 / 600
Body          16px / 1.5 / 400
Body Small    14px / 1.45 / 400
Caption       12px / 1.4 / 500
```

Sur mobile :

```text
Display       40px
H1            34px
H2            28px
H3            22px
Body          16px
```

---

# 6. Layout

Campagnes utilise une grille très simple.

## Desktop

```text
max-width: 1200px
gutter: 24px
```

## Mobile

```text
padding: 16px
```

### Espacements

Utiliser une base de 4px :

```text
4
8
12
16
24
32
48
64
96
128
```

Les grands espaces blancs sont importants.

---

# 7. Rayons

Campagnes utilise des formes douces mais pas excessivement arrondies.

```text
Small       8px
Medium      12px
Large       16px
XL          24px
Pill        999px
```

### Règle

Les cartes et boutons doivent avoir des rayons cohérents.

Éviter de mélanger plusieurs styles de coins dans une même vue.

---

# 8. Ombres

Les ombres doivent être très légères.

```css
shadow-sm:
0 2px 8px rgba(0,0,0,.06);

shadow-md:
0 8px 24px rgba(0,0,0,.08);

shadow-lg:
0 16px 48px rgba(0,0,0,.12);
```

Pas de grosses ombres artificielles.

---

# 9. Boutons

## Primary

Fond gradient.

```text
Créer ma campagne →
```

Caractéristiques :

- hauteur : 44–48px ;
- rayon : 999px ;
- texte blanc ou noir selon contraste ;
- padding horizontal : 20px ;
- transition douce.

## Secondary

Fond noir.

```text
En savoir plus
```

## Ghost

Fond transparent avec bordure légère.

```text
Voir un exemple
```

## Destructive

Réservé aux actions destructives.

```text
Supprimer
```

---

# 10. Inputs

Les inputs doivent être simples et immédiatement compréhensibles.

Exemple :

```text
Nom de la campagne
[ Ma campagne...                    ]
```

Style :

- fond blanc ;
- bordure `#E5E7EB` ;
- rayon 12px ;
- hauteur 48px ;
- focus avec accent violet.

Ne pas afficher plusieurs options tant qu'elles ne sont pas nécessaires.

---

# 11. Upload

Le composant principal d'upload doit être extrêmement simple.

```text
┌──────────────────────────────┐
│                              │
│       Glissez votre image    │
│              ici             │
│                              │
│       [ Choisir un fichier ] │
│                              │
└──────────────────────────────┘
```

Le drag & drop est secondaire sur mobile.

Sur mobile :

```text
[ Ajouter un fichier ]
```

---

# 12. Sélection des formats vidéo

Ne jamais afficher des résolutions techniques.

Afficher uniquement :

```text
┌──────────┐ ┌──────────┐ ┌──────────┐
│   1:1    │ │  16:9    │ │   9:16   │
│  Carré   │ │ Paysage  │ │ Vertical │
└──────────┘ └──────────┘ └──────────┘
```

Le système gère automatiquement :

- résolution ;
- compression ;
- encodage ;
- dimensions adaptées ;
- export.

---

# 13. Créateur de frames

Le créateur doit être minimal.

### Canvas

Au centre :

```text
┌─────────────────────────────┐
│                             │
│          MEDIA              │
│                             │
│      [ FRAME ]              │
│                             │
└─────────────────────────────┘
```

### Actions visibles

Uniquement :

```text
Ajouter
Déplacer
Redimensionner
Supprimer
```

Les outils secondaires sont cachés dans un menu `•••`.

### Philosophie

> Pas de panneau Photoshop.

L'utilisateur doit pouvoir créer un cadre en quelques secondes.

---

# 14. Animation IA

Fonction premium.

Nom UI :

```text
✨ Animer avec l'IA
```

Interface :

```text
Animation

○ Automatique
○ Apparition
○ Flottement
○ Mouvement
○ Pulsation
○ Élégant
○ Énergique

[ Générer ]
```

Option avancée :

```text
Décrire le mouvement...
```

Exemple :

```text
Le cadre apparaît doucement puis flotte légèrement.
```

### Principe

L'utilisateur ne règle pas :

- keyframes ;
- easing ;
- FPS ;
- durée technique ;
- trajectoires complexes.

L'IA choisit les paramètres techniques.

---

# 15. Dashboard

Le dashboard doit rester très léger.

Navigation principale :

```text
Campagnes
Analytics
QR Codes
Paramètres
```

Une campagne affiche :

```text
Nom de campagne
Statut

[ Ouvrir ]

Créations       Partages       Visites
8 397           4 208         12 432
```

Pas de dizaines de graphiques.

---

# 16. Analytics

Les métriques principales :

```text
Visites
Créations
Téléchargements
Partages
```

Puis éventuellement :

```text
Photos
Vidéos
Format
Pays
Appareil
Période
```

Les informations avancées sont accessibles progressivement.

---

# 17. QR Code

Le QR Code est une fonctionnalité indépendante.

Écran :

```text
Votre campagne

[ QR CODE ]

Scanner pour participer

[ Télécharger le QR ]
```

Options minimales :

- télécharger ;
- copier le lien.

Les personnalisations avancées peuvent être premium.

---

# 18. Cards

Les cards doivent rester très propres.

```text
┌─────────────────────────────┐
│                             │
│       Campaign Preview      │
│                             │
├─────────────────────────────┤
│ Campagne Ramadan            │
│ 2 438 créations             │
│                             │
│ [ Ouvrir → ]                │
└─────────────────────────────┘
```

Pas de surcharge visuelle.

---

# 19. Icônes

Style :

- outline ;
- simple ;
- géométrique ;
- stroke 1.75–2px ;
- coins légèrement arrondis.

Icônes principales :

```text
+
Frame
Video
Sparkles
Share
QR
Analytics
Settings
Download
```

Les icônes ne doivent jamais concurrencer le contenu.

---

# 20. États

## Success

Vert doux.

```text
#22C55E
```

## Warning

Jaune.

```text
#FFD93D
```

## Error

Rouge.

```text
#EF4444
```

## AI

Gradient Campagnes.

L'IA doit avoir un langage visuel identifiable grâce au symbole :

```text
✨
```

---

# 21. Motion design de l'interface

Les animations UI doivent être rapides et discrètes.

```text
Micro interaction: 120–180ms
Transition:        180–250ms
Modal:             250–350ms
Page transition:   250–400ms
```

Easing recommandé :

```text
cubic-bezier(.2,.8,.2,1)
```

### Principe

Les animations servent à expliquer l'action.

Elles ne doivent jamais ralentir l'utilisateur.

---

# 22. Brand Motion

Le gradient Campagnes peut se déplacer lentement.

Exemple :

```text
Violet → Rose → Orange → Jaune
```

Utilisation :

- hero ;
- loading ;
- génération IA ;
- confirmation ;
- campagnes marketing.

Le gradient animé doit rester subtil.

---

# 23. Hero marketing

Structure recommandée :

```text
Campagnes

Créez. Animez. Partagez.

Créez des campagnes visuelles
que votre communauté peut utiliser
en quelques secondes.

[ Créer ma campagne → ]
[ Voir un exemple ]
```

Fond :

```text
#000000
```

avec formes de gradient abstraites.

---

# 24. Responsive

## Mobile first

Campagnes doit être pensé d'abord pour le mobile.

Le participant doit pouvoir :

```text
Ouvrir le lien
↓
Choisir une photo / vidéo
↓
Appliquer le cadre
↓
Télécharger
```

sans inscription obligatoire.

---

# 25. Principes UX

### Règle 1

**Une action principale par écran.**

### Règle 2

**Ne jamais exposer une option technique inutile.**

### Règle 3

**L'IA fait le travail complexe.**

### Règle 4

**Les fonctionnalités premium doivent être visibles mais non intrusives.**

### Règle 5

**Photo et vidéo doivent avoir la même logique.**

### Règle 6

**Le participant ne devrait presque jamais avoir besoin de lire une documentation.**

---

# 26. Architecture de navigation

```text
Campagnes
│
├── Accueil
│
├── Mes campagnes
│   └── Campagne
│       ├── Cadre
│       ├── Animation IA
│       ├── Aperçu
│       ├── QR Code
│       └── Analytics
│
├── Créer
│   ├── Importer un cadre
│   └── Créer un cadre
│
├── Analytics
│
└── Paramètres
```

---

# 27. Fonctionnalités premium

Les fonctionnalités payantes apparaissent directement dans le produit.

```text
Cadre
✓

Photo
✓

Vidéo
✓

✨ Animation IA
PRO

📊 Analytics
PRO

▣ QR Code
PRO

Branding personnalisé
PRO
```

L'utilisateur comprend immédiatement la valeur de chaque fonctionnalité.

---

# 28. Design tokens

```css
--black: #000000;
--white: #FFFFFF;

--purple: #7B1FFF;
--pink: #FF36B8;
--coral: #FF6B68;
--yellow: #FFD93D;

--gray-50: #F9FAFB;
--gray-100: #F3F4F6;
--gray-200: #E5E7EB;
--gray-400: #9CA3AF;
--gray-500: #6B7280;
--gray-700: #374151;
--gray-900: #111827;

--gradient-brand:
linear-gradient(
  135deg,
  #7B1FFF 0%,
  #FF36B8 40%,
  #FF6B68 70%,
  #FFD93D 100%
);

--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 24px;
--radius-pill: 999px;

--shadow-sm: 0 2px 8px rgba(0,0,0,.06);
--shadow-md: 0 8px 24px rgba(0,0,0,.08);
--shadow-lg: 0 16px 48px rgba(0,0,0,.12);
```

---

# 29. Résumé de l'identité

**Campagnes doit être :**

> **Noir + gradient flashy + typographie nette + logo script + beaucoup d'espace + interactions simples + motion subtil.**

Le produit doit ressembler à un outil créatif moderne, mais son interface doit rester beaucoup plus simple qu'un outil de design professionnel.

### Signature

**Campagnes**  
**Créez. Animez. Partagez.**

