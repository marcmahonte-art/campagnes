# Interface participant de la maquette — a-t-elle été implémentée ?

> **Question** : la maquette déposée dans `docs/participant` (éditeur participant,
> rendu desktop + mobile) correspond-elle à une interface réellement implémentée ?
>
> **Réponse courte** : **oui, l'interface existe et fonctionne** — mais elle n'est
> **pas identique à la maquette**. Le cœur du parcours est là ; l'élément
> signature de la maquette, la **barre d'outils texte flottante posée sur le
> visuel**, ne l'est pas.

- **Date** : 2026-10-05 — **mis à jour après la fin de la phase U1/interface**
- **Base** : `master` @ `f2708c7` + arbre de travail
- **Méthode** : lecture du code, historique Git, et **rendu réel** de la page
  `/c/je-suis-exposant-au-siao` (campagne qui a servi à produire la maquette)
  capturé à 1440 px et 390 px après dépôt d'une photo et ouverture du panneau texte.

> **⚠️ Note sur la fraîcheur de ce rapport.** Les sections 2 et 6 décrivent un
> état **antérieur** à la fin de la phase d'interface : la barre d'actions y est
> donnée pour absente, et les boutons d'alignement pour inexposés. Les deux ont
> été corrigées depuis. Ce document est conservé pour sa comparaison
> élément par élément ; **la section 5 est la seule qui décrive le rendu
> actuel**, et c'est la seule que l'on puisse lire sans vérifier le code.

---

## 1. Verdict

| | Constat |
|---|---|
| L'écran existe | ✅ `/c/[slug]` et `/d/[token]`, composant `ParticipantJourney` |
| Il fonctionne | ✅ photo, texte, filtre, téléchargement, partage |
| Barre d'actions unique (`Changer de photo · Ajouter un texte · Ajuster · Télécharger`) | ✅ implémentée |
| Contrôles d'alignement du texte | ✅ **corrigé** — voir §6 |
| Partage compact en une rangée | ✅ implémenté |
| Il correspond à la maquette | ⚠️ **partiellement** — la barre d'outils flottante sur le visuel reste absente |
| L'élément signature (toolbar flottante) | ❌ **non implémenté** — écart de conception assumé |

---

## 2. Comparaison élément par élément

Chaque ligne a été vérifiée **dans le code** et **à l'écran**.

> **État au moment de la première rédaction de ce tableau.** La barre d'actions,
> l'alignement et le partage compact ont été corrigés depuis — voir §6. Ce
> tableau sert de point de comparaison, pas de référence actuelle.

| Élément de la maquette | État | Emplacement réel |
|---|---|---|
| En-tête : logo · `Aperçu` · `•••` | ✅ | `participant-journey.tsx:543-560` |
| Canvas = point focal | ✅ | `participant-stage.tsx` |
| Photo posée sur le canvas | ✅ | `participant-stage.tsx:288-310` |
| Texte sur le canvas | ✅ | `participant-stage.tsx:349-357` |
| **Barre d'outils texte flottante sur le visuel** (`Inter · 36 · B · I · couleur · ✓`) | ❌ **absente** | remplacée par un **panneau sous le canvas** |
| Barre d'actions `Changer de photo · Ajouter un texte · Ajuster · Télécharger` | ✅ | `participant-journey.tsx:702-755` |
| CTA `Télécharger` en dégradé | ✅ | `:736-754` |
| `Ajuster` → zoom + filtre | ✅ | `:760-896` |
| Texte : police · taille · couleur · **gras** · **italique** | ✅ | `:905-1212` |
| Texte : **souligné** · **barré** | ✅ *(bonus, hors maquette)* | `:1066-1097` |
| Texte : **alignement** (3 icônes dans la maquette) | ❌ **importé mais jamais rendu** | `AlignLeft/Center/Right` l. 20-22, jamais utilisés |
| Texte : **`Ajouter un autre`** | ❌ absent | (remplacé par le bouton principal) |
| Titre du panneau **`Texte sélectionné`** | ❌ — le panneau s'intitule `Texte` | `:908` |
| Partager `WhatsApp · Facebook · TikTok · Copier le lien` | ✅ | `share-panel.tsx` |
| Partage **compact** (une ligne de 4 icônes) | ⚠️ plus lourd : carte + bouton `Partager…` + texte explicatif | `share-panel.tsx:110-218` |
| Pied de page `Des visuels qui ressemblent · Aide · Confidentialité · Conditions` | ❌ **pas de footer** sur la page participant | `site-footer.tsx` n'y est pas monté |
| Bandeau filigrane | ⚠️ présent *(hors maquette)* | `:1270-1307` |
| Bloc `Comment ça marche` | ⚠️ présent à l'état initial *(la spec §14 dit de le retirer)* | `:1321-1344` |

**Libellés** : la maquette écrit `Ajouter du texte`, le code écrit
`Ajouter un texte` (`:721`, `:1207`).

---

## 3. L'écart principal : la toolbar flottante

La maquette place, **sur le visuel**, une petite barre `Inter · 36 · ● · B · I · ✓`
qui apparaît quand le texte est sélectionné. C'est aussi ce que demande la
spécification `campagnes_participant_editor_ui_specs.md` § 9 :

> `[ Police ] [ Taille ] [ Couleur ] [ B ] [ I ] [ ✓ ]`

**Cette barre n'existe nulle part dans le code.** Le composant de scène
(`participant-stage.tsx`) ne rend que le canvas, un damier de transparence et un
libellé accessible — aucun élément positionné au-dessus du visuel.

À la place, le produit a fait un autre choix : **un panneau sous le canvas**
(`participant-journey.tsx:905-1212`), qui porte les mêmes réglages plus le
souligné et le barré. Fonctionnellement équivalent, visuellement différent de la
maquette.

Ce n'est pas une régression : c'est une **divergence de conception**. La maquette
a été produite après, ou le panneau a été préféré pour une raison non consignée.

---

## 4. Ce qui a été implémenté puis retiré

L'historique Git montre qu'une première tentative d'alignement sur Twibbonize a
eu lieu, puis a été remplacée :

| Commit | Objet |
|---|---|
| `9189629` | Ajout de `Toolbar` et `FilterTools` (composants-maquettes) |
| `8e51e1c` | **Suppression** de `components/participant/toolbar.tsx` et `filter-tools.tsx` |
| `c6e9125` | « align text toolbar and canvas controls with Twibbonize » |
| `9ebcf21` | « texte participant au-dessus du frame + contrôles alignement » |
| `9c86638` | Correction du redimensionnement du texte (ajoute aussi la spec dans `docs/`) |

`toolbar.tsx` était une **barre d'en-tête en dégradé**, pas la barre flottante —
et elle n'était rendue nulle part avant sa suppression.

La chaîne `« Ajouter un autre »` n'apparaît dans **aucun** commit : elle n'a
jamais été implémentée. La chaîne `« Texte sélectionné »` n'existe que dans le
document de spécification, jamais dans un composant.

---

## 5. Preuves de rendu

Rendus produits sur la campagne réelle `je-suis-exposant-au-siao` (celle de la
maquette), avec dépôt d'une photo puis ouverture du panneau texte :

- `captures/comparaison-desktop.png` — maquette vs réel (1440 px)
- `captures/comparaison-mobile.png` — maquette vs réel (390 px)
- `captures/reel-1440-texte.png` — réel desktop, panneau ouvert
- `captures/reel-390-texte.png` — réel mobile, panneau ouvert

Le rendu réel affiche bien : en-tête, canvas avec photo et texte, barre
`Changer de photo · Modifier le texte · Ajuster · Télécharger`, panneau texte
(police, taille, B/I/U/S, couleurs), bandeau filigrane, carte de partage.

---

## 6. Conclusion — mise à jour

L'interface de la maquette **a été implémentée**, à une exception principale.

### Corrigé depuis la première rédaction de ce rapport

**Les contrôles d'alignement.** Le constat était juste et il s'agissait d'un vrai
défaut, pas d'un écart de goût : `AlignLeft`, `AlignCenter` et `AlignRight` étaient
**importés dans `participant-journey.tsx` (l. 20-22) et jamais rendus**. Le
modèle de données portait `align`, la scène l'appliquait, l'export le relisait —
et aucun bouton ne l'exposait. Une fonctionnalité écrite, propagée jusqu'au
fichier téléchargé, et impossible à utiliser depuis l'écran : le pire état
possible, puisqu'elle donnait l'impression d'exister.

Les trois boutons sont désormais rendus, avec `aria-pressed` (positions
exclusives, mais ce sont des boutons indépendants dans une barre d'outils, pas
un groupe de radios).

**La barre d'actions unique.** Elle existait déjà au moment de la rédaction de
ce rapport — le tableau du §2 se.contredit avec le §5 sur ce point. La version
courante range les réglages permanents derrière « Ajuster » et « Texte », et
remet le téléchargement dans la barre, où la spec §7 le veut.

**Le partage.** Passé d'une carte à deux colonnes à une rangée défilable d'une
seule ligne (spec §12).

### Reste ouvert — c'est un choix, pas un défaut

1. **La barre d'outils texte flottante posée sur le visuel** (spec § 9) : le
   produit a fait un autre choix, un panneau sous le canvas. Fonctionnellement
   équivalent, visuellement différent. C'est une divergence de conception, pas
   une régression.
2. `Ajouter un autre` dans le panneau (spec § 10) — absent. Attention : le
   modèle ne porte aujourd'hui **qu'un seul texte participant**
   (`ParticipantStyle.text`, un seul calque de `PARTICIPANT_TEXT_ID`). Ajouter
   ce bouton sans élargir le modèle afficherait un contrôle qui écraserait le
   texte existant.
3. Libellés (`Ajouter un texte` / `Ajouter du texte`), absence de pied de page,
   et présence de blocs que la spec §14 demande de réduire.

### Ce qui n'a pas été vérifié par machine

Les largeurs imposées par la spec §18 (320, 375, 390, 414, 430 px) **n'ont pas
été validées par un contrôle reproductible**. Un contrôle headless a été écrit
puis abandonné : il passait une fois sur six, ce qui ne prouve rien. Les captures
`captures/reel-390-*.png` montrent un rendu mobile réel, mais une seule fois, sur
une machine donnée.

C'est le point à vérifier en priorité, sur un vrai téléphone ou avec une sonde
stabilisée.
