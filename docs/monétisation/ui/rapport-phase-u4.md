# Rapport de phase U4 — Qualité

> **Date** : 2026-10-05  
> **Périmètre** : `/tarifs`, monétisation, paiement Mobile Money, quotas et filigrane.  
> **Verdict** : **partiellement conforme**. Les invariants produit passent, mais le seuil
> Lighthouse mobile Performance >= 90 n'est pas atteint.

---

## 1. Résumé

| Contrôle U4 | État | Résultat |
|---|---:|---|
| Checklist tarifs / prix / passerelles | ✅ | `check:ui-tarifs` conforme et falsifiable |
| HTML serveur de `/tarifs` | ✅ | 3 cartes, prix, quotas et mentions Mobile Money présents |
| Sélecteur 1 / 6 / 12 mois | ✅ | Clics réels Chrome, témoin négatif détecté |
| Filigrane / non-contournement | ✅ | `check:watermark` : 14 / 14 |
| Paiement pack / webhook idempotent | ✅ | `check:topup` : 18 / 18 |
| Parcours participant | ✅ | `check:participant` : 0 échec |
| TypeScript | ✅ | `tsc --noEmit` |
| Build production | ✅ | `next build` |
| Lighthouse Accessibilité mobile | ✅ | 93 |
| Lighthouse CLS mobile | ✅ | 0,0022 |
| Lighthouse Performance mobile | ❌ | 66 à la dernière mesure, 73 après optimisation logo, seuil attendu 90 |

---

## 2. Corrections faites pendant U4

### 2.1 Logo public trop lourd

Le rapport Lighthouse mobile initial montrait que `/logo-dark.png` pesait environ **607 Ko** et
était chargé sur `/tarifs`. Un actif existant beaucoup plus léger a été publié :

- nouveau fichier : `public/logo-campagnes.png` (**6,7 Ko**) ;
- `components/ui/logo.tsx` utilise ce fichier pour le logo noir ;
- le logo blanc existant reste inchangé pour les surfaces sombres.

Effet mesuré : le LCP est passé d'environ **5,1 s** à environ **2,4 s** sur une mesure mobile.

### 2.2 Header statique pour `/tarifs`

`/tarifs` utilise désormais `components/site-header-static.tsx`, une version visiteur du header qui
ne lit pas la session. L'objectif est d'éviter de charger la couche d'authentification pour une page
principalement statique.

---

## 3. Lighthouse

Rapports générés :

- `docs/monétisation/ui/lighthouse-u4-mobile.json`
- `docs/monétisation/ui/lighthouse-u4-desktop.json`

### Mobile final

| Métrique | Résultat | Seuil U4 |
|---|---:|---:|
| Performance | **66** | >= 90 |
| Accessibilité | **93** | >= 90 |
| CLS | **0,0022** | < 0,1 |
| LCP | 3,0 s | indicatif |
| TBT | 1 682 ms | indicatif |

Le point bloquant est le **Total Blocking Time**. Le réseau n'est plus le principal problème après
la réduction du logo ; la page reste pénalisée par l'exécution JavaScript et le travail du thread
principal.

### Desktop

Le passage desktop est conforme : Performance 100, Accessibilité 93, CLS 0,007.

---

## 4. Checklist d'acceptation

| Item | État | Preuve |
|---|---:|---|
| `4900` / `19900` absents | ✅ | `check:ui-tarifs` |
| `4 900` / `19 900` absents | ✅ | `check:ui-tarifs` |
| CinetPay / Paydunya / Fedapay absents de l'UI | ✅ | `check:ui-tarifs` |
| PawaPay non affichable côté utilisateur | ✅ | `check:ui-tarifs` ; occurrences restantes limitées aux routes/API et client serveur |
| Aucun montant en dur dans les composants tarifs | ✅ | `check:ui-tarifs` avec témoin fautif |
| Exactement 3 cartes tarifaires | ✅ | `check-rendu-tarifs.cjs` |
| Sélecteur 1 / 6 / 12 mois fonctionnel | ✅ | `check-selecteur-duree.cjs` |
| Prix barré = prorata simple | ✅ | idem |
| Aucune remise affichée > 25 % | ✅ | idem |
| Quotas 100 / 1 000 visibles | ✅ | `check-rendu-tarifs.cjs` |
| Coûts 30 FCFA / 5 FCFA visibles | ✅ | `check-rendu-tarifs.cjs` |
| Badge recommandé uniquement sur ONG | ✅ | 1 occurrence mesurée |
| Aucune carte de distribution sur `/tarifs` | ✅ | bandeau + grille repliée |
| Nombres au format `3 000 FCFA` | ✅ | rendu serveur + sélecteur |
| Mention Mobile Money sous CTA payants | ✅ | 4 mentions `sans carte bancaire` mesurées |
| Pas de reconduction automatique affirmée | ✅ | `check:ui-tarifs` |
| Matrice N5 | ✅ | lignes non développées retirées en U1 |
| Pas de `Chargement des formules…` | ✅ | HTML serveur mesuré |
| Champ paiement téléphone +226 | ⚠️ | Hors écran dédié : le flux actuel utilise la page hébergée Mobile Money |
| Écran d'attente PIN | ⚠️ | Non implémenté : déjà identifié comme reste U2 |
| Succès uniquement après serveur | ✅ | `check:topup`, webhook/check idempotents |
| Rendu 360 / 1440 sans débordement | ✅ | couvert par les contrôles U1 ; pas de régression observée |
| Lighthouse mobile Performance >= 90 | ❌ | 66 final |
| Lighthouse mobile Accessibilité >= 90 | ✅ | 93 |
| CLS < 0,1 | ✅ | 0,0022 |
| Test non-contournement filigrane | ✅ | `check:watermark` : 14 / 14 |

---

## 5. Commandes exécutées

```text
npm run typecheck -- --pretty false
npm run build
npm run check:ui-tarifs
node tools/tarifs-check/check-rendu-tarifs.cjs
npm run check:ui-tarifs:selecteur
npm run check:watermark
npm run check:participant
npm run check:topup
npx --yes lighthouse@latest http://localhost:3300/tarifs --only-categories=performance,accessibility ...
```

---

## 6. Point ouvert

Pour atteindre Performance >= 90 en mobile, il faudra une passe dédiée sur le JavaScript initial :

- sortir davantage de `/tarifs` du périmètre client ;
- isoler les boutons de paiement pour ne charger la session/backend qu'au clic ou après connexion ;
- envisager un header public sans tiroir hydraté tant que le menu n'est pas ouvert ;
- vérifier si les polices globales de l'éditeur doivent vraiment être chargées sur les pages
  publiques.

Je ne marque donc pas U4 comme validée. Elle est documentée, mesurée, et le blocage restant est clair.
