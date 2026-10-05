# Positionnement des textes dans l'éditeur — rapport

> **Demande** : chaque texte doit avoir sa propre position dans le système de
> coordonnées déjà présent ; ne pas créer un deuxième système ; le texte doit
> pouvoir être déplacé, repositionné, redimensionné et tourné dans la mesure où
> le système le permet.

- **Date** : 2026-10-05
- **Base** : `master` @ `f3c7ae5` + arbre de travail
- **Méthode** : lecture du code, `tsc --noEmit`, `npm run build`, et un harnais
  qui **exécute réellement Fabric** — pas une relecture.

---

## 1. Verdict

| Exigence | État avant | État après |
|---|---|---|
| Un seul système de coordonnées | ✅ déjà | ✅ inchangé |
| Position propre par texte | ✅ déjà | ✅ |
| Déplacement | ✅ déjà | ✅ |
| Repositionnement (nouvel onglet, annulation) | ✅ déjà | ✅ |
| Rotation | ✅ déjà | ✅ |
| **Redimensionnement** | ❌ **perdu** | ✅ persisté |

**Un seul défaut réel, et il est mesuré** : redimensionner un texte au pinceau ne
se conservait pas.

---

## 2. Le système de coordonnées — il n'y en a qu'un, et il est correct

Le repère est celui du ratio (`1:1`, `16:9`, `9:16`), porté par le canvas Fabric.
Un calque — texte, image ou forme — a les mêmes propriétés :

```ts
{ x, y, w, h, rotation, z, opacity }   // LayerBase, lib/types.ts
```

Le `x` / `y` d'un texte **est** le `left` / `top` de Fabric, dans les mêmes
unités, avec le même angle d'ancrage (`originX: 'left'`, `originY: 'top'`).
Vérifié par le contrôle : un calque à `x: 200, y: 150` relit l'objet à
`left: 200, top: 150`.

Le parcours participant utilise **le même** canvas et le même repère : la photo et
le texte sont deux objets Fabric dans la même scène, et `composeDescriptor` écrit
un descripteur ordinaire. Il n'existe pas de calque « spécial » dont un
consommateur devrait connaître la convention.

**Je n'ai rien ajouté de ce côté.** Ni champ, ni couche, ni conversion.

---

## 3. Le défaut : un texte redimensionné revenait à sa taille

Quand on étire un texte par ses poignées, Fabric change `scaleX` / `scaleY` et
**ne touche pas** `fontSize`. Or le descripteur ne connaît que `size`. À la
reconstruction, `createTextObject` rebâlit le texte à son corps d'origine.

Mesuré avant correction, en exécutant Fabric :

| Geste | Taille attendue | Taille au rechargement |
|---|---|---|
| Agrandi ×2 | 2 191 px | **1 095 px** (−50 %) |
| Réduit de moitié | 548 px | **1 095 px** (+100 %) |

C'est la faute la plus vicieuse du projet parce que **le stockage est bon** :
`emitFromCanvas` écrivait bien la nouvelle emprise dans `w` / `h`. Le descripteur
sur disque était juste, et l'affichage mentait quand même. Rien ne se voyait à
l'œil dans le code, et rien ne se voyait non plus à l'écran tant qu'on ne
rechargeait pas la page.

Le parcours participant avait le même défaut, aggravé : `emitText` n'écrivait que
`x`, `y` et `rotation` — ni taille, ni échelle.

---

## 4. La correction — replier l'échelle dans le corps

`bakeTextScale()` (`lib/fabric-text.ts`) fait trois choses, dans cet ordre :

1. lit l'échelle du canvas ;
2. l'applique au **corps** (`fontSize`), puis remet `scaleX` / `scaleY` à 1 ;
3. rend la boîte à l'identique.

Le texte est donc laissé **exactement** où il était à l'écran : replier ne doit
jamais faire sauter ce que le doigt vient de poser.

Appelé aux deux endroits qui lisent le canvas vers le descripteur :
`emitFromCanvas` (éditeur) et `emitText` (parcours participant).

### Pourquoi cette voie, et pas l'autre

La première piste était d'appliquer `w` à la reconstruction, comme le fait
l'éditeur pour les images (`img.scaleX = layer.w / naturalWidth`). Elle marche pour
une image. **Pour un texte, elle est fausse** — et le contrôle l'a montré :

> Un calque texte créé par `makeTextLayer` annonce `w = 864` alors qu'un mot n'en
> occupe que 173. Appliquer la boîte **étirerait chaque texte court sur toute la
> largeur du cadre**.

Le panneau de l'éditeur le sait déjà : il masque le curseur de taille pour les
textes, parce que pour un texte la taille, c'est le corps. Replier l'échelle dans
le corps respecte cette hiérarchie au lieu de la concurrencer.

> Une distinction utile : pour une image, `w` est une **boîte à atteindre** ; pour
> un texte, `w` est une **emprise**, vide avant la première mesure. D'où le repli,
> et non l'application.

### Pourquoi c'est idempotent

Reconstruire avec `size = corps × échelle` redonne une largeur naturelle
`largeur × échelle` : l'emprise est exactement celle d'avant. Contrôle : trois
cycles successifs donnent `1973 → 1973 → 1973`.

---

## 5. Ce qui a changé dans les fichiers

| Fichier | Changement |
|---|---|
| `lib/fabric-text.ts` | `bakeTextScale()` — le repli, et sa garde |
| `components/frame/frame-editor.tsx` | `emitFromCanvas` écrit `size` / `w` / `h` issus du repli |
| `components/participant/participant-stage.tsx` | `emitText` écrit `size` / `w` / `h` ; boîte remesurée à chaque frappe |
| `lib/participant.ts` | `ParticipantText` porte `w` / `h` (la **mesure**, pas un réglage) ; `participantTextLayer` les utilise ; `sameStyle` les compare |

`w` / `h` sur `ParticipantText` ne sont pas un second système : ce sont les mêmes
nombres, dans le même repère, que ceux du calque. Ils ne sont pas un réglage non
plus — c'est la mesure de ce que le participant voit, nécessaire pour que le
fichier téléchargé soit identique à l'aperçu.

`sameStyle` les compare : sans cela, un redimensionnement au pinceau serait lu
comme « aucun changement », donc **non annulable**.

---

## 6. Le contrôle

`npm run check:text-geometry` — **36 contrôles, 0 échec**. Il **exécute Fabric**
(donc il mesure une emprise réelle, il ne simule pas).

| # | Ce qui est vérifié | Résultat |
|---|---|---|
| 1 | témoin : la mesure voit-elle une échelle ? | 1095 → 2191 |
| 2 | témoin : un calque image porte sa boîte | ok |
| 3 | texte non redimensionné : aller-retour neutre | 0 px d'écart |
| 4 | texte agrandi ×2 : **2190 → 2190** | 0 px |
| 5 | texte réduit ×0,5 : **548 → 548** | 0 px |
| 6 | trois cycles : **1973 → 1973 → 1973** | pas de dérive |
| 6bis | le repli est invisible à l'écran | écart dans l'allocation de trait |
| 7 | position et rotation survivent | x, y, rotation exacts |
| 8 | **un texte court n'est pas étiré** | 174 px, pas 800 |
| 9 | ancrage coin supérieur gauche | `left` / `top` |
| 10 | texte vide : ni échelle infinie, ni disparition | corps 96, échelle 1 |
| 11 | sérialisation : la géométrie relue décide | x, y, w, size |
| 12 | **parcours participant** : style → descripteur → rendu | corps et boîte conservés |
| 13 | la boîte vaut la mesure, pas le budget | 173, pas 672 |

### Le contrôle est falsifiable — preuve

Un contrôle qui ne peut pas échouer ne prouve rien. J'ai **neutralisé le repli**
et relancé : le contrôle échoue exactement sur les valeurs historiques.

```
[OK]  une echelle x2 double bien l emprise relevee — 1095 -> 2191
[OK]  aller-retour a l identique : aucune perte
=== 4. Un texte AGRANDI x2 revient agrandi ===
[FAIL] largeur 1095 au lieu de 2191 (ecart -1096 px)
[FAIL] hauteur 109  au lieu de 219  (ecart -110 px)
=== 5. Un texte REDUIT de moitie revient reduit ===
[FAIL] largeur 1095 au lieu de 548 (ecart 547 px)
[FAIL] hauteur 109  au lieu de 55  (ecart 54 px)
=== 6bis ===
[FAIL] l echelle est neutralisee apres repli
[FAIL] le corps a ete multiplie par le facteur — 96 -> 96
```

Le témoin de la section 1 reste vert dans les deux cas : c'est bien le repli qui
était mesuré, pas un artefact de montage.

### Mesurer du texte sans navigateur

`node-canvas` est dans `node_modules` mais **sans binaire natif** : le point
d'entrée Node de Fabric est inutilisable. Le substitut de `tools/shape-check`
(lève une erreur) suffit pour des formes, pas pour du texte — Fabric mesure les
glyphes via `ctx.measureText()`.

`canvas-2d.js` fournit donc un contexte qui mesure « largeur = 0,6 × corps ×
caractères ». La règle est grossière et surtout **déterministe** : la même chaîne
donne toujours le même nombre, sur les deux cycles. C'est cette stabilité qui
permet d'attribuer un échec au repli manquant plutôt qu'à la fonte. Une police
réelle rendrait le contrôle plus « réaliste » mais **non reproductible** d'une
machine à l'autre.

---

## 7. Aucune régression

| Harnais | Avant | Après |
|---|---|---|
| `check:text` | vert | vert |
| `check:text-geometry` | *(n'existait pas)* | **36 / 36** |
| `check:shapes` | vert | vert |
| `check:participant` | vert | vert |
| `check:history` | vert | vert |
| `check:templates` | vert | 16 / 16 |
| `check:watermark` | vert | 14 / 14 |
| `check:clone` | 26 / 26 | 26 / 26 |
| `check:topup` | 18 / 18 | 18 / 18 |
| `check:distribution:contract` | 53 / 53 | 53 / 53 |
| `tsc --noEmit` | ✅ | ✅ |
| `npm run build` | ✅ | ✅ |

`check:participant` n'avait **ni tsconfig ni script npm** : il existait mais ne
pouvait pas tourner. Ajouté.

---

## 8. À signaler

**Des modifications sont apparues dans l'arbre de travail pendant cette
intervention, dans des fichiers que je n'ai pas touchés** :
`lib/video-export.ts` (`bringParticipantTextToFront`), et des retouches d'interface
sur `components/participant/participant-journey.tsx` (espacements, libellés
français, « Entrer votre texte » → « Votre texte »). Ces modifications portent sur
le **z-order** du texte et le **polissage visuel**, pas sur le positionnement.

Je n'y ai pas touché. Elles coexistent avec ma correction — le typage, le build et
les douze harnais passent — mais je ne peux pas en garantir l'intention : **si ces
modifications ne sont pas les vôtres, il faut le dire**, parce que je ne connais pas
ce qui les a produits.

---

## 9. Ce qui n'a pas été fait

- **Aucun champ de position nouveau.** `x`, `y`, `w`, `h`, `rotation` restent les
  seules propriétés de placement, comme pour les images et les formes.
- **Aucun second repère**, aucune conversion, aucun pourcentage.
- **Le panneau n'a pas retrouvé le curseur de taille pour les textes.** Masqué,
  c'est correct : pour un texte, la taille est le corps. Si vous le voulez, c'est un
  changement d'interface, pas de géométrie.
- **La rotation participant passe par les poignées** ; `lockRotation: false` est
  déjà posé. Rien à faire.