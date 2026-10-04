# Campagnes × Twibbonize — kit Antigravity

Contenu de ce dossier, à déposer dans le dépôt Campagnes.
**Base tarifaire : grille à 3 offres** (Gratuit · Créateur 3 000 · Organisations & ONG 5 000 FCFA).

## 1. Prompts — à exécuter dans cet ordre

### 1.0 Refonte de l'interface tarifs — **à faire en premier**

`PROMPT-UI-TARIFS.md`

Corrige la page publique `campagnes-nu.vercel.app/tarifs` (qui affiche encore 4 900 / 19 900 FCFA)
et toutes les surfaces qui affichent un prix. Paiement en **mobile money (PawaPay)**.
Source de vérité : `references/grille-tarifaire.md`.

### 1.1 Prompt maître — modèle de monétisation complet

`PROMPT-ANTIGRAVITY.md`

À copier-coller dans le chat de l'agent. Il contient le contexte, la grille tarifaire complète,
les huit invariants, et le découpage en six phases avec un point d'arrêt (`GATE`) à chaque phase.

**Ordre d'exécution : ne pas lancer toutes les phases d'un coup.** Chaque `GATE` attend votre validation.

| Phase | Contenu | Sortie |
|---|---|---|
| 0 | Audit du code existant, aucune modification | `docs/audit-monetisation.md` |
| 1 | Source de vérité tarifaire + correction des montants obsolètes | `src/lib/pricing/config.ts` + page `/tarifs` refactorisée |
| 2 | Compteur de distribution + moteur de filigrane côté serveur | route d'export + tests de non-contournement |
| 3 | Paywall et micro-paiement mobile money | modale + passerelle + webhook + bandeau quota |
| 4 | Packs Propre et Sponsor | checkout à deux étages + logo + rapport |
| 5 | Mesure et itération | tableau de bord du tunnel + 2 tests A/B |

## 2. Skill — pour les tâches courantes

```
skills/monetisation-campagnes/SKILL.md
skills/monetisation-campagnes/references/grille-tarifaire.md
```

**Emplacement** : à la racine du dépôt dans `.agent/skills/` ou `.agents/skills/` (workspace),
ou dans `~/.gemini/antigravity/skills/` (global). À confirmer selon votre version d'Antigravity.

Le skill est chargé à la demande : l'agent voit son nom et sa description, et ne lit le contenu que
si la tâche correspond. La grille tarifaire détaillée est dans `references/` — elle n'est lue que si
l'agent en a besoin.

> **Note** : les *Workflows* Antigravity sont dépréciés au 1er novembre 2026 au profit des
> *Agent Skills*. Ce kit utilise donc le format Skill, pas le format Workflow.

## 3. Rule — toujours active

```
.agents/rules/monetisation-campagnes.md
```

Règle `always_on` : les huit invariants sont injectés dans le contexte à chaque tour, sur tout le
dépôt. Elle empêche l'agent de casser le modèle (composition côté client, prix en dur, scripts pub,
blocage à l'épuisement du quota).

Si votre version utilise encore l'ancien chemin, renommer en `.agent/rules/monetisation-campagnes.md`.

## 4. Les huit invariants en résumé

| # | Invariant |
|---|---|
| N1 | Filigrane appliqué côté serveur, toujours |
| N2 | Un seul point de vérité pour le compteur et le filigrane |
| N3 | Aucun prix en dur hors du fichier de config |
| N4 | Aucun paiement confirmé sans webhook serveur |
| N5 | Aucune fonctionnalité affichée si non développée |
| N6 | Aucun script publicitaire, aucune régie display |
| N7 | Filigrane visible dès l'aperçu d'édition |
| N8 | WhatsApp d'abord dans les boutons de partage |

## 5. La grille en un coup d'œil

| | Gratuit | Créateur | Organisations & ONG |
|---|---|---|---|
| Prix | 0 FCFA | 3 000 FCFA/mois | 5 000 FCFA/mois |
| Distributions incluses | 25 à vie | 100 / mois | 1 000 / mois |
| Coût par participant | — | 30 FCFA | **5 FCFA** |
| 6 mois *(1 mois offert)* | — | 15 000 *(barré 18 000)* | 25 000 *(barré 30 000)* |
| 12 mois *(3 mois offerts)* | — | 27 000 *(barré 36 000)* | 45 000 *(barré 60 000)* |

Packs de distribution : 100 → 2 500 · 500 → 5 000 · 1 000 → 7 500 · 5 000 → 20 000 · 10 000+ sur devis.
Participant : 500 FCFA / 24 h, sans compte.

**Paiement : PawaPay (mobile money).** XOF · pays BFA · montants entiers · `ORANGE_BFA` / `MOOV_BFA`.
Libellé public « Mobile Money » — jamais « PawaPay » dans l'UI. Pas de carte bancaire.

## 6. Corrections à appliquer sur le site public

La page `campagnes-nu.vercel.app/tarifs` affiche des montants qui ne sont plus la référence.
La Phase 1 les corrige :

| Affiché en ligne | À corriger en |
|---|---|
| 4 900 FCFA *(Créateur)* | **3 000 FCFA** |
| 19 900 FCFA *(Organisations)* | **5 000 FCFA** + bloc « Sur devis » entreprise sans prix |
| Aucune mention de quota | Afficher « 100 / 1 000 distributions incluses par mois » |

Les montants 4 900 / 19 900 doivent disparaître du dépôt. La checklist « avant de committer »
de la rule les vérifie explicitement.
