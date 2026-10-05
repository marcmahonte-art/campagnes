# Campagnes — Spécifications globales UI
## Page d’édition participant — Rendu compact, premium et responsive

> Objectif : transformer la page actuelle d’édition participant en une expérience courte, visuelle et immédiatement compréhensible. Le visuel est le centre de l’expérience ; les informations secondaires et les réglages avancés n’apparaissent que lorsqu’ils sont utiles.

## 1. Objectif produit

Le participant doit pouvoir :
1. voir immédiatement le visuel final ;
2. ajouter/remplacer sa photo ;
3. ajouter ou modifier du texte ;
4. ajuster les éléments ;
5. télécharger son visuel ;
6. partager son visuel.

Le parcours normal ne nécessite pas de compte.

```text
VOIR → MODIFIER → VALIDER → TÉLÉCHARGER / PARTAGER
```

Ne pas transformer cette page en logiciel de montage complet.

## 2. Direction artistique

- Minimaliste, premium, blanc/noir.
- Accents gradient Campagnes.
- Peu de bordures, peu de cartes.
- Hiérarchie forte et espace utile.
- Le canvas est le point focal.

Palette :
```text
Black       #000000
White       #FFFFFF
Gray        #E5E7EB
Gradient    #7B1FFF → #FF36B8 → #FF6B68 → #FFD93D
```

Le gradient sert principalement au CTA principal, aux accents et aux états actifs.

## 3. Architecture de page

### Desktop

```text
┌──────────────────────────────────────────────────────────────┐
│ Logo Campagnes                         Aperçu        •••     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                     VISUEL / CANVAS                          │
│                                                              │
│                  [ frame + photo + texte ]                   │
│                                                              │
│       Changer photo   Ajouter texte   Ajuster   Télécharger  │
│                                                              │
│       Partager : WhatsApp · Facebook · TikTok · Copier      │
├──────────────────────────────────────────────────────────────┤
│ Campagnes                                      Aide · ...    │
└──────────────────────────────────────────────────────────────┘
```

### Mobile

```text
Campagnes                         Aperçu  •••

┌─────────────────────────────┐
│                             │
│           CANVAS            │
│                             │
└─────────────────────────────┘

[Photo] [Texte] [Ajuster] [↓]

Partager
WhatsApp · Facebook · TikTok · Copier
```

## 4. Header

Desktop : 64–72 px. Mobile : 56–64 px.

```text
[ Logo Campagnes ]                 [ Aperçu ] [ ••• ]
```

Ne pas afficher un gros titre de campagne si cela réduit l’espace du canvas.

## 5. Canvas

Le canvas est l’élément principal.

Desktop recommandé : `max-width: 520–680px`, selon le ratio du template.

Ratios à respecter : `1:1`, `4:5`, `9:16`, `16:9` selon le template réel.

Le canvas ne doit jamais être déformé.

Coins légèrement arrondis et ombre très légère seulement.

## 6. Édition directe

Le participant travaille directement sur le visuel.

```text
Ajouter du texte
      ↓
Texte sur le canvas
      ↓
Texte sélectionné
      ↓
Écriture directe
      ↓
Valider
```

Le texte est un vrai calque.

### Règle absolue de z-index

Tous les textes utilisateur doivent être au-dessus de tous les autres calques du frame.

```text
Texte 2
Texte 1
Autres éléments
Photo / vidéo
Frame
Background
```

Le dernier texte ajouté est au-dessus des textes précédents.

Ne pas utiliser seulement un énorme `z-index` CSS si le canvas possède déjà un vrai système de layers : la priorité doit être gérée dans le modèle/rendu du canvas.

## 7. Barre d’actions principale

Une seule barre compacte sous le canvas :

```text
[ Changer de photo ] [ Ajouter du texte ] [ Ajuster ] [ Télécharger ]
```

Le téléchargement est l’action principale.

Desktop : actions horizontales.

Mobile :
```text
[ Photo ] [ Texte ] [ Ajuster ] [ ↓ ]
```

Sur très petit écran, privilégier une icône download compacte pour préserver l’espace.

## 8. CTA Télécharger

Texte : `Télécharger`.

Gradient Campagnes.

Recommandations :
- Desktop : 44–48 px de hauteur, largeur ~150–180 px.
- Mobile : 48–52 px de hauteur.
- Icône download.

## 9. Toolbar texte

Lorsqu’un texte est sélectionné, afficher seulement les contrôles utiles.

```text
[ Police ] [ Taille ] [ Couleur ] [ B ] [ I ] [ ✓ ]
```

Contrôles prioritaires : police, taille, couleur, gras, italique, alignement, validation.

Les options avancées peuvent rester dans `Ajuster`.

Sur mobile, utiliser une toolbar compacte ou un bottom sheet.

## 10. Validation et plusieurs textes

`Valider` termine l’édition sans supprimer le texte.

Après validation, l’utilisateur peut faire :

```text
Ajouter du texte → Texte 1 → Valider
Ajouter du texte → Texte 2 → Valider
```

Chaque texte est indépendant et sélectionnable séparément.

## 11. Ajuster

Ne pas afficher tous les réglages en permanence.

`Ajuster` ouvre un panneau contextuel selon l’élément sélectionné.

Exemple :
```text
Ajuster

Photo
[ Position ]
[ Zoom ]

Texte sélectionné
[ Taille ]
[ Couleur ]
[ Alignement ]
```

Sur mobile : bottom sheet compact et dismissible.

## 12. Partage

Le partage est secondaire au téléchargement.

```text
Partager
[ WhatsApp ] [ Facebook ] [ TikTok ] [ Copier ]
```

Sur mobile, privilégier une ligne compacte ou un horizontal scroll plutôt que quatre grosses cartes.

Utiliser `/c/[slug]` pour le partage public, jamais un token privé dans le partage social normal.

## 13. Hauteur de page

Objectif : voir rapidement :

```text
Header → Canvas → Actions → Partage
```

Éviter les longues descriptions, cartes explicatives et sections marketing dans le flux participant.

## 14. Ce qui doit disparaître du rendu actuel

Réduire ou supprimer du flux principal :
- grand titre permanent ;
- longue description ;
- grosses cartes explicatives ;
- formulaire texte permanent ;
- gros bloc de partage ;
- texte marketing inutile ;
- répétitions.

Conserver :
- canvas ;
- actions ;
- contrôles contextuels ;
- téléchargement ;
- partage compact.

## 15. Typographie

Police : `Inter`.

```text
Page title : 20–28 px
Section     : 14–16 px
Body        : 13–15 px
Small       : 11–12 px
Button      : 13–14 px
```

Le participant n’a pas besoin d’un énorme titre.

## 16. Boutons

Primary : gradient Campagnes, radius 10–14 px, hauteur 44–52 px.

Secondary : fond blanc + bordure `#E5E7EB`.

Tertiary : texte + icône, sans container lourd.

## 17. Espacements

Base : `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`.

Desktop : padding horizontal 24–40 px.

Mobile : padding horizontal 12–16 px.

Canvas → actions : 12–16 px.

Actions → partage : 20–24 px.

Éviter les grands espaces verticaux entre petites sections.

## 18. Responsive

### 320 px
- aucune coupure ;
- pas de scroll horizontal ;
- canvas visible ;
- CTA accessible ;
- toolbar compacte.

### 375–390 px
Cible mobile principale. Le canvas peut viser `calc(100vw - 24px à 32px)`.

### 414–430 px
Même structure avec davantage d’espace autour du canvas.

### Tablet / Desktop
Canvas centré ; actions sous le canvas ; éviter une architecture en deux colonnes si elle n’apporte pas de valeur.

## 19. Mobile et clavier

Lors de l’édition directe du texte :
- le clavier virtuel ne doit pas masquer complètement le texte ;
- les contrôles doivent rester accessibles ;
- le canvas doit rester manipulable ;
- gérer correctement le focus et le scroll lorsque le clavier apparaît.

## 20. Accessibilité

Obligatoire :
- contraste suffisant ;
- labels explicites ;
- focus visible ;
- navigation clavier desktop ;
- zones tactiles ~44 px minimum ;
- `aria-label` pour les boutons icon-only ;
- ne pas dépendre uniquement de la couleur ;
- état sélectionné identifiable ;
- erreurs lisibles.

## 21. Performance

Le canvas doit rester fluide.

Éviter :
- rerender complet à chaque frappe ;
- reconstruction complète des calques à chaque mouvement ;
- images inutiles ;
- duplication du rendu canvas.

Le modèle existant du canvas doit rester la source de vérité.

## 22. Architecture fonctionnelle

```text
Participant page
      │
      ├── Campaign / template
      │
      ├── Canvas
      │     ├── Background
      │     ├── Frame
      │     ├── Photo / Video
      │     ├── Graphic layers
      │     └── Text layers
      │
      ├── Contextual controls
      ├── Main actions
      └── Share / Export
```

Ne pas créer un deuxième éditeur, système de calques, système de coordonnées ou exporteur.

## 23. Modèle texte

Réutiliser le modèle existant. À défaut :

```ts
{
  id: string
  type: "text"
  text: string
  x: number
  y: number
  fontFamily: string
  fontSize: number
  color: string
  fontWeight?: string
  fontStyle?: string
  textAlign?: string
  rotation?: number
  scale?: number
  zIndex: number
}
```

Invariant :

```text
zIndex(text) > zIndex(all non-text layers)
```

Le dernier texte ajouté a la priorité maximale parmi les textes.

## 24. Export

Le canvas et l’export doivent utiliser le même modèle de calques.

Vérifier :
- position ;
- taille ;
- rotation ;
- ordre ;
- texte ;
- couleur ;
- image ;
- frame ;
- ratio.

Le fichier exporté doit visuellement correspondre au canvas.

## 25. États

### Initial
```text
Canvas
+ Changer photo
+ Ajouter texte
+ Ajuster
+ Télécharger
```

### Texte sélectionné
Afficher les contrôles texte.

### Texte en édition
Afficher toolbar + `Valider`.

### Export
```text
Téléchargement…
```

### Succès
```text
Votre visuel est prêt ✨
```

### Erreur
```text
Impossible d’exporter le visuel.
Réessayez.
```

## 26. Critères d’acceptation

- [ ] Page nettement plus courte.
- [ ] Canvas = point focal.
- [ ] Pas de grande carte inutile.
- [ ] Le participant comprend immédiatement quoi faire.
- [ ] Texte éditable directement sur le visuel.
- [ ] Tous les textes au-dessus des autres calques.
- [ ] Plusieurs textes indépendants.
- [ ] Contrôles contextuels.
- [ ] Téléchargement = action principale.
- [ ] Partage = action secondaire.
- [ ] Aucun compte requis dans le parcours normal.
- [ ] 320 px fonctionne.
- [ ] 375 px fonctionne.
- [ ] 390 px fonctionne.
- [ ] 414 px fonctionne.
- [ ] 430 px fonctionne.
- [ ] Desktop fonctionne.
- [ ] Accessibilité vérifiée.
- [ ] Export identique au canvas.
- [ ] Aucun workflow existant dupliqué.

## 27. Principe final

> **Le participant vient créer son visuel, pas lire une page.**

La hiérarchie finale doit être :

```text
VISUEL
  ↓
ÉDITION
  ↓
TÉLÉCHARGEMENT
  ↓
PARTAGE
```

Tout le reste doit être secondaire, contextuel ou supprimé.
