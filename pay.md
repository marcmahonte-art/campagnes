# Mise en production du paiement — plan d'exécution

Ce document est la procédure à suivre pour passer le paiement Mobile Money de l'état actuel
(« ça fonctionne en bac à sable ») à l'état « ça encaisse de l'argent réel sans couture ».

Il est écrit dans l'ordre où les étapes doivent être faites. Chaque étape est **bloquante** pour
la suivante : passer en production avant d'avoir appliqué la migration `0020` ferait payer des
abonnements qui n'expirent jamais, et ne pas activer les callbacks signés avant de déployer
laisserait le webhook ouvert à la production.

---

## Où en est le système

| Élément | Fichier | État |
|---|---|---|
| Client PawaPay v2 | `lib/pawapay.ts` | branché, environnement désormais obligatoire en prod |
| Vérification de signature | `lib/pawapay-signature.ts` | **nouveau** |
| Point unique de confirmation | `lib/pawapay-confirm.ts` | confirmé, avec garde de montant |
| Initiation du paiement | `app/api/payments/pawapay/initiate/route.ts` | fonctionnel |
| Callback pawaPay | `app/api/payments/pawapay/webhook/route.ts` | authentifié |
| Réconciliation au retour | `app/api/payments/pawapay/check/route.ts` | privée |
| Expiration des abonnements | `app/api/cron/expire-plans/route.ts` + `vercel.json` | **nouveau** |
| Échéance en base | `supabase/migrations/0020_plan_expiry.sql` | **nouveau** |

Le flux complet, une fois configuré :

```
/tarifs ou page campagne
   └─ POST /initiate      → écrit `payments` (pending), ouvre la page pawaPay
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
   pawaPay (page hébergée)                   pawaPay (webhook signé)
        │                                           │
   retour navigateur                                  │
        └─ GET /check ────────┐          ┌───────────┘
                               ▼          ▼
                    confirmPayment()  (UN SEUL point de vérité)
                    · garde de montant
                    · idempotence
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
   credit_campaign_quota            complete_payment_and_activate_plan
   (+ participants_granted)          (+ users.plan, + plan_expires_at)
              └────────────────┬────────────────┘
                               ▼
                    cron quotidien : expire_due_plans()
```

---

## Étape 1 — Dans le Dashboard pawaPay

**1.1 Récupérer le jeton de production.**
Dashboard → *API Tokens* → créer un jeton pour l'environnement **Production**. Pas celui du
bac à sable : ce sont deux jetons distincts.

**1.2 Activer les callbacks signés.** ← l'étape la plus importante du lot.

Dashboard → *API Tokens* → *Signed callbacks* → activer. Sans cela, aucun en-tête `Signature`
n'est joint aux notifications, et la route webhook les refusera (c'est voulu).

**1.3 Enregistrer l'URL de callback.**

Remplacez `DOMAINE` par votre domaine de production (celui de `NEXT_PUBLIC_SITE_URL`) :

```
https://DOMAINE/api/payments/pawapay/webhook
```

Cette URL est celle que pawaPay signera : ni `localhost`, ni une URL de preview Vercel, ni le
bac à sable. pawaPay tente plusieurs fois en cas d'échec : une route qui répond `500` fait
rejouer, une route qui répond `401` fait perdre la notification — d'où l'ordre, 1.2 avant 1.3.

La route `/api/payments/pawapay/webhook` existe bien et est bien celle que le code utilise
(`app/api/payments/pawapay/webhook/route.ts`).

**1.4 Vérifier que le marché BFA est activé.**
Les opérateurs à proposer doivent être `ORANGE_BFA` et `MOOV_BFA` — c'est ce que le code
annonce. Si le compte pawaPay n'a pas le Burkina Faso en portefeuille actif, le paiement ne
fonctionnera pas.

---

## Étape 2 — Appliquer la migration 0020 en base

La migration ajoute `users.plan_expires_at` et remplace `set_user_plan` par une version à trois
arguments. **Elle est indispensable** : sans elle, un abonnement « 1 mois » vaut formule à vie.

Supabase → *SQL Editor*, ou en ligne de commande :

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0020_plan_expiry.sql
```

Cette migration fait trois choses : ajoute `users.plan_expires_at`, remplace `set_user_plan` par
une version à trois arguments `(p_user_id, p_plan, p_expires_at)`, et crée
`expire_due_plans()`. Le `drop function` de l'ancienne signature est volontaire : sans lui, deux
fonctions coexistent dont une seule écrit l'échéance.

Puis vérifier que la base répond :

```sql
select proname, pg_get_function_identity_arguments(oid)
  from pg_proc
 where proname in ('expire_due_plans', 'set_user_plan', 'plan_expiry_from_duration')
 order by proname;
```

Attendu : `set_user_plan` avec `(p_user_id uuid, p_plan plan_kind, p_expires_at timestamp with
time zone)`, et `expire_due_plans` sans argument.

Vérifier aussi que les migrations **0017**, **0018** et **0019** sont bien appliquées (le
`check:topup` les simule, il ne prouve pas qu'elles sont en base) :

```sql
select column_name from information_schema.columns
 where table_name = 'payments'
   and column_name in ('deposit_id', 'campaign_id', 'amount');
```

---

## Étape 3 — Variables d'environnement sur Vercel

Project → *Settings* → *Environment Variables*. Pour **Production** :

| Variable | Valeur | Obligatoire |
|---|---|---|
| `PAWAPAY_API_TOKEN` | jeton de production (étape 1.1) | oui |
| `PAWAPAY_BASE_URL` | `https://api.pawapay.io` | oui — le build échoue sans |
| `PAWAPAY_REQUIRE_SIGNED_CALLBACKS` | `true` | recommandé (défaut en prod) |
| `NEXT_PUBLIC_SITE_URL` | `https://DOMAINE` | oui — construit les URL de retour |
| `CRON_SECRET` | une chaîne au hasard | oui pour le cron |
| `NEXT_PUBLIC_SUPABASE_URL` | ton projet | déjà là |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ta clé anon | déjà là |
| `SUPABASE_SERVICE_ROLE_KEY` | ta clé service_role | déjà là |

Deux points qui prêtent à erreur :

- **`PAWAPAY_BASE_URL` doit être l'URL de production, pas celle du bac à sable.** C'est
  vérifié : le build échoue si elle est absente, et `/initiate` refuse de s'ouvrir si elle
  pointe sur le bac à sable en production.
- **`NEXT_PUBLIC_SITE_URL`** doit être le domaine réel. pawaPay y renvoie l'utilisateur ; sur
  `localhost` ou une URL de déploiement Vercel éphémère, il atterrit sur une page morte.

Redéployer ensuite (Settings → *Redeploy*, ou un nouveau push) : les variables d'environnement
sont lues au build, pas à l'exécution.

---

## Étape 4 — Le cron d'expiration

`vercel.json` déclare déjà la tâche :

```json
{ "crons": [{ "path": "/api/cron/expire-plans", "schedule": "17 3 * * *" }] }
```

Côté Vercel, c'est pris en compte au déploiement : rien à cliquer. Vérifier après le premier
déploiement que la tâche est enregistrée (Project → *Cron Jobs*).

**Déclenchement manuel**, pour tester sans attendre minuit :

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://DOMAINE/api/cron/expire-plans
```

Réponse attendue : `{"expired":0}`. Sans `CRON_SECRET`, la route refuse tout appel en
production (401) — c'est volontaire, une route de cron publique serait trivial à saturer.

---

## Étape 5 — Contrôles automatiques, avant le déploiement

```bash
npm run typecheck
npm run check:topup      # 24 assertions : idempotence, garde de montant, séparation des cibles
npm run check:ui-tarifs  # conformité de la page Tarifs
npm run build
```

`check:topup` est le plus utile : il rejoue le scénario complet (webhook, rejeu, `/check`,
paiement partiel, devise incohérente) sur un modèle fidèle des fonctions SQL. Il contient son
propre auto-test — s'il ne peut pas échouer, il ne prouve rien.

Si `typecheck` ou `build` échoue, **ne déployez pas**.

---

## Étape 6 — Premier paiement réel, en trois temps

Ne faites pas le premier test en direct sur la formule la plus chère.

**6.1 Un pack de distribution, petit palier.**
Pack 100 → 2 500 FCFA, sur une campagne de test que vous avez créée. Vérifiez après paiement :

```sql
select p.deposit_id, p.status, p.amount, p.provider, c.participants_granted
  from payments p join campaigns c on c.id = p.campaign_id
 where p.campaign_id = '<votre-campagne>';
```

`participants_granted` doit avoir augmenté **exactement de 100**, une seule fois.

**6.2 Vérifiez l'idempotence pour de vrai.**
Depuis le Dashboard pawaPay, renvoyez le callback (endpoint *Resend deposit callback*), ou
rechargez la page de campagne plusieurs fois. Relancez la requête SQL. Le quota ne doit pas
bouger. C'est le test le plus important du lot : c'est exactement le bug d'argent que la garde
d'idempotence empêche.

**6.3 Un abonnement, puis l'échéance.**
Abonnement Créateur 1 mois → 3 000 FCFA. Vérifiez :

```sql
select plan, plan_expires_at from users where id = '<votre-compte>';
```

`plan_expires_at` doit être à environ un mois. **Un `NULL` ici signifie que la migration 0020
n'est pas appliquée** — c'est le défaut le plus coûteux du lot, car un abonnement « 1 mois »
valait formule à vie.

L'écran de confirmation affiche alors « Votre formule Créateur est maintenant active jusqu'au
<date> ». Si la date manque, c'est que `plan_expires_at` n'a pas été écrit.

Pour tester l'expiration sans attendre un mois, forcez-la et lancez le cron :

```sql
update users set plan_expires_at = now() - interval '1 day'
 where id = '<votre-compte>';
```

puis relancez l'étape 4 : le compte doit revenir à `free`, `plan_expires_at` à `NULL`.
Vérifiez aussi que les campagnes du compte sont toujours là :

```sql
select count(*) from campaigns where owner_id = '<votre-compte>';
```

Elles ne doivent pas avoir bougé : l'expiration ferme l'accès aux modules premium, elle ne
supprime rien.

**6.4 Les deux opérateurs.**
Répétez 6.1 avec Moov BFA. Le code ne filtre pas l'opérateur, mais c'est là que ça casse
quand l'opérateur n'est pas activé sur le compte pawaPay.

---

## Étape 7 — Surveiller la première semaine

- **Logs Vercel**, section *Functions* : chercher `[pawaPay Webhook] Callback rejeté` et
  `[pawaPay] Callback reçu SANS signature`. Le premier signifie soit une signature mal
  vérifiée, soit un `PAWAPAY_BASE_URL` mal réglé ; le second signifie que les callbacks signés
  ne sont pas activés.
- **Requêtes suivantes**, pour voir le trafic des trois routes :
  - `/api/payments/pawapay/webhook` — ne doit jamais répondre 401 en fonctionnement normal
  - `/api/payments/pawapay/check` — un 401 signifie une session expirée au retour, normal
  - `/api/cron/expire-plans` — une fois par jour, `{"expired":0}` ou plus
- **Ligne de contrôle**, chaque jour pendant une semaine :

```sql
select status, count(*) from payments
 where created_at > now() - interval '1 day'
 group by status order by status;
```

Un `pending` qui vieillit est un paiement que personne n'a soldé — c'est le signal d'alerte
principal. `credit_campaign_quota` et `complete_payment_and_activate_plan` laissent en
`pending` quand le montant est incohérent : c'est volontaire, ces lignes demandent un arbitrage
humain.

---

## Ce qui a été corrigé, et ce qu'il reste ouvert

### Corrigé dans ce lot

- **Callback authentifié** (`lib/pawapay-signature.ts`) : vérification RFC 9421, condensé du
  corps, clé publique pawaPay, fenêtre de 5 minutes sur l'horodatage. Un callback forgé est
  rejeté en 401.
- **Garde de montant** (`lib/pawapay-confirm.ts`) : ce que pawaPay dit avoir encaissé est
  comparé à la ligne `payments` avant toute écriture, en centimes. Un paiement partiel ne
  crédite rien, et le paiement reste `pending` pour arbitrage.
- **`/check` rendu privé** : session obligatoire, et refus par 404 d'un paiement qui n'est pas
  à l'appelant.
- **Expiration réelle des abonnements** : `plan_expires_at`, calculé depuis la durée payée, et
  cron quotidien qui bascule à `free`. Un 1 mois vaut un mois.
- **Environnement PawaPay explicite** : plus de repli silencieux sur le bac à sable.

### Ajouté dans ce lot

- **Historique « Mes paiements »** dans les réglages : date, montant, offre, statut, référence
  pawaPay. Lecture par le client de session — c'est la RLS de `payments` qui filtre, pas un
  filtre posé dans le code. Aucun secret n'y est affiché.
- **Date d'échéance affichée** à deux endroits : sur l'écran de confirmation après paiement, et
  dans les réglages. Elle n'est affichée que si elle est dans le futur ; une échéance dépassée en
  attente du cron ne ferait qu'afficher un faux bug.
- **Crédits de quota visibles** dans l'historique, avec le pack nommé.

### Reste ouvert — à traiter ensuite

Ces points ne bloquent pas la mise en production, mais deux d'entre eux sont visibles par les
clients :

1. **`PARTICIPANT_PAYMENT` (500 FCFA / 24 h) est annoncé sans être vendable.** L'offre apparaît
   sur `/tarifs`, dans `/conditions` et sur la page participant, mais aucune route ne la vend et
   aucun mécanisme de jeton de 24 h n'existe. C'est un écart juridique et commercial : soit
   vous la branchez, soit vous la retirez des textes. **À traiter avant d'avoir des clients.**

2. **Les quotas inclus des formules ne sont pas crédités.** La page Tarifs annonce « 100
   distributions incluses par mois » pour Créateur et « 1 000 distributions » pour ONG, mais
   `includedDistributions` n'est référencé nulle part dans le code applicatif, et
   `complete_payment_and_activate_plan` ne touche que `users.plan` et `plan_expires_at`. Un
   client qui souscrit Créateur ne reçoit donc aucune distribution.
   Décision prise : **signalé, non modifié** — c'est un écart commercial à trancher, pas un bug
   technique, et le corriger changerait le modèle économique.
   Pour lever l'écart, il faudra soit créditer `campaigns.participants_granted` à la
   confirmation, soit retirer la mention des textes.

3. **`PACK_ADDONS` (Pack Propre / Pack Sponsor) est dans la configuration, référencé nulle
   part.** Défini dans `lib/pricing/config.ts`, aucun écran ni route ne l'utilise.

4. **`offer-card.tsx` affiche encore « Demander un devis »** sur des packs publiés, incohérent
   avec le bouton d'achat direct.

5. **`docs/ARCHITECTURE.md` §7** décrit encore « aucun prestataire de paiement branché », et le
   tableau des migrations du `README.md` s'arrête à `0005`.

6. **Pas de rappel avant échéance.** `PREPAYMENT_REASSURANCE` promet un « rappel 7 jours avant
   l'échéance » qui n'existe pas. Le client découvre l'expiration en perdant l'accès.

7. **Pas de reçu downloadable.** L'historique affiche la référence pawaPay, ce qui suffit à un
   rapprochement opérateur, mais aucun PDF n'est généré.

---

## En cas de problème

**Le webhook renvoie 401.**
Soit les callbacks signés ne sont pas activés dans le Dashboard pawaPay (étape 1.2), soit
`@authority` ne correspond à aucun candidat. L'erreur est journalisée côté serveur avec le
motif exact. En dépannage immédiat : `PAWAPAY_REQUIRE_SIGNED_CALLBACKS=false`, puis cherchez à
corriger — un webhook ouvert accepte des notifications forgées.

**Le build échoue sur `PAWAPAY_BASE_URL`.**
Comportement voulu : la variable est obligatoire en production. Renseignez-la.

**Le paiement passe mais la formule ne s'active pas.**
Dans l'ordre : le webhook est-il passé (`[pawaPay Webhook] Traitement` dans les logs) ? Le
montant reported correspond-il à `payments.amount` ? La migration `0020` est-elle appliquée
(sans elle, le repli JavaScript s'exécute, mais `set_user_plan` peut échouer) ?

**`{"expired":0}` alors qu'un compte est échu.**
`plan_expires_at` est peut-être `NULL` — un compte payé avant la migration `0020` n'a pas
d'échéance. Corrigez à la main une fois :

```sql
update users set plan_expires_at = now() + interval '1 month'
 where plan <> 'free' and plan_expires_at is null;
```