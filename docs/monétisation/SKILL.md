---
name: monetisation-campagnes
description: >
  Implémente ou modifie la monétisation de Campagnes (Next.js, FCFA, UEMOA) : grille tarifaire à trois
  offres, quotas de distribution mensuels, crédits de participation, filigrane à trois états, paywall au
  téléchargement, micro-paiement mobile money. À utiliser dès qu'une tâche touche aux abonnements, aux
  prix, au filigrane, aux quotas d'export ou au tunnel de paiement participant.
---

# Monétisation Campagnes

Application Next.js (App Router) sur Vercel. Marché Afrique francophone. Devise **FCFA (XOF)**.
Le modèle cible est celui de Twibbonize adapté : **le paywall se déclenche à l'export, jamais à l'entrée.**

## Règle d'or

> Le filigrane n'est pas une pénalité. C'est un actif à trois états :
> **gratuit (croissance) · retiré contre 500 FCFA (participant) · remplacé par un logo (sponsor).**

## Invariants à respecter systématiquement

| # | Invariant |
|---|-----------|
| N1 | Le filigrane est appliqué **côté serveur**. Aucun actif non filigrané servi sans paiement validé serveur. |
| N2 | **Un seul** point de vérité pour le compteur de distribution et le filigrane : la route d'export. |
| N3 | Aucun prix en dur dans un composant. Tout vient de `src/lib/pricing/config.ts`. |
| N4 | Aucun paiement affiché comme confirmé sans webhook serveur validé. |
| N5 | Aucune fonctionnalité affichée si elle n'est pas développée. |
| N6 | **Aucune régie publicitaire, aucun script pub tiers.** La monétisation d'audience passe par le Pack Sponsor. |
| N7 | Le filigrane est visible **dès l'aperçu d'édition**, pas seulement à l'export. |
| N8 | Le partage privilégie **WhatsApp**, puis Facebook. Jamais Twitter/X en premier. |

## Grille tarifaire

Voir `@[Grille tarifaire](references/grille-tarifaire.md)` pour les montants complets et la
segmentation détaillée. **Ne jamais inventer un montant : lire ce fichier.**

Résumé :

- **3 offres** : Gratuit 0 · Créateur **3 000** · Organisations & ONG **5 000** (FCFA/mois)
- **Quotas inclus** : Créateur **100** / mois · ONG **1 000** / mois · Gratuit **25 à vie par compte**
- **Durées** : 1 / 6 / 12 mois — « 1 mois offert » puis « 3 mois offerts ». **Remise ≤ 25 %.**
- **Distribution** : 100 → 2 500 · 500 → 5 000 · 1 000 → 7 500 · 5 000 → 20 000 · 10 000+ sur devis
- **Pack Propre** : +1 000 / +2 500 / +4 000 / +15 000 FCFA
- **Pack Sponsor** : +2 000 / +5 000 / +8 000 / +30 000 FCFA (plancher de facturation 50 000)
- **Participant** : 500 FCFA / 24 h, sans compte, mobile money
- **Pas de 4ᵉ offre publiée** : palier entreprise en « Sur devis », sans prix

## Décisions figées

1. Une utilisation = **un export réussi** (pas un upload, pas une vue, pas un clic).
2. **Crédits achetés : permanents et reportables.** **Quota inclus : mensuel, non reporté.**
   Cette asymétrie est ce qui rend les packs défendables face à l'abonnement. Ne pas l'aplatir.
3. Les durées s'appliquent **aux abonnements uniquement**, jamais à la distribution.
4. **Pas de reconduction automatique** : les durées sont des prépaiements, avec relance J−7.
5. Quota Gratuit : **25 exports filigranés, à vie, par compte** (pas par campagne).
6. **Dégradation douce** à l'épuisement du quota : jamais de blocage, retour du filigrane + paywall participant.
7. Passerelles : **CinetPay / Paydunya / Fedapay**. Pas de Stripe en passerelle principale.

## Procédure

### Ajouter ou modifier un prix

1. Modifier `src/lib/pricing/config.ts`.
2. Vérifier qu'aucun composant ne contient de montant en dur : `grep -rn "FCFA\|3000\|5000\|2500\|4900\|19900" src/components`.
3. Vérifier que la page `/tarifs` reflète la config sans décalage, et qu'il n'y a **que 3 cartes**.
4. Mettre à jour `references/grille-tarifaire.md` si le référentiel change.

### Toucher au filigrane ou à l'export

1. Confirmer que la composition reste **côté serveur**.
2. Confirmer que le compteur de distribution est incrémenté **au même endroit** (N2).
3. Exécuter le test de non-contournement : appel direct à l'API sans paiement → image filigranée.
4. Vérifier les trois états : `Campagnes` · retiré (payé) · logo sponsor.
5. Vérifier l'ordre de consommation : quota inclus d'abord, crédits achetés ensuite.

### Toucher au quota

1. Jamais de blocage : dégradation douce obligatoire.
2. Vérifier que le quota inclus est remis à zéro mensuellement **sans** toucher aux crédits achetés.
3. Vérifier que le quota Gratuit est compté **par compte**, pas par campagne.

### Toucher au tunnel participant

Séquence attendue, à ne pas réorganiser :

```
campagne → upload (sans compte) → détourage → édition libre (filigrane visible)
  → clic Télécharger → modale → export
```

Le compte n'est **jamais** demandé avant l'export.

## Événements à instrumenter

```
campaign_view → upload_start → upload_success → editor_open → download_click
→ paywall_shown → paywall_choice → payment_initiated → payment_success
→ export_served → share_click
+ quota_exhausted_shown · upgrade_from_participant_fees
```

KPI central : `paywall_shown → payment_success`.

## Ce qu'il ne faut jamais faire

- Ajouter un script publicitaire ou une régie display.
- Afficher une remise supérieure à −25 %.
- Implémenter une reconduction automatique.
- Déplacer la composition d'image côté client.
- Bloquer un export à l'épuisement du quota.
- Remettre à zéro les crédits achetés.
- Publier une 4ᵉ carte tarifaire avec un prix.
- Présenter une fonctionnalité non développée comme disponible.
- Modifier un montant de la grille sans validation explicite du responsable produit.

## Différences assumées avec Twibbonize

Copier : paywall à l'export, éditeur gratuit complet, micro-paiement sans compte, modules premium
verrouillés mais visibles, angle mort volontaire comme escalier d'upsell.

Ne **pas** copier : la ferme à publicités (200+ requêtes/page, incompatible avec le coût de la data
mobile en UEMOA), les fausses remises de 87 %, le refus systématique de remboursement, la suppression
des analytics à l'expiration.

Spécifique à Campagnes : le **troisième état du filigrane** (logo sponsor) et le **compteur
« ce que vos participants ont payé »** comme levier d'upsell vers l'abonnement.
