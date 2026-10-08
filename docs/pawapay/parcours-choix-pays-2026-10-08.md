# Choix du pays avant paiement — 2026-10-08

## Objectif

Le pays n'était pas demandé : la route d'initiation retombait sur `BFA` et une
devise figée `XOF`. Un acheteur ivoirien ou sénégalais partait donc sur le
corridor burkinabè, où son numéro Mobile Money n'existe pas — l'échec
remontait comme un refus d'opérateur, c'est-à-dire comme une faute de
l'utilisateur.

Le pays est désormais **demandé, jamais deviné**, dans un modal blanc affiché
avant l'ouverture de la page de paiement.

## Flux final

```
CAMPAGNES — « Payer maintenant »
        ↓
MODAL BLANC — « Où souhaitez-vous payer ? »
   🇧🇯 Bénin · 🇧🇫 Burkina Faso · 🇨🇮 Côte d'Ivoire · 🇸🇳 Sénégal
        ↓  sélection (bouton désactivé tant que rien n'est choisi)
« Continuer vers le paiement → »
        ↓
MODAL — « Préparation de votre paiement… »
        ↓  POST /api/payments/pawapay/initiate  { plan|packId, duration?, country }
        ↓
PAWAPAY — page de paiement hébergée (Mobile Money)
        ↓
Retour Campagnes → /api/payments/pawapay/check → webhook → activation
```

En cas d'échec d'initiation, le modal reste ouvert et affiche
« Impossible de préparer le paiement. » avec **Réessayer** / **Annuler**.

## Fichiers

| Fichier | Statut | Contenu |
|---|---|---|
| `components/payments/country-picker-modal.tsx` | créé | Le modal : sélection, préparation, échec |
| `components/billing/checkout-page.tsx` | modifié | Le bouton « Payer maintenant » ouvre le modal ; le sélecteur pays en ligne est retiré |
| `components/campaign/topup-button.tsx` | modifié | Même étape ajoutée au parcours de recharge ciblée |
| `lib/payments/corridors.ts` | modifié | Drapeaux ajoutés (`flag`) — Ghana, Nigéria, Sierra Leone en étaient privés, ce qui cassait la compilation |
| `tools/payments-check/check-countries.ts` | modifié | 2 assertions de non-régression |

## Gestion du pays

- **Source unique** : `lib/payments/corridors.ts`. Pays, devise, indicatif,
  opérateurs, décimales et `priced` y sont définis une seule fois.
- **Liste proposée** : les corridors `priced`, soit BEN, BFA, CIV, SEN — tous
  en XOF, une seule grille, aucune conversion.
- **Validation serveur** : `resolvePaymentCountry()` dans
  `app/api/payments/pawapay/initiate/route.ts`. Deux refus distincts :
  `unknown` (code non reconnu) et `not-priced` (corridor réel mais sans grille).
  Le pays n'est jamais relayé tel quel à la passerelle.
- **Devise** : elle découle du pays (`corridor.corridor.currency`), jamais
  l'inverse. `lib/pawapay.ts` refuse de monter un `amountDetails` sans pays
  **et** devise.

## Ce qui n'a pas changé

- Le **montant** reste calculé côté serveur depuis le plan ou le pack. Le
  navigateur n'en envoie aucun. Le pays ne modifie ni le plan, ni le pack, ni la
  durée, ni les quotas, ni la campagne concernée.
- La **confirmation** passe toujours par le webhook et par
  `/api/payments/pawapay/check`. Ouvrir la page PawaPay ne vaut pas paiement
  réussi.
- Aucune clé, aucun jeton, aucun nouvel appel API. Le payload envoyé à
  `POST /v2/paymentpage` est inchangé : `depositId`, `returnUrl`, `reason`,
  `amountDetails`, `country`, `phoneNumber?`.

## Tests effectués

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm run check:payments` | 22 assertions vertes (2 témoins volontairement faux, bien vus échouer) |
| `npm run check:topup` | 39 / 39 |
| `npm run build` | voir ci-dessous |

À vérifier à la main (non automatisé) : ouverture du modal, sélection puis
changement de pays, Échap, clic extérieur, croix, mobile (fenêtre en bas
d'écran, marges 16 px), erreur d'initiation, retour depuis PawaPay.

## Points nécessitant une configuration PawaPay

- Les corridors **BEN, BFA, CIV et SEN** doivent être actifs sur le compte
  marchand. Vérifiable en lecture seule : `npm run check:pawapay-countries`.
- **Ghana et Nigéria** répondent 200 à un appel filtré sans être configurés :
  seul l'appel sans filtre pays fait foi. Ils ne sont pas proposés ici.
- Pour ouvrir un nouveau pays, il faut une **grille tarifaire dans sa devise**.
  Aucun taux de change n'est appliqué : un corridor sans grille est annoncé,
  jamais facturé.
