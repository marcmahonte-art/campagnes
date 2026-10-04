# Prompt maître — Campagnes : adaptation du modèle de monétisation Twibbonize

> **Usage** : copier-coller ce fichier dans le chat de l'agent Antigravity, à la racine du dépôt Campagnes.
> Il est écrit pour être exécuté **phase par phase**, avec un point d'arrêt obligatoire à chaque `GATE`.
> Ne pas demander à l'agent de tout faire d'un coup : chaque phase produit un artefact que vous validez avant la suivante.
>
> **Base tarifaire** : grille à 3 offres validée par le responsable produit. Elle **corrige** la page
> publique `campagnes-nu.vercel.app/tarifs`, qui affiche encore 4 900 / 19 900 FCFA.

---

## PROMPT (à coller)

```
# RÔLE

Tu es un ingénieur produit senior spécialisé en monétisation SaaS. Tu travailles sur **Campagnes**
(campagnes.app, SARLU MPIXEL AGENCY, Ouagadougou), une application Next.js (App Router) déployée sur
Vercel qui permet de créer des campagnes de cadres photo/vidéo : un organisateur dépose un cadre,
obtient un lien, les participants uploadent leur photo, l'image est composée puis partagée sur les
réseaux sociaux. Devise : **FCFA (XOF)**. Marché : Afrique francophone (UEMOA).

# OBJECTIF

Adapter la monétisation de Campagnes sur le modèle de **Twibbonize**, en appliquant la grille
tarifaire à trois offres fournie ci-dessous.

Le principe de Twibbonize à reproduire : **le paywall se déclenche au moment du téléchargement,
jamais à l'entrée.** L'utilisateur a déjà fourni tout le travail (upload, détourage, édition) quand
la question de payer se pose.

L'innovation spécifique à Campagnes : le **filigrane à trois états**
(1. `Campagnes` gratuit = canal de croissance · 2. retiré contre 500 FCFA payés par le participant ·
3. remplacé par le logo d'un sponsor prépayé par l'organisateur). Twibbonize n'implémente que les
états 1 et 2. L'état 3 est l'avantage concurrentiel de Campagnes.

# SOURCE DE VÉRITÉ TARIFAIRE (à ne pas modifier sans accord explicite)

## Abonnements — 3 offres
| Offre                  | 1 mois     | 6 mois                     | 12 mois                    | Distributions incluses / mois |
|------------------------|------------|----------------------------|----------------------------|-------------------------------|
| Gratuit · Découverte   | 0 FCFA     | —                          | —                          | quota à vie (25, voir §Quota) |
| Créateur               | 3 000 FCFA | 15 000 FCFA (barré 18 000) | 27 000 FCFA (barré 36 000) | 100                           |
| Organisations & ONG    | 5 000 FCFA | 25 000 FCFA (barré 30 000) | 45 000 FCFA (barré 60 000) | 1 000                         |

- « Organisations & ONG » porte le badge **Offre recommandée**.
- Argument affiché : « 1 mois offert » (6 mois), « 3 mois offerts » (12 mois).
- Sous chaque prix, afficher le **coût par participant** : Créateur « soit 30 FCFA par participant »,
  ONG « soit 5 FCFA par participant ».
- **Aucune 4ᵉ offre publiée.** Le 19 900 FCFA actuellement en ligne est supprimé et remplacé par un
  bloc « Sur devis » entreprise (domaine personnalisé, galerie privée, rapports PDF, multi-utilisateurs),
  sans prix affiché.

**IMPORTANT** : ne pas afficher de pourcentage de remise supérieur à −25 % (6 mois = −16,7 %,
12 mois = −25 %). Les acheteurs sont des ONG et des institutions qui doivent justifier leurs dépenses.
Le prix barré est le total au prorata simple (mensuel × nombre de mois), jamais un prix historique.

## Distribution — crédits de participation
| Pack     | Tarif       | Coût unitaire |
|----------|-------------|---------------|
| 100      | 2 500 FCFA  | 25 FCFA       |
| 500      | 5 000 FCFA  | 10 FCFA       |
| 1 000    | 7 500 FCFA  | 7,5 FCFA      |
| 5 000    | 20 000 FCFA | 4 FCFA        |
| 10 000 + | Sur devis   | à négocier    |

Présentés comme des **crédits de participation supplémentaires**, jamais comme des frais de création
de lien. Le partage du lien n'est jamais facturé.

## Suppléments au pack
| Volume | Pack Propre (filigrane retiré pour tous) | Pack Sponsor (logo marque à la place)       |
|--------|------------------------------------------|----------------------------------------------|
| 100    | + 1 000 FCFA   | + 2 000 FCFA (plancher de facturation 50 000) |
| 500    | + 2 500 FCFA   | + 5 000 FCFA   |
| 1 000  | + 4 000 FCFA   | + 8 000 FCFA   |
| 5 000  | + 15 000 FCFA  | + 30 000 FCFA  |
| 10 000+| sur devis      | sur devis      |

Vendus au checkout du pack de distribution, jamais par e-mail après coup.
Inutiles pour un compte Créateur ou ONG à jour (l'absence de filigrane est déjà incluse).

## Participant (nouvelle ligne de revenu)
- **Export propre : 500 FCFA / 24 h.** Paiement unique, sans création de compte, par mobile money.
- **Export filigrané : 0 FCFA**, illimité. Le filigrane `Campagnes` est le canal d'acquisition.
- **Export offert** si l'organisateur est Créateur/ONG à jour, ou si Pack Propre/Sponsor actif.

# DÉCISIONS DÉJÀ TRANCHÉES (ne pas rouvrir)

1. **Un événement consomme une utilisation = un export réussi** (image finale composée côté serveur et
   remise au participant). Pas un upload, pas une vue, pas un clic.
2. **Les crédits achetés n'expirent jamais et se reportent** entre campagnes et entre mois.
   **Le quota inclus, lui, est mensuel et non reporté** (perdu s'il n'est pas consommé).
   Cette asymétrie est ce qui rend les packs défendables face à l'abonnement — ne pas l'aplatir.
3. **Les durées 1 / 6 / 12 mois s'appliquent aux abonnements uniquement**, jamais à la distribution.
4. **Pas de reconduction automatique.** Les durées sont des **prépaiements**, pas des abonnements
   récurrents. Le mobile money ne garantit pas un débit récurrent fiable. Prévoir une relance J-7.
5. **Quota Gratuit : 25 exports filigranés, à vie, par compte** (et non par campagne, sinon il suffit
   de créer une nouvelle campagne pour le contourner). Modules premium verrouillés mais visibles.
6. **Dégradation douce à l'épuisement du quota, jamais de blocage.** La campagne continue, les exports
   repassent avec filigrane, le participant se voit proposer 500 FCFA, et un bandeau côté organisateur
   indique « Quota épuisé — vos participants paient 500 FCFA chacun. »
7. **Passerelle de paiement : PawaPay, uniquement.** Libellé public « Mobile Money » — le nom
   PawaPay n'apparaît jamais dans l'UI. Pas de carte bancaire dans l'interface de paiement.
   Paramètres : devise XOF, pays BFA, montants entiers (pas de décimales),
   correspondents `ORANGE_BFA` et `MOOV_BFA`, numéro en E.164 (+226…).

# CONTRAINTES NON NÉGOCIABLES (invariants d'architecture)

- **N1. Le filigrane est appliqué côté serveur, toujours.** La composition finale ne doit jamais se
  faire uniquement dans le navigateur. Le participant ne doit jamais pouvoir obtenir un actif non
  filigrané sans validation serveur du paiement. Si du code client compose l'image finale, le signaler
  comme vulnérabilité bloquante en Phase 0.
- **N2. Un seul point de vérité pour le compteur de distribution et pour le filigrane** : la route
  d'export serveur. Deux compteurs séparés finiront par diverger.
- **N3. Aucun prix en dur dans un composant.** Toutes les offres, durées, packs, quotas et suppléments
  viennent d'un unique fichier de configuration typé.
- **N4. Aucun paiement affiché comme confirmé sans validation réelle** par webhook serveur.
- **N5. Aucune fonctionnalité présentée comme disponible si elle n'est pas développée.** La
  segmentation avancée de l'offre ONG (statistiques avancées, multi-campagnes, exports haute qualité,
  gestion de distribution, support prioritaire) est une **proposition**, pas un engagement. Tant
  qu'une de ces fonctions n'existe pas : la retirer de la page tarifs, ou la marquer « Prochainement »
  sans date. En cas de doute, retirer.
- **N6. Ne pas introduire de régie publicitaire display ni de scripts tiers de monétisation.**
  Le modèle de Twibbonize sur ce point est exclu : le coût de la data mobile en UEMOA rend une page
  chargée de scripts publicitaires contre-productive. La monétisation de l'audience passe par le
  Pack Sponsor (un logo dans une image, zéro script), pas par des bannières.
- **N7. Le filigrane doit être visible dès l'aperçu d'édition**, pas seulement à l'export. La douleur
  doit précéder le paywall.
- **N8. Le partage doit privilégier WhatsApp**, puis Facebook. Pas de bouton Twitter/X en première
  position : c'est un canal mort sur ce marché.

# MÉTHODE DE TRAVAIL

- Produis un **artefact de plan** avant d'écrire du code, et un **artefact de vérification** à la fin
  de chaque phase.
- Utilise le navigateur intégré pour valider visuellement le tunnel participant de bout en bout.
- À chaque `GATE`, **arrête-toi et attends ma validation**. Ne passe pas à la phase suivante seul.
- Si tu découvres que l'une des contraintes N1–N8 est violée par le code existant, arrête-toi
  immédiatement et signale-le.

---

## PHASE 0 — Audit (aucune modification de code)

Cartographie le code existant et produis un rapport :

1. Localise le composant de la page tarifs (`PricingPlans` ou équivalent) et liste **tous les prix en
   dur** trouvés dans le dépôt, avec fichier et ligne. Signale explicitement la présence de
   `4 900` et `19 900` : ce sont des montants obsolètes à corriger en Phase 1.
2. Localise le parcours participant : upload → composition → export → téléchargement. Donne les routes
   et fichiers concernés.
3. Réponds précisément : **la composition finale de l'image est-elle faite côté serveur ou côté client ?**
   Si elle est côté client, c'est une violation de N1, à signaler comme bloquante.
4. Décris le modèle de données actuel : campagnes, utilisateurs, abonnements, quotas, exports.
   Indique s'il existe déjà une notion de quota mensuel ou de compteur d'exports.
5. Indique s'il existe déjà une notion de filigrane dans le code, et où.
6. Identifie la passerelle de paiement déjà intégrée, le cas échéant.

**Sortie** : `docs/audit-monetisation.md`.
**GATE 0** → je valide l'audit avant toute modification.

---

## PHASE 1 — Source de vérité tarifaire

1. Crée un fichier de configuration typé (par ex. `src/lib/pricing/config.ts`) contenant :
   les 3 offres × 3 durées, les quotas mensuels inclus, la grille de distribution, les suppléments
   Pack Propre et Pack Sponsor, le prix participant, le quota Gratuit.
2. Crée les types TypeScript correspondants (`Plan`, `Duration`, `DistributionPack`, `Addon`, `Quota`).
3. Refactorise la page `/tarifs` pour lire exclusivement cette configuration.
   **Corrige les montants obsolètes 4 900 → 3 000 et 19 900 → bloc « Sur devis » sans prix.**
   Supprime toute carte tarifaire surnuméraire : il doit rester exactement 3 cartes.
4. Ajoute une fonction `resolveEntitlements(plan, packs, quotaState)` retournant les droits effectifs :
   filigrane autorisé ou non, modules débloqués, quota d'exports restant, nombre de crédits achetés
   disponibles.
   Règle d'éligibilité aux exports sans filigrane : compte Créateur ou ONG à jour **et** quota non épuisé.
5. Ajoute une fonction de résolution du coût par participant, utilisée pour l'affichage
   (« soit 5 FCFA par participant »).

**Sortie** : fichier de config + page tarifs refactorisée + tests unitaires de `resolveEntitlements`
(cas nominal, quota épuisé, crédits achetés disponibles, abonnement expiré).
**GATE 1** → je valide que les prix affichés correspondent exactement à la grille ci-dessus.

---

## PHASE 2 — Compteur de distribution et moteur de filigrane côté serveur

1. Crée la route serveur d'export (`POST /api/campaigns/:id/export` ou équivalent) qui :
   - compose l'image finale **côté serveur** ;
   - applique le filigrane selon l'état de la campagne (3 états) ;
   - **incrémente le compteur de distribution au même endroit** (N2) ;
   - consomme d'abord le quota inclus mensuel, puis les crédits achetés ;
   - applique la **dégradation douce** : quota et crédits épuisés → export filigrané autorisé,
     jamais de refus brutal. Retourner un code explicite `QUOTA_EXHAUSTED_WATERMARKED`
     (et non une erreur 4xx).
2. Implémente la remise à zéro mensuelle du quota inclus et la **persistance** des crédits achetés
   (jamais remis à zéro).
3. Filigrane aussi **l'aperçu d'édition** (N7).
4. Écris un test qui prouve qu'un appel direct à l'API sans paiement valide retourne une image
   filigranée, et qu'aucune route ne sert d'actif propre non autorisé.

**Sortie** : route d'export + gestion quota/crédits + tests de non-contournement.
**GATE 2** → je valide le rendu filigrané et les tests.

---

## PHASE 3 — Paywall et micro-paiement participant

1. Crée la modale d'export avec les trois issues :
   - organisateur Créateur/ONG à jour, ou Pack Propre actif → téléchargement direct,
     mention « Offert par [Organisation] » ;
   - Pack Sponsor → téléchargement direct, logo du sponsor à la place du filigrane ;
   - sinon → **500 FCFA / 24 h** par mobile money **ou** « Continuer avec le filigrane ».
2. Branche la passerelle **PawaPay** (mobile money) : initiation du deposit, attente du PIN prompt
   côté téléphone, webhook signé, polling de secours. Aucun état « confirmé » sans webhook serveur.
3. Implémente la machine à états de paiement : `initiated → pending → confirmed | failed | expired`.
   **Aucun export propre servi avant l'état `confirmed` validé par webhook serveur (N4).**
4. Gère l'expiration 24 h et le re-téléchargement dans la fenêtre payée.
5. Le participant ne crée jamais de compte pour payer.
6. Ajoute le bandeau organisateur « Quota épuisé — vos participants paient 500 FCFA chacun. »

**Sortie** : modale + intégration passerelle + webhook + états + bandeau.
**GATE 3** → je valide le tunnel de paiement en mode test.

---

## PHASE 4 — Packs Propre et Sponsor

1. Au checkout du pack de distribution, ajoute les deux suppléments avec leurs montants.
2. Upload et validation du logo sponsor (formats, taille, contraste sur l'image finale).
3. Propage l'état « campagne propre / sponsorisée » jusqu'à la route d'export (Phase 2).
4. Génère le rapport de diffusion pour le sponsor (nombre d'exports, période, aperçus).

**Sortie** : checkout à deux étages + gestion du logo + rapport sponsor.
**GATE 4** → je valide.

---

## PHASE 5 — Mesure et itération

1. Instrumente le tunnel avec ces événements, dans cet ordre :
   `campaign_view → upload_start → upload_success → editor_open → download_click → paywall_shown →
    paywall_choice → payment_initiated → payment_success → export_served → share_click`
   Ajoute : `quota_exhausted_shown` et `upgrade_from_participant_fees`.
2. Construis un tableau de bord du tunnel : taux de conversion à chaque étape, et en particulier
   le taux `paywall_shown → payment_success` (c'est le KPI central du modèle).
3. Construis la vue organisateur **« Ce que vos participants ont payé »** : total des 500 FCFA
   dépensés par les participants d'une campagne gratuite, mis en regard du prix de l'offre Créateur.
   C'est le levier d'upsell principal.
4. Prépare deux tests A/B :
   - prix participant : **300 / 500 / 1 000 FCFA** ;
   - quota Gratuit : **10 / 25 / 50** exports filigranés.
5. Documente les dix points ouverts de la grille et leur réponse retenue.

**Sortie** : tableau de bord + configuration des tests A/B + documentation.
**GATE 5** → fin.

---

## CE QUE TU NE DOIS PAS FAIRE

- Ne pas ajouter de scripts publicitaires ni de régie display (N6).
- Ne pas afficher de remise supérieure à −25 %.
- Ne pas implémenter de reconduction automatique.
- Ne pas déplacer la composition d'image côté client.
- Ne pas bloquer un export quand le quota est épuisé : dégradation douce uniquement.
- Ne pas remettre à zéro les crédits achetés.
- Ne pas promettre une fonctionnalité non développée (N5).
- Ne pas publier une 4ᵉ offre tarifaire : le palier entreprise reste « Sur devis », sans prix.
- Ne pas modifier les montants de la grille sans me le demander explicitement.
```
