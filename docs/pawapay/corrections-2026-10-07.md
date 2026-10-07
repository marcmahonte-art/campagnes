# Revue et corrections — 2026-10-07 (paiement, Afrique de l'Ouest)

> Réponse à `analyse-2026-10-07.md`. Cette analyse partait d'une lecture seule du
> **journal**, sans accès au code. Chaque risque a donc été repris **dans le code
> réel** : CONFIRMÉ / DÉJÀ OK / OUVERT, avec la preuve.
> Rien n'a été payé, aucun dépôt n'a été initié : la seule requête envoyée au
> prestataire est une lecture de configuration (`GET /v2/active-conf`).

---

## 1. Verdict en une phrase

L'analyse sous-estimait le code : la plupart des protections qu'elle réclame
existent déjà (signature de callback sur corps brut, idempotence SQL, RLS
fermée, vérification du montant encaissé). Les deux vrais défauts étaient
**le pays codé en dur** et **le pays reçu du client sans validation** — corrigés
aujourd'hui. Restent ouverts : le backfill des crédits, l'observabilité des
échecs et le PDF de facture.

---

## 2. Ce qui a été corrigé aujourd'hui

| Fichier | Changement |
|---|---|
| `lib/payments/corridors.ts` *(nouveau)* | Source unique de vérité : pays, devise, indicatif, opérateurs, décimales, et surtout `priced` (une grille existe dans cette devise). |
| `lib/pawapay.ts` | Suppression du défaut `'BFA'` et de la devise implicite. Un montant sans pays **et** devise lève désormais, au lieu d'envoyer le client sur le corridor burkinabè. |
| `app/api/payments/pawapay/initiate/route.ts` | Le pays reçu du client est **validé** (`resolvePaymentCountry`) ; la devise **découle du pays** ; pays et devise figés dans les métadonnées de la vente. |
| `components/billing/checkout-page.tsx` | L'utilisateur choisit son pays avant de payer ; les corridors connus mais non tarifés sont annoncés, jamais facturés. |
| `lib/pricing/config.ts` | `PAYMENT_METHOD_LABELS` n'annonce plus « Orange, Moov » de façon figée : opérateurs et pays sont dérivés des corridors. |
| `scripts/check_pawapay_countries.ts` *(nouveau)* | Lecture seule : quels pays sont **réellement ouverts sur le compte marchand**, et quoi corriger. |
| `tools/payments-check/` *(nouveau)* | Harnais `check:payments` : 20 assertions + 2 témoins volontairement faux. |

---

## 3. Point par point (analyse → réalité du code)

| # | Risque de l'analyse | Statut | Preuve |
|---|---|---|---|
| 1 | Script de test qui tape la production | **DÉJÀ OK** | `scripts/test_pawapay.ts:11-19` refuse la prod sauf `PAWAPAY_ALLOW_PRODUCTION_TEST=1`. Le contrôle de clé est en lecture seule (`GET /v2/active-conf`, `check_pawapay_token.ts:43`). |
| 2 | Aucune validation d'environnement | **DÉJÀ OK** | `lib/pawapay.ts:31-53` casse en prod sans `PAWAPAY_BASE_URL`, exige `https` ; `:128-139` refuse « prod + sandbox » ; `.env.example:26-34` documente les deux. |
| 3 | Double source de vérité sur les crédits | **CONFIRMÉ — ouvert** | `0021` crée le nouveau modèle ; aucune migration ne reporte l'ancien (`payments.campaign_id` / `credit_campaign_quota`) vers `account_credit_ledger`. |
| 4 | Concurrence / idempotence du ledger | **DÉJÀ OK (SQL)** | `0021:151-154` `SELECT … FOR UPDATE` ; `:160-162` garde `pending → completed` ; `:78-80` index unique `(payment_id) where kind='purchase'` ; solde et écriture dans la **même** fonction. Harnais `check:topup` 39/39. |
| 5 | Numérotation / immuabilité des factures | **PARTIEL** | Séquence + `UNIQUE(invoice_number)` + `on conflict do nothing` (`0021:99,103,272`). Manque : un trigger qui interdit toute modification après émission (les `revoke` de `0021:130` protègent des clients, pas d'une écriture `service_role`). |
| 6 | IDOR sur les factures | **DÉJÀ OK** | `app/api/invoices/route.ts:27-32` : `.eq('user_id', user.id)` puis 404 ; RLS `0021:123-128`. |
| 7 | RLS insuffisante | **DÉJÀ OK** | `0021:56-64, 87-96, 123-132` : **SELECT seul**, `revoke insert/update/delete`, `grant … to service_role`. Aucune policy `FOR ALL`. |
| 8 | Signature webhook sur corps re-sérialisé | **DÉJÀ OK** | `lib/pawapay-signature.ts:167-182` (Content-Digest recalculé sur le brut, comparaison temps constant), `:406-429` (anti-rejeu 300 s, clé P-256 en `ieee-p1363`) ; la route lit `request.text()` (`webhook/route.ts:102`). |
| 9 | `country` codé en dur à `'BFA'` | **CONFIRMÉ — corrigé** | Ancien `lib/pawapay.ts:169`. Désormais `lib/payments/corridors.ts` + validation serveur. |
| 10 | Montants flottants | **DÉJÀ OK** | Ledger `integer` (`0021:71`), factures `numeric(12,2)`, comparaison via `Math.round(v*100)` (`pawapay-confirm.ts:94-97`). |
| 11 | Zéro test sur la facturation | **PARTIELLEMENT FAUX** | `check:topup` 39/39 et `check:webhook` 11/11 couvrent déjà idempotence, montant, concurrence. Ajouté : `check:payments`. Reste non couvert : le SQL réel (faute de jeton Supabase ici). |
| 12 | Déploiement direct en prod | **NON VÉRIFIABLE DANS LE CODE** | C'est un processus, pas du code : preview obligatoire et rollback documenté restent à écrire. |
| 13 | Pas d'observabilité des échecs | **CONFIRMÉ — ouvert** | Aucune table d'audit / dead-letter : un webhook reçu mais non confirmé ne vit que dans les logs (`webhook/route.ts:170-184`). |
| 14 | Parcours anonyme | **DÉJÀ OK** | `pricing-controls.tsx:189-192` → `/onboarding?next=/dashboard/acheter?plan=…&duration=…` ; `onboarding-form.tsx:101` rejoue `next` ; `(creator)/layout.tsx:26` redirige vers `/login?next=…`. |
| 15 | Pas de PDF de facture | **CONFIRMÉ — ouvert** | Aucun générateur PDF dans le projet. |
| 16 | Pas d'avoir / remboursement | **PARTIEL** | Le ledger autorise `refund` et `adjustment` et les montants négatifs (`0021:71-73`) ; aucune écriture ni écran ne les produit. |
| 17 | TVA / mentions légales | **OUVERT** | `seller` est un `jsonb` libre alimenté par `lib/company.ts` (champs absents → « À COMPLÉTER »). |

---

## 4. Afrique de l'Ouest : ce qui est réellement disponible

Mesuré sur le compte marchand (**`MPIXEL AGENCY`**, environnement déclaré
`https://api.pawapay.io`) par `npm run check:pawapay-countries` :

```
Pays configurés pour les dépôts :
BEN, BFA, CIV, CMR, COD, COG, GAB, KEN, MOZ, RWA, SEN, SLE, UGA, ZMB
```

| Pays | Devise | Passerelle | Facturable aujourd'hui ? |
|---|---|---|---|
| Bénin (BEN) | XOF | configuré | **Oui** |
| Burkina Faso (BFA) | XOF | configuré | **Oui** |
| Côte d'Ivoire (CIV) | XOF | configuré | **Oui** |
| Sénégal (SEN) | XOF | configuré | **Oui** |
| Sierra Leone (SLE) | SLE | configuré | Non : aucune grille en SLE |
| Ghana (GHA) | GHS | **non configuré** | Non : à demander au prestataire |
| Nigéria (NGA) | NGN | **non configuré** | Non : à demander au prestataire |

Trois niveaux, volontairement distincts :

1. **Payable maintenant** — Bénin, Burkina Faso, Côte d'Ivoire, Sénégal.
   La grille est en francs CFA, ces quatre pays **sont** en francs CFA : aucun
   taux de change, aucune conversion. C'est le cœur de la demande.
2. **Ouvert côté passerelle, sans grille** — Sierra Leone (devise SLE).
   Le corridor est actif, mais nous n'avons aucun prix en SLE. Le pays est
   annoncé dans l'interface, **jamais facturé** : un prix converti serait un
   prix inventé.
3. **Pas encore activé** — Ghana et Nigéria. La passerelle les documente, mais
   ils ne sont **pas** dans la configuration du compte : il faut en demander
   l'activation, puis définir une grille en GHS et en NGN.

**Non promis** : Mali, Niger, Togo, Guinée, Gambie, Liberia, Cap-Vert,
Guinée-Bissau ne figurent pas dans la liste des opérateurs documentée par la
passerelle. Ils n'apparaissent donc nulle part dans l'interface — annoncer un
moyen de paiement qui n'existe pas est pire que de ne rien annoncer.

> Précision utile : `GET /v2/active-conf?country=GHA` répond **200** alors que le
> pays n'est pas configuré. Ce n'est donc pas le code HTTP d'un appel filtré qui
> prouve l'ouverture d'un corridor, mais sa présence dans la liste renvoyée
> **sans filtre de pays** — c'est ce que fait le script.

---

## 5. Ce qui reste ouvert, par gravité

**P1 — à traiter avant d'élargir encore la zone**
- Backfill idempotent des anciens crédits vers `account_credit_ledger`, puis
  contrôle `SUM(ledger) == balance`. Sans ça, deux soldes cohabitent.
- Observabilité : table d'audit des webhooks reçus non confirmés (hash, statut,
  erreur, tentatives) + réconciliation. Un encaissement non crédité doit se voir.
- Trigger d'immuabilité des factures après émission ; avoir (`credit_note`) pour
  toute correction.

**P2 — souhaitable**
- PDF de facture + archivage + envoi par e-mail.
- Demande d'activation de GHA et NGA, puis **grilles en GHS et NGN** écrites par
  le responsable produit (jamais une conversion automatique).
- Preview Vercel systématique et procédure de rollback documentée pour `0021`.
- Cadrage TVA / mentions légales.

**Non vérifié ici, par construction** : que les politiques RLS et les fonctions
SQL sont réellement appliquées en base (aucun jeton Supabase dans cette
session). Le code et la migration ont été lus, pas exécutés.

---

## 6. Commandes exécutées et résultats réels

```
npm run check:payments
  → TOUT VERT — 20 assertions utiles
    (2 témoins volontairement faux échouent : sans eux le harnais ne prouve rien)

npm run typecheck          → exit 0
npm run check:topup        → TOUT VERT — 39 assertions sur 39
npm run check:webhook      → 11 réussis / 0 échoués
npm run check:pawapay-countries
  → Compte marchand : MPIXEL AGENCY
  → Pays configurés : BEN, BFA, CIV, CMR, COD, COG, GAB, KEN, MOZ, RWA, SEN, SLE, UGA, ZMB
  → Tous les pays facturables sont ouverts sur le compte.
npm run build              → voir §7
```

Aucun commit, aucun push, aucun déploiement : les modifications sont locales.

---

## 7. Build

```
npm run build → SUCCÈS (Next.js 15.5.27)
  /tarifs       5,6 kB — 202 kB
  /dashboard/acheter (dynamique, sous /dashboard)
  Middleware    94,4 kB
```

Deux tentatives ont d'abord échoué sur `EPERM … .next/trace` — panne
d'environnement connue (verrou externe), pas de code : purge de `.next` puis
relance. Le code n'a pas été modifié pour « faire passer » le build.
