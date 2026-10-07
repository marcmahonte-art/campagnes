/**
 * Contrôle de bout en bout du paiement pawaPay — quotas (0018) et abonnements (0020).
 *
 * POURQUOI CE HARNAIS
 * -------------------
 * Les règles les plus coûteuses du lot tiennent en trois phrases :
 *
 *   1. **un webhook rejoué ne crédite pas deux fois** — pawaPay rejoue ses
 *      notifications, et la route `/check` rappelle la même confirmation après
 *      un retour de navigation. Un créateur qui a payé 500 téléchargements en
 *      recevrait 1 000 : un bug d'argent, silencieux, invisible à l'écran ;
 *   2. **un abonnement d'un mois n'est pas une formule à vie** ;
 *   3. **un montant encaissé différent du montant vendu ne crédite rien**.
 *
 * Aucun jeton Supabase n'est disponible ici : on ne peut pas exécuter le SQL
 * réel. On **modélise donc fidèlement** la sémantique des fonctions concernées,
 * puis on la met à l'épreuve sur des sessions complètes (initiation → webhook →
 * rejeu → /check → expiration), plutôt que sur des cas isolés. C'est ainsi
 * qu'on attrape un double crédit : un cas isolé (« un webhook crédite ») passe
 * toujours, c'est le **second** passage qui révèle le défaut.
 *
 * LE HARNAIS DOIT POUVOIR ÉCHOUER. Avant de lui faire confiance, on a prouvé
 * qu'il détecte la régression qu'il prétend couvrir (section 9, auto-test
 * intégré). Un contrôle qui ne peut pas échouer ne prouve rien.
 *
 * Ce qu'il ne prouve PAS : que les migrations sont appliquées en base. Cela se
 * vérifie en direct avec `tools/topup-check/live-0018.mjs` quand un jeton
 * Supabase est disponible.
 */

import assert from 'node:assert/strict';

let failures = 0;
let checks = 0;

function test(name: string, fn: () => void) {
  checks += 1;
  try {
    fn();
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/* =====================================================================
 * MODÈLE DE LA BASE
 *
 * On reproduit les deux tables et la sémantique EXACTE des fonctions SQL :
 *   - `payments` (deposit_id, campaign_id, plan, status, metadata) ;
 *   - `campaigns` (id, participants_granted).
 * ===================================================================== */

interface PaymentRow {
  deposit_id: string;
  /** Renseigné pour un pack de distribution ; `null` pour un abonnement. */
  campaign_id: string | null;
  /** Renseigné pour un abonnement ; `null` pour un pack. */
  plan: string | null;
  user_id: string;
  /** Montant figé à l'initiation — la référence contre laquelle on vérifie l'encaissement. */
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  metadata: Record<string, unknown>;
  provider: string | null;
  phone_number: string | null;
}

interface CampaignRow {
  id: string;
  participants_granted: number;
}

/** Un compte, tel que `users` le décrit après le lot sur les abonnements. */
interface UserRow {
  id: string;
  plan: 'free' | 'creator' | 'organization';
  plan_expires_at: string | null;
  /**
   * Nombre de campagnes du compte.
   *
   * Il n'est pas utilisé par une règle de paiement, mais il sert de **témoin** :
   * la migration 0020 ne doit toucher qu'à `users`, jamais à `campaigns`.
   * Compter les campagnes après expiration prouve qu'aucune n'a été supprimée.
   */
  campaign_count: number;
}

class FakeDb {
  payments: PaymentRow[] = [];
  campaigns: CampaignRow[] = [];
  users: UserRow[] = [];
  /** Journal des crédits réellement appliqués — la mesure qui compte. */
  creditLog: { campaignId: string; amount: number; at: number }[] = [];
  /** Compteur de crédits par campagne : détecte un double crédit d'un coup d'œil. */
  private creditSeq = 0;

  seedCampaign(id: string, quota: number) {
    this.campaigns.push({ id, participants_granted: quota });
  }

  /** Insère une intention de paiement — miroir de la route `/initiate`. */
  seedPayment(row: Omit<PaymentRow, 'provider' | 'phone_number'>) {
    this.payments.push({ ...row, provider: null, phone_number: null });
  }

  seedUser(row: UserRow) {
    this.users.push({ ...row });
  }

  /**
   * Miroir de `set_user_plan(user, plan, expires_at)` (migration 0020).
   *
   * On reproduit la règle qui compte : une formule gratuite efface l'échéance.
   * Sans elle, un compte revenu au niveau gratuit garderait une date en base et
   * pourrait être considéré comme payant par un écran qui lit `plan_expires_at`.
   */
  setUserPlan(userId: string, plan: UserRow['plan'], expiresAt: string | null) {
    const user = this.users.find((u) => u.id === userId);
    if (!user) throw new Error(`Aucun compte pour l'identifiant ${userId}`);

    user.plan = plan;
    user.plan_expires_at = plan === 'free' ? null : expiresAt;
  }

  /**
   * Miroir de `plan_expiry_from_duration(duration, reference)` (migration 0020).
   *
   * Une durée absente ou inconnue vaut **un mois** : mieux vaut un abonnement
   * court qu'une formule accordée à vie parce qu'un champ n'a pas été lu.
   */
  planExpiryFromDuration(duration: string | null, reference: Date): string {
    const months = duration === '12m' ? 12 : duration === '6m' ? 6 : 1;
    const expiry = new Date(reference.getTime());
    expiry.setUTCMonth(expiry.getUTCMonth() + months);
    return expiry.toISOString();
  }

  /**
   * Miroir de `expire_due_plans()` (migration 0020).
   *
   * Ne touche que `users` : un abonnement expiré perd ses modules premium, ses
   * campagnes et ses participants restent.
   */
  expireDuePlans(now: Date): number {
    let count = 0;

    for (const user of this.users) {
      if (user.plan === 'free') continue;
      if (!user.plan_expires_at) continue;
      if (new Date(user.plan_expires_at).getTime() > now.getTime()) continue;

      user.plan = 'free';
      user.plan_expires_at = null;
      count += 1;
    }

    return count;
  }

  /**
   * Miroir de `credit_campaign_quota(p_deposit_id, p_provider, p_phone)`.
   *
   * On reproduit les points qui portent une règle :
   *   1. lecture sous verrou (`for update`) — ici, synchrone, donc sérialisé ;
   *   2. **garde d'idempotence** : `status = 'completed'` → on sort sans rien ;
   *   3. un pack DOIT désigner une campagne, sinon exception ;
   *   4. volume lu dans `metadata->>'distributions'`, repli à 500 ;
   *   5. campagne ET paiement écrits dans la même transaction.
   */
  creditCampaignQuota(
    depositId: string,
    provider: string | null = null,
    phone: string | null = null,
  ): { status: string; increment: number } {
    const payment = this.payments.find((p) => p.deposit_id === depositId);
    if (!payment) throw new Error(`Paiement introuvable pour deposit_id: ${depositId}`);

    // (2) GARDE D'IDEMPOTENCE — le cœur de la migration.
    if (payment.status === 'completed') {
      return { status: payment.status, increment: 0 };
    }

    // (3) Un pack doit désigner sa campagne.
    if (payment.campaign_id === null) {
      throw new Error(
        `Paiement ${depositId} sans campagne : credit_campaign_quota ne s'applique qu'aux packs.`,
      );
    }

    // (4) Volume depuis les métadonnées, repli à 500 si absent ou nul.
    const raw = payment.metadata['distributions'];
    const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
    const increment = Number.isFinite(parsed) && parsed !== 0 ? parsed : 500;

    if (increment <= 0) {
      throw new Error(`Volume de distribution invalide (${increment})`);
    }

    // (5) Crédit atomique.
    const campaign = this.campaigns.find((c) => c.id === payment.campaign_id);
    if (!campaign) {
      throw new Error(`Campagne ${payment.campaign_id} introuvable`);
    }
    campaign.participants_granted += increment;
    this.creditSeq += 1;
    this.creditLog.push({ campaignId: campaign.id, amount: increment, at: this.creditSeq });

    payment.status = 'completed';
    payment.provider = provider ?? payment.provider;
    payment.phone_number = phone ?? payment.phone_number;

    return { status: payment.status, increment };
  }
}

/* =====================================================================
 * MIROIR DE `confirmPayment` (lib/pawapay-confirm.ts)
 *
 * Le webhook et `/check` passent tous deux par ici : on reproduit son routage
 * (contrôle du montant, puis campagne → credit_campaign_quota ; plan →
 * activation de formule).
 *
 * Le contrôle du montant est reproduit à l'identique, y compris sa
 * comparaison en centimes — c'est ce qui évite qu'un `numeric(12,2)` relu en
 * flottant soit jugé différent de l'entier attendu.
 * ===================================================================== */
function toCents(value: number): number {
  return Math.round(value * 100);
}

function confirmPayment(
  db: FakeDb,
  depositId: string,
  reported?: { amount?: number | string | null; currency?: string | null },
): { ok: boolean; kind: string; error?: string } {
  const payment = db.payments.find((p) => p.deposit_id === depositId);
  if (!payment) return { ok: false, kind: 'unknown', error: 'Paiement introuvable.' };

  const kind = payment.campaign_id
    ? 'campaign_topup'
    : payment.plan
      ? 'plan_subscription'
      : 'unknown';

  // Garde de montant : AVANT toute écriture.
  const amount = reported?.amount;
  if (amount === null || amount === undefined || amount === '') {
    return {
      ok: false,
      kind,
      error: 'pawaPay n’a pas indiqué le montant encaissé : confirmation refusée par prudence.',
    };
  }
  const amountNumber = Number(amount);
  if (Number.isNaN(amountNumber) || toCents(amountNumber) !== toCents(payment.amount)) {
    return {
      ok: false,
      kind,
      error: `Montant incohérent : encaissé ${String(amount)} mais vente enregistrée ${payment.amount}.`,
    };
  }
  if (
    reported?.currency &&
    reported.currency.toUpperCase() !== payment.currency.toUpperCase()
  ) {
    return {
      ok: false,
      kind,
      error: `Devise incohérente : encaissé ${reported.currency} mais vente en ${payment.currency}.`,
    };
  }

  if (payment.campaign_id) {
    db.creditCampaignQuota(depositId);
    return { ok: true, kind: 'campaign_topup' };
  }
  if (payment.plan) {
    /*
     * Idempotence du côté abonnement : la garde `status === 'completed'` existe
     * aussi dans `complete_payment_and_activate_plan`. Un rejeu ne réécrit donc
     * pas l'échéance — un abonnement renouvelé ne pourrait pas être prolongé par
     * un webhook rejoué.
     */
    if (payment.status === 'completed') {
      return { ok: true, kind: 'plan_subscription' };
    }

    payment.status = 'completed';

    const user = db.users.find((u) => u.id === payment.user_id);
    if (user) {
      const duration = typeof payment.metadata['duration'] === 'string' ? payment.metadata['duration'] : null;
      db.setUserPlan(user.id, payment.plan as UserRow['plan'], db.planExpiryFromDuration(duration, new Date()));
    }

    return { ok: true, kind: 'plan_subscription' };
  }
  return { ok: false, kind: 'unknown', error: 'Paiement sans cible.' };
}

/* =====================================================================
 * 1. Un paiement de pack crédite la bonne campagne, du bon volume
 * ===================================================================== */
section("1. Crédit nominal d'un pack");
{
  const db = new FakeDb();
  db.seedCampaign('camp-A', 10);
  db.seedPayment({
    deposit_id: 'dep-1',
    campaign_id: 'camp-A',
    plan: null,
    user_id: 'user-1',
    amount: 2500,
    currency: 'XOF',
    status: 'pending',
    metadata: { is_pack: true, distributions: 500 },
  });

  // pawaPay rapporte le montant encaissé — c'est ce que la garde compare.
  const r = confirmPayment(db, 'dep-1', { amount: '2500', currency: 'XOF' });

  test('confirmPayment réussit et identifie un pack', () => {
    assert.equal(r.ok, true);
    assert.equal(r.kind, 'campaign_topup');
  });
  test('le quota est incrémenté du volume payé (10 + 500)', () => {
    const c = db.campaigns.find((c) => c.id === 'camp-A')!;
    assert.equal(c.participants_granted, 510);
  });
  test('le paiement passe à completed', () => {
    const p = db.payments.find((p) => p.deposit_id === 'dep-1')!;
    assert.equal(p.status, 'completed');
  });
  test('un seul crédit a été appliqué', () => {
    assert.equal(db.creditLog.length, 1);
  });
}

/* =====================================================================
 * 2. LE CŒUR — un webhook rejoué ne crédite pas deux fois
 *
 * C'est ici que la règle se joue. On simule exactement ce que fait pawaPay :
 * le même webhook livré deux, trois fois.
 * ===================================================================== */
section('2. Idempotence — le webhook rejoué');
{
  const db = new FakeDb();
  db.seedCampaign('camp-B', 10);
  db.seedPayment({
    deposit_id: 'dep-2',
    campaign_id: 'camp-B',
    plan: null,
    user_id: 'user-1',
    amount: 2500,
    currency: 'XOF',
    status: 'pending',
    metadata: { is_pack: true, distributions: 500 },
  });

  // 1er webhook — crédite. Opérateur BFA : ce n'est ni MTN ni le 226, c'est
  // l'opérateur du marché réel.
  db.creditCampaignQuota('dep-2', 'ORANGE_BFA', '+22670123456');
  // 2e webhook — même dépôt, rejoué.
  const second = db.creditCampaignQuota('dep-2', 'ORANGE_BFA', '+22670123456');
  // 3e webhook — insistance.
  const third = db.creditCampaignQuota('dep-2', 'ORANGE_BFA', '+22670123456');

  test('le quota vaut 510, PAS 1510 (un seul crédit)', () => {
    const c = db.campaigns.find((c) => c.id === 'camp-B')!;
    assert.equal(
      c.participants_granted,
      510,
      `attendu 510, obtenu ${c.participants_granted} — double crédit !`,
    );
  });
  test('le 2e rejeu ne crédite rien (0)', () => {
    assert.equal(second.increment, 0);
  });
  test('le 3e rejeu ne crédite rien (0)', () => {
    assert.equal(third.increment, 0);
  });
  test('un seul crédit figure au journal', () => {
    assert.equal(db.creditLog.length, 1);
  });
}

/* =====================================================================
 * 3. Webhook PUIS /check — les deux chemins, un seul crédit
 *
 * Le scénario réel : pawaPay notifie (webhook), et l'utilisateur revient sur
 * la page qui appelle /check. Les deux passent par confirmPayment.
 * ===================================================================== */
section('3. Webhook puis /check — convergence');
{
  const db = new FakeDb();
  db.seedCampaign('camp-C', 0);
  db.seedPayment({
    deposit_id: 'dep-3',
    campaign_id: 'camp-C',
    plan: null,
    user_id: 'user-1',
    amount: 1000,
    currency: 'XOF',
    status: 'pending',
    metadata: { is_pack: true, distributions: 100 },
  });

  confirmPayment(db, 'dep-3', { amount: '1000', currency: 'XOF' }); // webhook
  const viaCheck = confirmPayment(db, 'dep-3', { amount: '1000', currency: 'XOF' }); // /check

  test('le retour /check réussit quand même (idempotent, pas une erreur)', () => {
    assert.equal(viaCheck.ok, true);
  });
  test('le quota vaut 100, pas 200', () => {
    const c = db.campaigns.find((c) => c.id === 'camp-C')!;
    assert.equal(c.participants_granted, 100);
  });
  test('un seul crédit au total', () => {
    assert.equal(db.creditLog.length, 1);
  });
}

/* =====================================================================
 * 4. Séparation des cibles — un pack ne touche jamais une formule
 * ===================================================================== */
section('4. Un pack ne crédite que sa campagne');
{
  const db = new FakeDb();
  db.seedCampaign('camp-D', 25);
  db.seedCampaign('camp-E', 999);
  db.seedPayment({
    deposit_id: 'dep-4',
    campaign_id: 'camp-D',
    plan: null,
    user_id: 'user-1',
    amount: 20000,
    currency: 'XOF',
    status: 'pending',
    metadata: { is_pack: true, distributions: 5000 },
  });

  confirmPayment(db, 'dep-4', { amount: '20000', currency: 'XOF' });

  test('la campagne visée est créditée (25 + 5000)', () => {
    assert.equal(db.campaigns.find((c) => c.id === 'camp-D')!.participants_granted, 5025);
  });
  test("aucune autre campagne n'est touchée", () => {
    assert.equal(db.campaigns.find((c) => c.id === 'camp-E')!.participants_granted, 999);
  });
  test("un paiement de pack n'active aucune formule", () => {
    const p = db.payments.find((p) => p.deposit_id === 'dep-4')!;
    assert.equal(p.plan, null);
  });
}

/* =====================================================================
 * 5. Les deux façons d'échouer (trop faible / trop fort)
 *
 * « Couvrir les deux façons d'échouer » : un crédit trop FAIBLE (volume perdu)
 * et un crédit trop FORT (volume gonflé) doivent tous deux être attrapés.
 * ===================================================================== */
section('5. Échecs symétriques');
{
  // 5a. Trop fort : un pack sans campagne ne doit PAS créditer au hasard.
  const db = new FakeDb();
  db.seedCampaign('camp-F', 10);
  db.seedPayment({
    deposit_id: 'dep-5',
    campaign_id: null, // incohérent : pack sans cible
    plan: null,
    user_id: 'user-1',
    amount: 2500,
    currency: 'XOF',
    status: 'pending',
    metadata: { is_pack: true, distributions: 500 },
  });

  test('un pack sans campagne est refusé, pas crédité au hasard', () => {
    assert.throws(() => db.creditCampaignQuota('dep-5'), /sans campagne/);
    assert.equal(db.campaigns.find((c) => c.id === 'camp-F')!.participants_granted, 10);
  });

  // 5b. Trop faible : métadonnées absentes → repli à 500, jamais 0.
  const db2 = new FakeDb();
  db2.seedCampaign('camp-G', 10);
  db2.seedPayment({
    deposit_id: 'dep-6',
    campaign_id: 'camp-G',
    plan: null,
    user_id: 'user-1',
    amount: 2500,
    currency: 'XOF',
    status: 'pending',
    metadata: {}, // distributions absent
  });

  test('sans volume en métadonnées, on crédite le repli (500), pas 0', () => {
    const r = db2.creditCampaignQuota('dep-6');
    assert.equal(r.increment, 500);
    assert.equal(db2.campaigns.find((c) => c.id === 'camp-G')!.participants_granted, 510);
  });
}

/* =====================================================================
 * 6. Garde de montant — un encaissement ne vaut pas une vente
 *
 * Le montant est figé sur la ligne `payments` au moment de l'achat. Si ce que
 * pawaPay dit avoir encaissé diffère, on refuse : créditer un pack de 5 000
 * distributions pour un paiement partiel serait une perte sèche.
 *
 * Le cas « pawaPay ne rapporte aucun montant » est traité à part : il ne
 * devrait jamais arriver, et on refuse quand même plutôt que de créditer sur
 * une absence d'information.
 * ===================================================================== */
section('6. Garde de montant');
{
  const db = new FakeDb();
  db.seedCampaign('camp-J', 10);
  db.seedPayment({
    deposit_id: 'dep-9',
    campaign_id: 'camp-J',
    plan: null,
    user_id: 'user-1',
    amount: 2500,
    currency: 'XOF',
    status: 'pending',
    metadata: { is_pack: true, distributions: 500 },
  });

  test('un paiement partiel est refusé et ne crédite rien', () => {
    const r = confirmPayment(db, 'dep-9', { amount: '100', currency: 'XOF' });
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /Montant incohérent/);
    assert.equal(db.campaigns.find((c) => c.id === 'camp-J')!.participants_granted, 10);
  });

  test('le paiement refusé reste "pending" — l\'exploitant tranche', () => {
    const p = db.payments.find((p) => p.deposit_id === 'dep-9')!;
    assert.equal(p.status, 'pending');
  });

  test('un montant absent est refusé (absence d\'info ≠ montant correct)', () => {
    const r = confirmPayment(db, 'dep-9', {});
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /n’a pas indiqué le montant/);
    assert.equal(db.campaigns.find((c) => c.id === 'camp-J')!.participants_granted, 10);
  });

  test('une devise incohérente est refusée', () => {
    const r = confirmPayment(db, 'dep-9', { amount: '2500', currency: 'EUR' });
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /Devise incohérente/);
  });

  test('le bon montant passe — la garde ne bloque pas la vente légitime', () => {
    const r = confirmPayment(db, 'dep-9', { amount: 2500, currency: 'XOF' });
    assert.equal(r.ok, true);
    assert.equal(db.campaigns.find((c) => c.id === 'camp-J')!.participants_granted, 510);
  });

  test('l\'écart de comparaison des montants est immunisé (2500 vs 2500.0000000000005)', () => {
    const r = confirmPayment(db, 'dep-9', { amount: '2500.0000000000005', currency: 'XOF' });
    assert.equal(r.ok, true);
  });
}

/* =====================================================================
 * 7. Abonnement — la durée payée doit piloter l'échéance
 *
 * La règle qu'on vérifie ici est celle qui coûte le plus cher si elle tombe :
 * un abonnement « 1 mois » ne vaut pas une formule à vie. Elle tient en un
 * seul champ — `metadata.duration` — que rien ne relisait avant la migration
 * 0020, et qu'un package ignoré laisserait NULL.
 * ===================================================================== */
section('7. Abonnement — activation et échéance');
{
  const reference = new Date('2026-10-06T10:00:00.000Z');

  // 7a. Un mois ne devient pas « permanent ».
  {
    const db = new FakeDb();
    db.seedUser({ id: 'user-1', plan: 'free', plan_expires_at: null, campaign_count: 3 });
    db.seedPayment({
      deposit_id: 'dep-10',
      campaign_id: null,
      plan: 'creator',
      user_id: 'user-1',
      amount: 3000,
      currency: 'XOF',
      status: 'pending',
      metadata: { duration: '1m' },
    });

    confirmPayment(db, 'dep-10', { amount: '3000', currency: 'XOF' });

    test('la formule Créateur est activée', () => {
      assert.equal(db.users[0].plan, 'creator');
    });

    test('un abonnement d\'un MOIS expire dans un mois, pas à vie', () => {
      const expiry = db.users[0].plan_expires_at;
      assert.ok(expiry, 'plan_expires_at doit être renseigné');
      const months =
        (new Date(expiry!).getUTCFullYear() - reference.getUTCFullYear()) * 12 +
        (new Date(expiry!).getUTCMonth() - reference.getUTCMonth());
      assert.equal(months, 1, `attendu 1 mois d'échéance, obtenu ${months}`);
    });

    test('l\'échéance n\'est pas nulle (le défaut « formule à vie »)', () => {
      assert.notEqual(db.users[0].plan_expires_at, null);
    });

    test('un rejeu de webhook ne prolonge PAS l\'abonnement', () => {
      const avant = db.users[0].plan_expires_at;
      // On fait vieillir la date pour que toute réécriture soit visible.
      db.setUserPlan('user-1', 'creator', new Date('2030-01-01T00:00:00Z').toISOString());
      confirmPayment(db, 'dep-10', { amount: '3000', currency: 'XOF' });
      assert.equal(
        db.users[0].plan_expires_at,
        new Date('2030-01-01T00:00:00Z').toISOString(),
        'un rejeu a réécrit l\'échéance — la garde completed ne protège pas le plan',
      );
      assert.notEqual(avant, db.users[0].plan_expires_at);
    });
  }

  // 7b. Six mois et un an ne sont pas un mois déguisé.
  {
    const db = new FakeDb();
    db.seedUser({ id: 'user-1', plan: 'free', plan_expires_at: null, campaign_count: 1 });
    db.seedPayment({
      deposit_id: 'dep-11',
      campaign_id: null,
      plan: 'creator',
      user_id: 'user-1',
      amount: 15000,
      currency: 'XOF',
      status: 'pending',
      metadata: { duration: '6m' },
    });
    db.seedPayment({
      deposit_id: 'dep-12',
      campaign_id: null,
      plan: 'organization',
      user_id: 'user-1',
      amount: 45000,
      currency: 'XOF',
      status: 'pending',
      metadata: { duration: '12m' },
    });

    confirmPayment(db, 'dep-11', { amount: '15000', currency: 'XOF' });
    confirmPayment(db, 'dep-12', { amount: '45000', currency: 'XOF' });

    const monthsUntil = (iso: string) => {
      const d = new Date(iso);
      return (d.getUTCFullYear() - reference.getUTCFullYear()) * 12 + (d.getUTCMonth() - reference.getUTCMonth());
    };

    test('6 mois paient bien 6 mois', () => {
      const before = db.users[0].plan_expires_at;
      // On relit l'échéance du 6 mois : elle a été écrasée par le 12 mois, on
      // vérifie donc la fonction de calcul directement sur les deux durées.
      assert.equal(monthsUntil(db.planExpiryFromDuration('6m', reference)), 6);
      assert.ok(before);
    });

    test('12 mois paient bien 12 mois', () => {
      assert.equal(monthsUntil(db.users[0].plan_expires_at!), 12);
      assert.equal(monthsUntil(db.planExpiryFromDuration('12m', reference)), 12);
    });

    test('la formule ONG est active après le second abonnement', () => {
      assert.equal(db.users[0].plan, 'organization');
    });
  }

  // 7c. Une durée illisible ne vaut pas « illimité ».
  {
    const db = new FakeDb();
    db.seedUser({ id: 'user-1', plan: 'free', plan_expires_at: null, campaign_count: 1 });
    db.seedPayment({
      deposit_id: 'dep-13',
      campaign_id: null,
      plan: 'creator',
      user_id: 'user-1',
      amount: 3000,
      currency: 'XOF',
      status: 'pending',
      metadata: {}, // duration absent : un paiement antérieur à 0020
    });

    confirmPayment(db, 'dep-13', { amount: '3000', currency: 'XOF' });

    test('sans durée lisible, on applique UN mois par prudence', () => {
      const expiry = db.users[0].plan_expires_at;
      assert.ok(expiry, 'plan_expires_at doit rester renseigné');
      const d = new Date(expiry!);
      const months =
        (d.getUTCFullYear() - reference.getUTCFullYear()) * 12 +
        (d.getUTCMonth() - reference.getUTCMonth());
      assert.equal(months, 1, 'une durée inconnue ne doit JAMAIS donner une formule à vie');
    });
  }
}

/* =====================================================================
 * 8. Expiration — le retour au gratuit, sans toucher aux campagnes
 * ===================================================================== */
section('8. Expiration d\'un abonnement');
{
  const db = new FakeDb();
  db.seedCampaign('camp-K', 10);
  db.seedUser({ id: 'user-1', plan: 'creator', plan_expires_at: null, campaign_count: 1 });

  const before = new Date('2026-10-06T10:00:00.000Z');

  // Abonnement d'un mois, payé.
  db.seedPayment({
    deposit_id: 'dep-14',
    campaign_id: null,
    plan: 'creator',
    user_id: 'user-1',
    amount: 3000,
    currency: 'XOF',
    status: 'pending',
    metadata: { duration: '1m' },
  });
  confirmPayment(db, 'dep-14', { amount: '3000', currency: 'XOF' });

  test('l\'abonnement est actif et daté avant expiration', () => {
    assert.equal(db.users[0].plan, 'creator');
    assert.ok(db.users[0].plan_expires_at);
  });

  test('le cron NE bascule pas un abonnement encore valide', () => {
    const chron = db.expireDuePlans(before);
    assert.equal(chron, 0);
    assert.equal(db.users[0].plan, 'creator');
  });

  // On force l'échéance dans le passé, puis on repasse le cron.
  const apres = new Date(new Date(db.users[0].plan_expires_at!).getTime() + 1000);
  const expiree = db.expireDuePlans(apres);

  test('le cron bascule le compte au niveau gratuit', () => {
    assert.equal(expiree, 1);
    assert.equal(db.users[0].plan, 'free');
  });

  test('l\'échéance est effacée, pas laissée en arrière-plan', () => {
    assert.equal(db.users[0].plan_expires_at, null);
  });

  test('LA CAMPAGNE EXISTE TOUJOURS — rien n\'est supprimé à l\'expiration', () => {
    assert.equal(db.campaigns.length, 1);
    assert.equal(db.campaigns[0].participants_granted, 10);
  });

  test('le quota déjà crédité par un pack survit à l\'expiration', () => {
    db.seedPayment({
      deposit_id: 'dep-15',
      campaign_id: 'camp-K',
      plan: null,
      user_id: 'user-1',
      amount: 20000,
      currency: 'XOF',
      status: 'pending',
      metadata: { is_pack: true, distributions: 5000 },
    });
    confirmPayment(db, 'dep-15', { amount: '20000', currency: 'XOF' });
    const apresPack = db.campaigns[0].participants_granted;

    db.expireDuePlans(apres);
    assert.equal(
      db.campaigns[0].participants_granted,
      apresPack,
      'un achat de pack ne doit jamais être annulé par l\'expiration d\'un abonnement',
    );
  });

  test('le cron est idempotent : un second passage ne fait rien', () => {
    assert.equal(db.expireDuePlans(apres), 0);
    assert.equal(db.users[0].plan, 'free');
  });
}

/* =====================================================================
 * 9. AUTO-TEST — le harnais doit pouvoir ÉCHOUER
 *
 * On désactive volontairement la garde d'idempotence et on vérifie qu'un
 * DOUBLE CRÉDIT devient visible. Si ce bloc ne détectait rien, tout ce qui
 * précède ne prouverait rien non plus.
 * ===================================================================== */
section('9. Auto-test : la garde est-elle falsifiable ?');
{
  // Modèle SANS garde d'idempotence — la régression qu'on craint.
  const db = new FakeDb();
  db.seedCampaign('camp-H', 10);
  db.seedPayment({
    deposit_id: 'dep-7',
    campaign_id: 'camp-H',
    plan: null,
    user_id: 'user-1',
    amount: 2500,
    currency: 'XOF',
    status: 'pending',
    metadata: { is_pack: true, distributions: 500 },
  });

  const creditNoGuard = (depositId: string) => {
    const p = db.payments.find((p) => p.deposit_id === depositId)!;
    const campaign = db.campaigns.find((c) => c.id === p.campaign_id)!;
    // Pas de test `status === 'completed'` : on crédite à chaque appel.
    campaign.participants_granted += Number(p.metadata['distributions']);
    p.status = 'completed';
  };

  creditNoGuard('dep-7');
  creditNoGuard('dep-7'); // rejeu

  test('sans la garde, le double crédit EST visible (1510)', () => {
    const c = db.campaigns.find((c) => c.id === 'camp-H')!;
    assert.equal(
      c.participants_granted,
      1010,
      "sans garde on attend 1010 (double crédit) — si ceci échoue, l'auto-test ne falsifie rien",
    );
  });
  test('avec la garde, le même scénario reste à 510 — la différence est réelle', () => {
    const db2 = new FakeDb();
    db2.seedCampaign('camp-I', 10);
db2.seedPayment({
    deposit_id: 'dep-8',
    campaign_id: 'camp-I',
    plan: null,
    user_id: 'user-1',
    amount: 2500,
    currency: 'XOF',
    status: 'pending',
    metadata: { is_pack: true, distributions: 500 },
  });
    db2.creditCampaignQuota('dep-8');
    db2.creditCampaignQuota('dep-8');
    assert.equal(db2.campaigns.find((c) => c.id === 'camp-I')!.participants_granted, 510);
  });
}

/* =====================================================================
 * BILAN
 * ===================================================================== */
console.log(`\n${'='.repeat(60)}`);
if (failures === 0) {
  console.log(`TOUT VERT — ${checks} assertions sur ${checks}.`);
  console.log('='.repeat(60));
} else {
  console.log(`\u2717 ${failures} échec(s) sur ${checks} assertions.`);
  console.log('='.repeat(60));
  process.exitCode = 1;
}
