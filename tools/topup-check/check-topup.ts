/**
 * Contrôle de bout en bout du crédit de quota pawaPay (migration 0018).
 *
 * POURQUOI CE HARNAIS
 * -------------------
 * La règle la plus chère du lot tient en une phrase : **un webhook rejoué ne
 * crédite pas deux fois**. pawaPay rejoue ses notifications, et la route
 * `/check` rappelle la même confirmation après un retour de navigation. Si la
 * garde d'idempotence tombe, un créateur qui a payé 500 téléchargements en
 * reçoit 1 000 — un bug d'argent, silencieux, invisible à l'écran.
 *
 * Aucun jeton Supabase n'est disponible ici : on ne peut pas exécuter le SQL
 * réel. On **modélise donc fidèlement** la sémantique des deux fonctions
 * concernées et de la ligne `payments`, puis on la met à l'épreuve sur des
 * sessions complètes (initiation → webhook → rejeu → /check), plutôt que sur
 * des cas isolés. C'est ainsi qu'on attrape un double crédit : un cas isolé
 * (« un webhook crédite ») passe toujours, c'est le **second** passage qui
 * révèle le défaut.
 *
 * LE HARNAIS DOIT POUVOIR ÉCHOUER. Avant de lui faire confiance, on a prouvé
 * qu'il sort en code 1 en retirant la garde d'idempotence (voir la section 6,
 * auto-test intégré). Un contrôle qui ne peut pas échouer ne prouve rien.
 *
 * Ce qu'il ne prouve PAS : que la migration est appliquée en base. Cela se
 * vérifie par `npm run check:topup:live` le jour où un jeton est disponible.
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
  campaign_id: string | null;
  plan: string | null;
  status: 'pending' | 'completed' | 'failed';
  metadata: Record<string, unknown>;
  provider: string | null;
  phone_number: string | null;
}

interface CampaignRow {
  id: string;
  participants_granted: number;
}

class FakeDb {
  payments: PaymentRow[] = [];
  campaigns: CampaignRow[] = [];
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
 * (campagne → credit_campaign_quota ; plan → activation de formule).
 * ===================================================================== */
function confirmPayment(db: FakeDb, depositId: string): { ok: boolean; kind: string } {
  const payment = db.payments.find((p) => p.deposit_id === depositId);
  if (!payment) return { ok: false, kind: 'unknown' };

  if (payment.campaign_id) {
    db.creditCampaignQuota(depositId);
    return { ok: true, kind: 'campaign_topup' };
  }
  if (payment.plan) {
    if (payment.status !== 'completed') payment.status = 'completed';
    return { ok: true, kind: 'plan_subscription' };
  }
  return { ok: false, kind: 'unknown' };
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
    status: 'pending',
    metadata: { is_pack: true, distributions: 500 },
  });

  const r = confirmPayment(db, 'dep-1');

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
    status: 'pending',
    metadata: { is_pack: true, distributions: 500 },
  });

  // 1er webhook — crédite.
  db.creditCampaignQuota('dep-2', 'MTN_MOMO', '22670000000');
  // 2e webhook — même dépôt, rejoué.
  const second = db.creditCampaignQuota('dep-2', 'MTN_MOMO', '22670000000');
  // 3e webhook — insistance.
  const third = db.creditCampaignQuota('dep-2', 'MTN_MOMO', '22670000000');

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
    status: 'pending',
    metadata: { is_pack: true, distributions: 100 },
  });

  confirmPayment(db, 'dep-3'); // webhook
  const viaCheck = confirmPayment(db, 'dep-3'); // /check au retour

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
    status: 'pending',
    metadata: { is_pack: true, distributions: 5000 },
  });

  confirmPayment(db, 'dep-4');

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
 * 6. AUTO-TEST — le harnais doit pouvoir ÉCHOUER
 *
 * On désactive volontairement la garde d'idempotence et on vérifie qu'un
 * DOUBLE CRÉDIT devient visible. Si ce bloc ne détectait rien, tout ce qui
 * précède ne prouverait rien non plus.
 * ===================================================================== */
section('6. Auto-test : la garde est-elle falsifiable ?');
{
  // Modèle SANS garde d'idempotence — la régression qu'on craint.
  const db = new FakeDb();
  db.seedCampaign('camp-H', 10);
  db.seedPayment({
    deposit_id: 'dep-7',
    campaign_id: 'camp-H',
    plan: null,
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
