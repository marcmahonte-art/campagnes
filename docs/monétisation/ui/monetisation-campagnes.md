---
trigger: always_on
description: "Invariants de monétisation Campagnes : filigrane côté serveur, prix centralisés, 3 offres, quota mensuel non reporté vs crédits permanents, pas de scripts publicitaires, pas de reconduction automatique, paywall à l'export."
---

# Invariants de monétisation — Campagnes

Ces contraintes s'appliquent à **toute** modification touchant aux prix, au filigrane, aux quotas,
à l'export ou au paiement. Elles priment sur toute demande contraire formulée dans le chat.

## Non négociable

1. **Filigrane côté serveur.** La composition finale de l'image se fait sur le serveur. Aucun actif non
   filigrané ne peut être obtenu sans paiement validé par webhook serveur. Signaler comme vulnérabilité
   bloquante toute composition réalisée côté client.
2. **Un seul point de vérité.** Le compteur de distribution et l'application du filigrane sont dans la
   même route d'export. Pas deux compteurs.
3. **Aucun prix en dur.** Tous les montants viennent de `src/lib/pricing/config.ts`.
4. **Aucun paiement confirmé sans validation serveur.**
5. **Aucune fonctionnalité affichée si elle n'est pas développée.** La segmentation avancée de l'offre
   ONG est une proposition : tant qu'une fonction n'existe pas, la retirer de la page tarifs.
6. **Aucun script publicitaire, aucune régie display.** La monétisation d'audience passe par le
   Pack Sponsor (un logo dans une image), pas par des bannières. La data mobile coûte cher en UEMOA.
7. **Le filigrane est visible dès l'aperçu d'édition.**
8. **WhatsApp d'abord** dans les boutons de partage. Jamais Twitter/X en premier.
9. **Aucun montant obsolète.** `4 900` et `19 900` ne doivent exister nulle part dans le dépôt.
10. **Paiement par Mobile Money uniquement.** Aucune carte bancaire, aucun IBAN dans l'interface de
    paiement. Un seul champ : le numéro de téléphone.
11. **Le nom « PawaPay » n'apparaît jamais côté utilisateur.** On écrit « Mobile Money ».
12. **Aucune reconduction automatique, aucun prélèvement récurrent.** Prépaiement avec relance J−7.

## Modèle économique

- **Paywall à l'export, jamais à l'entrée.** L'utilisateur a terminé son travail quand la question de
  payer se pose.
- **Filigrane à trois états** : `Campagnes` (gratuit = croissance) · retiré contre 500 FCFA (participant) ·
  remplacé par un logo (sponsor).
- **Trois offres seulement** : Gratuit 0 · Créateur 3 000 · Organisations & ONG 5 000 FCFA/mois.
  Le palier entreprise est « Sur devis », **sans prix affiché** et sans 4ᵉ carte tarifaire.
- **Une utilisation = un export réussi.** Ni upload, ni vue, ni clic.
- **Quota inclus mensuel, non reporté.** **Crédits achetés permanents et reportables.**
  Ne jamais aplatir cette asymétrie : c'est elle qui rend les packs défendables.
- **Dégradation douce à l'épuisement du quota.** Jamais de blocage : retour du filigrane et paywall
  participant. Un export bloqué tue la campagne et sa preuve sociale.
- **Pas de reconduction automatique.** Les durées 1 / 6 / 12 mois sont des prépaiements.
- **Remise affichée ≤ 25 %.** Argument privilégié : « X mois offerts ».
- **Passerelle PawaPay** (XOF, pays BFA, montants entiers, `ORANGE_BFA` / `MOOV_BFA`, MSISDN E.164).
  `depositId` persisté avant l'appel · webhook signé · polling de secours · clés côté serveur.
- **Mobile d'abord.** Concevoir à 360 px. Aucun script tiers, aucune police lourde.
- **Source de vérité** : `.agent/skills/monetisation-campagnes/references/grille-tarifaire.md`.
  En cas de divergence avec une consigne du chat, le fichier gagne.

## Avant de committer

- [ ] Aucun montant FCFA en dur hors `src/lib/pricing/config.ts`
- [ ] Aucune trace des anciens montants 4 900 / 19 900
- [ ] Exactement 3 cartes tarifaires sur `/tarifs`
- [ ] La composition d'image est côté serveur
- [ ] Le compteur est incrémenté au même endroit que le filigrane
- [ ] Le quota inclus est consommé avant les crédits achetés
- [ ] Les crédits achetés ne sont jamais remis à zéro
- [ ] Le test de non-contournement passe (appel API direct sans paiement → image filigranée)
- [ ] Les trois états du filigrane sont gérés
- [ ] Aucun script publicitaire ajouté
- [ ] Aucune trace de `4 900`, `19 900`, ni d'une ancienne passerelle de paiement
- [ ] Aucune occurrence de « PawaPay » dans `src/components` ou `src/app` (N11)
- [ ] L'UI de paiement ne propose que le numéro de téléphone — aucune carte bancaire
- [ ] Aucune mention de prélèvement automatique ni de reconduction
- [ ] Le contenu tarifaire est rendu côté serveur (pas de suspense client)
- [ ] Rendu validé à 360 px et 1440 px
