# Guide d'implémentation — Pass « Sans filigrane » (adaptation Hosted Payment Page)

**Date** : 2026-10-08 · **Statut** : plan adapté, NON implémenté  
**Adaptation de** : `Guide-Pass-Sans-Filigrane-PawaPay.md` (qui supposait PawaPay **Checkouts**)

---

## 0. Pourquoi une adaptation et pas le guide d'origine

Le guide d'origine suppose le produit PawaPay **Checkouts** (`POST /v2/checkouts`,  
`amounts[]` par pays, `checkoutId` généré par nous). Le projet n'intègre **que**  
la **Hosted Payment Page** (`POST /v2/paymentpage`) via `lib/pawapay.ts`. Ce guide  
réécrit le parcours pour **réutiliser ce qui existe déjà** : aucune deuxième  
surface d'API PawaPay, aucun deuxième mode de réconciliation.

Ce qui change par rapport au guide d'origine :

| Point              | Guide d'origine (Checkouts)                                       | Cette adaptation (HPP)                                                                                                                           |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Produit PawaPay    | `/v2/checkouts`                                                   | `/v2/paymentpage` (`initiatePaymentPage`)                                                                                                        |
| Pays / devise      | tableau `XOF_COUNTRIES` en dur (MLI, NER, TGO **non configurés**) | `lib/payments/corridors.ts` → BEN, BFA, CIV, SEN (seuls `priced`)                                                                                |
| Réconciliation     | `activatePass()` maison                                           | **réutilise** `confirmPayment()` (point unique) via webhook + `/check`                                                                           |
| Signature callback | non traitée                                                       | **réutilise** `verifyPawaPayCallback` (RFC 9421) déjà en place                                                                                   |
| Table              | `watermark_passes` seule                                          | `watermark_passes` (lien navigateur) **+** `payments` (`purchase_type='watermark_pass'`, pour la compta et la réutilisation de `confirmPayment`) |
| Auth requise       | aucune (cookie)                                                   | aucune (cookie) — route d'initiation **séparée** de celle des abonnements                                                                        |

---

## 1. Réutilisé tel quel (inutile de le réécrire)

- `lib/pawapay.ts` : `initiatePaymentPage()`, `checkDepositStatus()`,  
  `assertPaymentEnvironmentIsSound()`, `isPawaPayConfigured()`,  
  `PAWAPAY_BASE_URL` (refus strict sandbox-en-prod).
- `app/api/payments/pawapay/webhook/route.ts` : callback signé (RFC 9421),  
  déjà monté. **Aucune modification** — il appelle `confirmPayment()` qui  
  gagnera une branche `watermark_pass`.
- `app/api/payments/pawapay/check/route.ts` : réconciliation au retour. Reste tel  
  quel pour les abonnements ; le pass anonyme utilisera sa propre route  
  `/api/passes/sync` (voir §7) car `/check` exige une session et renvoie  
  plan/campagne.
- `lib/payments/corridors.ts` : `resolvePaymentCountry()` remplace le tableau  
  `XOF_COUNTRIES`. Devise tirée du corridor (`currencyForCountry`).
- `lib/watermark-policy.ts::shouldWatermark()` : **seul** point de décision du  
  badge. Étendu avec un drapeau `passActive` (§6).
- `components/payments/country-picker-modal.tsx` : modal de choix du pays déjà  
  construite, réutilisée pour le pass.

---

## 2. Nouveau — initiation anonyme : `app/api/passes/checkout/route.ts`

Route **séparée** de `app/api/payments/pawapay/initiate` (qui exige une session).  
Pas de `supabase.auth.getUser()`.

<https://help.twibbonize.com/en/articles/10489565-about-the-remove-watermark-promo-plan>

---

## 3. Extension de `confirmPayment` — branche `watermark_pass`

`lib/pawapay-confirm.ts` reste le **seul** point de vérité. Ajouter :

1. `describePayment` : ajouter `'watermark_pass'` à l'union `purchaseType`.
2. `ConfirmPaymentResult.kind` : ajouter `'watermark_pass'`.
3. Nouvelle branche **avant** la fin « sans cible » :

```ts
if (described.purchaseType === 'watermark_pass') {
  const { error } = await admin.rpc('activate_watermark_pass', {
    p_deposit_id: depositId, p_provider: provider, p_phone: phone,
  });
  if (error) return { ok: false, kind: 'watermark_pass', error: error.message };
  await issueInvoice(admin, depositId);          // compta, idempotent
  return { ok: true, kind: 'watermark_pass' };
}
```

La fonction SQL `activate_watermark_pass(deposit_id)` : lit la ligne  
`watermark_passes` par `provider_ref`, vérifie le montant, passe `status` en  
`'active'` et pose `ends_at = now() + duration_h`. **Idempotente** (si déjà  
`'active'`, ne fait rien) — un webhook rejoué ne crédite pas deux fois.  
L'index unique partiel `wp_one_active_per_browser` refuse un second pass actif.

---

## 4. Migration SQL (adaptée)

`watermark_passes` (lien navigateur) + colonnes à ajouter sur `payments` :  
`browser_id text null` et accepter `user_id` nul pour `purchase_type='watermark_pass'`.

```sql
create table if not exists public.watermark_passes (
  id           uuid primary key default gen_random_uuid(),
  browser_id   text        not null,
  ua_hash      text        not null,
  provider     text        not null default 'pawapay',
  provider_ref text        not null,   -- depositId HPP
  duration_h   int         not null,
  amount       int         not null,
  currency     text        not null,
  status       text        not null default 'pending', -- pending|active|expired|failed
  starts_at    timestamptz,
  ends_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index if not exists wp_browser_idx
  on public.watermark_passes (browser_id, ends_at desc);
create unique index if not exists wp_one_active_per_browser
  on public.watermark_passes (browser_id) where status = 'active';
alter table public.watermark_passes enable row level security; -- seul service_role

create or replace function public.expire_watermark_passes() returns void language sql as $$
  update public.watermark_passes set status = 'expired'
   where status = 'active' and ends_at < now();
$$;

-- Sur payments : autoriser user_id null pour le pass, ajouter browser_id
alter table public.payments add column if not exists browser_id text null;
```

---

## 5. Réconciliation publique : `app/api/passes/sync/route.ts`

`/check` exige une session et renvoie plan/campagne → inadapté à l'anonyme.  
Route **publique** dédiée, qui réutilise `confirmPayment` + `checkDepositStatus` :

```ts
// app/api/passes/sync/route.ts  (runtime = 'nodejs', dynamic = 'force-dynamic')
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPawaPayConfigured } from '@/lib/pawapay';
import { checkDepositStatus } from '@/lib/pawapay';
import { confirmPayment } from '@/lib/pawapay-confirm';

export async function POST(req: NextRequest) {
  const { depositId } = await req.json().catch(() => ({} as any));
  if (!depositId || !/^[0-9a-f-]{36}$/i.test(depositId))
    return NextResponse.json({ error: 'invalid_deposit' }, { status: 400 });

  const admin = supabaseAdmin();
  if (isPawaPayConfigured()) {
    const remote = await checkDepositStatus(depositId);
    if (remote?.status === 'COMPLETED') await confirmPayment(admin, {
      depositId, provider: remote.payer?.accountDetails?.provider ?? null,
      phone: remote.payer?.accountDetails?.phoneNumber ?? null,
      amount: remote.amount ?? null, currency: remote.currency ?? null,
    });
  }
  // Renvoie UNIQUEMENT l'état du pass, jamais plan/campagne
  const { data: pass } = await admin.from('watermark_passes')
    .select('status, ends_at').eq('provider_ref', depositId)
    .eq('status', 'active').maybeSingle();
  return NextResponse.json({
    active: !!pass,
    endsAt: pass?.ends_at ?? null,
    remainingMs: pass?.ends_at ? new Date(pass.ends_at).getTime() - Date.now() : 0,
  });
}
```


## 7. Décision produit à valider (conflit filigrane / Créateur)

`shouldWatermark` pose le badge en accès public *quelle que soit* la formule du  
créateur — c'est l'ancrage qui pousse le créateur vers la distribution privée  
payante (`components/participant/watermark-upsell.tsx`). Un pass participant à  
700 FCFA retire le badge pour le **navigateur ayant payé**, sur `/c/`.

- **Argument pour** : le payeur est le *participant*, pas le créateur. C'est un  
  autre segment client ; cela n'enlève rien à la formule Créateur (qui s'adresse  
  au créateur pour sa propre distribution).
- **Argument contre** : cela adoucit « l'accès public est toujours marqué » et  
  concurrence la formule Créateur (3 000 FCFA/mois) pour le participant qui  
  voudrait un visuel net.

→ **À trancher avec le responsable produit avant le dev.** Si refus, le pass  
n'a pas lieu d'être ; si accepté, préciser qu'il ne couvre que le téléchargement  
du participant (jamais la distribution du créateur).

---

## 8. Cookie `cn_bid` et confidentialité

Le projet applique « un seul cookie Supabase, pas d'analytics ». `cn_bid` (UUID  
aléatoire, anonyme, non lié à une personne) casse cette convention. À faire :  
ajouter `cn_bid` à `/cookies` et `/confidentialite` en le présentant comme un  
identifiant de navigateur non identifiant servant uniquement à activer un achat  
sans compte.

---

## 9. UI

- Réutiliser `components/payments/country-picker-modal.tsx` (ouvert par le bouton  
  d'achat du pass, comme `checkout-page.tsx` / `topup-button.tsx`).
- Nouveau composant `WatermarkPassButton` (dépliable 1 h / 6 h / 24 h) sous  
  l'export participant ; bandeau vert « Sans filigrane activé — expire dans … ».
- `app/pass/retour/page.tsx` : spinner → appelle `/api/passes/sync` (polling  
  jusqu'à 120 s) → succès (date d'expiration) ou « si le débit est passé, ton  
  pass s'activera seul, ne paie pas deux fois ».
- Masquage client du bouton d'achat si pass actif — **mais** la route renvoie  
  `409` de toute façon (le masquage n'est que de l'ergonomie).

---

## 10. Checklist de mise en production

**Réutilisé (déjà en place)**

- [x] Callback signé RFC 9421 (`webhook/route.ts`)
- [x] `assertPaymentEnvironmentIsSound` (refus sandbox-en-prod)
- [x] Choix du pays validé (`corridors.ts`)
- [x] Contrôle montant encaissé = montant attendu (`confirmPayment`)
- [x] Idempotence webhook/`/check`

**Nouveau à faire**

- [ ] Migration `watermark_passes` + `payments.browser_id` + `user_id` nullable pour `watermark_pass`
- [ ] `activate_watermark_pass()` (RPC idempotente)
- [ ] `confirmPayment` : branche `watermark_pass`
- [ ] `app/api/passes/checkout` (initiation anonyme)
- [ ] `app/api/passes/sync` (réconciliation publique)
- [ ] `/api/render` serveur + refactor fabriques + polices `.ttf`
- [ ] `shouldWatermark` : drapeau `passActive`
- [ ] `WatermarkPassButton` + `app/pass/retour`
- [ ] `cn_bid` dans `/cookies` et `/confidentialite`
- [ ] **Décision produit §7 validée**
- [ ] Tests : achat → pass actif → export net ; 2e achat en cours de validité → 409 ; changement de navigateur → plus de pass ; cookie copié → refusé (`ua_hash`) ; expiration → export filigrané ; fermeture onglet après PIN → `sync` retrouve le pass
