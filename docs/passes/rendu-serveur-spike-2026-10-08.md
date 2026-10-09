# Spike — rendu serveur du cadre (pass « sans filigrane »)

**Date** : 2026-10-08 · **Statut** : mesure faite, décision à prendre

## Pourquoi ce spike

Un pass payé par le participant n'est défendable que si le badge est décidé
**et** dessiné hors du navigateur. Aujourd'hui tout se joue côté client :
`participant-journey.tsx:343` calcule le plan d'export, `lib/video-export.ts`
pose le badge. Ce spike répond par la mesure, avant d'écrire une ligne de
production.

Harnais : `tools/server-render-spike/spike.ts`.
Exécution : `npx tsc -p tools/server-render-spike/tsconfig.json && node tools/server-render-spike/build/tools/server-render-spike/spike.js`

## Résultats — 7 / 10

| # | Vérification | Résultat |
|---|---|---|
| 1 | `fabric/node` + node-canvas importables | ✅ |
| 2 | PNG 1080×1080 produit | ✅ 14 582 octets |
| 3 | Délai compatible serverless | ✅ **2 332 ms** (limite Hobby 10 s) |
| 4 | `lib/descriptor` utilisable dans Node | ✅ |
| 5 | `lib/fabric-shape` utilisable dans Node | ✅ |
| 6 | `lib/fabric-text` utilisable dans Node | ❌ `document is not defined` |
| 7 | Image chargée depuis un chemin absolu | ❌ schéma `c:` invalide |
| 8 | Image chargée en `file://` | ✅ 2065×490 (le logo du badge) |
| 9 | `lib/watermark.addBadge` rendu serveur | ❌ `document is not defined` |
| 10 | Logo du badge accessible | ✅ `public/logo-dark.png` |

## Ce que ça prouve

**Le rendu serveur est possible et rapide.** 2,3 s pour un 1080×1080 avec deux
objets, dont l'essentiel est le chargement des modules — c'est un coût de démarrage
à froid, pas de rendu. La marge est large sous les 10 s du plan Hobby.

Deux pièges d'API, corrigés dans le spike :
- passer un `createCanvas()` à `StaticCanvas` échoue (`el.hasAttribute is not a function`). Il faut `new StaticCanvas(undefined, { width, height })`.
- `getElement().toBuffer()` n'existe pas. La sortie se fait par `canvas.toDataURL({ format: 'png' })`.

## Ce que ça bloque

### 1. Le texte dépend du DOM — `document is not defined`

`lib/fabric-text.ts` importe le build navigateur de `fabric`, qui mesure le texte
via un canvas caché dans le document. Même cause pour `addBadge`, qui fait
`await import('fabric')` et charge son logo par une URL relative
(`'/logo-dark.png'`) sans signification hors navigateur.

**Correction** : injecter l'implémentation Fabric et un résolveur d'assets dans
les fabriques partagées, au lieu d'un import statique. C'est le seul moyen de
garder **une seule** description du cadre — la règle du projet est explicite :
si l'aperçu et le fichier ne partagent pas le même code, l'aperçu ment.

Coût : `lib/fabric-text.ts`, `lib/fabric-image.ts`, `lib/fabric-shape.ts`,
`lib/watermark.ts`, `lib/video-export.ts` + un module d'environnement.

### 2. Les polices — le risque sous-estimé

`node-canvas` n'utilise que les polices **installées sur la machine**. Sur ce
poste, « Inter » se résout (largeur naturelle 407 px pour « SIAO 2026 » en 80 px)
et « Helvetica » déclenche un avertissement de repli. **Sur Vercel, aucune des
sept polices du projet n'est présente** : le texte partirait en police de repli,
avec des métriques différentes du navigateur — donc un fichier qui ne correspond
pas à l'aperçu.

**Correction** : livrer les fichiers `.ttf` dans le dépôt et les enregistrer au
démarrage (`registerFont`). À chiffrer : poids des fichiers, temps d'enregistrement
au démarrage à froid.

### 3. Le logo du badge

`file://` fonctionne, le chemin absolu non. Un résolveur unique (URL publique en
navigateur, `file://` ou lecture disque côté serveur) règle les deux cas.

## Décision à prendre

Deux voies, et elles n'ont pas le même coût :

| Voie | Avantage | Coût |
|---|---|---|
| **A. `fabric/node` + refactor des fabriques** | Un seul code de rendu, identique à l'aperçu, rapide | Refactor de 5 modules partagés + livraison des polices |
| **B. Chrome headless (CDP)** | Aucun refactor, pixels identiques par construction | Binaire lourd sur Vercel (limite 50 Mo), démarrage à froid long, dépendance externe |

**Recommandation : A.** Le projet impose déjà qu'aperçu et fichier partagent le
même code ; B contourne cette règle au lieu de la tenir, et ajoute une
infrastructure à exploiter.

## Suite (une fois la voie choisie)

1. Module d'environnement Fabric + résolveur d'assets ; refactor des fabriques.
2. Enregistrement des polices ; mesure du rendu d'un cadre réel (texte + photo).
3. Route `/api/render` (`runtime = 'nodejs'`) qui compose **et** décide du badge.
4. Vérification du produit PawaPay **Checkouts** (`POST /v2/checkouts`) — le projet
   n'intègre aujourd'hui que Hosted Payment Page (`/v2/paymentpage`).
5. Migration du pass, routes d'activation, UI participant à 300 FCFA / 24 h.
