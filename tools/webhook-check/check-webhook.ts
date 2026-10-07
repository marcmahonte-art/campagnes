/**
 * Simulation du webhook de confirmation — AUCUNE base, AUCUN débit.
 *
 * POURQUOI CE HARNAIS
 * -------------------
 * `tools/topup-check/check-topup.ts` modélise les fonctions SQL : il prouve
 * qu'un crédit n'est pas appliqué deux fois. Il ne couvre PAS la route qui
 * reçoit les notifications, ni l'ordre dans lequel celles-ci arrivent. Or
 * pawaPay rejoue ses callbacks, et un rejeu peut arriver **après** qu'un autre
 * chemin (`/check`) a déjà confirmé le paiement.
 *
 * La question que ce harnais pose est donc celle de la **cohérence comptable**,
 * pas celle du crédit :
 *
 *   - une notification d'échec arrivant APRÈS une confirmation doit-elle
 *     effacer l'état « completed » alors que le quota a déjà été crédité ?
 *   - un montant encaissé différent du montant vendu doit-il laisser le
 *     paiement en attente ?
 *   - une devise différente, un paiement introuvable, une ligne sans cible ?
 *
 * On modélise `confirmPayment` et la route webhook **fidèlement** : mêmes
 * décisions, même ordre des contrôles. Aucun appel réseau, aucune écriture en
 * base, aucun paiement créé.
 *
 * LE HARNAIS DOIT POUVOIR ÉCHOUER : la section 5 prouve qu'il détecte la
 * régression qu'il prétend couvrir. Un contrôle qui ne peut pas échouer ne
 * prouve rien.
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
 * MODÈLE — miroir de `lib/pawapay-confirm.ts` et de la route webhook
 * ===================================================================== */

type PaymentStatus = 'pending' | 'completed' | 'failed';
type PurchaseType = 'plan' | 'campaign_topup' | 'account_credits' | null;

interface PaymentRow {
  deposit_id: string;
  user_id: string;
  campaign_id: string | null;
  plan: string | null;
  purchase_type: PurchaseType;
  amount: number;
  currency: string;
  status: PaymentStatus;
  failure_code?: string | null;
}

interface ConfirmInput {
  depositId: string;
  amount?: string | number | null;
  currency?: string | null;
}

interface ConfirmResult {
  ok: boolean;
  kind: 'campaign_topup' | 'account_credits' | 'plan_subscription' | 'unknown';
  error?: string;
}

class FakeDb {
  payments: PaymentRow[] = [];
  /** Journal des crédits réellement appliqués — la mesure qui compte. */
  creditLog: { depositId: string; target: string; at: number }[] = [];

  seed(row: PaymentRow) {
    this.payments.push({ ...row });
  }

  find(depositId: string) {
    return this.payments.find((p) => p.deposit_id === depositId) ?? null;
  }

  /**
   * Miroir de `confirmPayment`.
   *
   * L'ordre est celui du code réel : nature → montant → devise → écriture. Le
   * montant est contrôlé AVANT toute écriture, c'est tout l'enjeu.
   */
  confirm(input: ConfirmInput): ConfirmResult {
    const row = this.find(input.depositId);
    if (!row) return { ok: false, kind: 'unknown', error: 'Paiement introuvable.' };

    const kind: ConfirmResult['kind'] =
      row.purchase_type === 'campaign_topup'
        ? 'campaign_topup'
        : row.purchase_type === 'account_credits'
          ? 'account_credits'
          : row.plan
            ? 'plan_subscription'
            : 'unknown';

    const expected = row.amount;
    const reported = input.amount;

    if (reported === null || reported === undefined || reported === '') {
      return { ok: false, kind, error: 'Montant encaissé absent.' };
    }

    const reportedNumber = Number(reported);
    if (Number.isNaN(reportedNumber)) {
      return { ok: false, kind, error: 'Montant illisible.' };
    }

    if (Math.round(reportedNumber * 100) !== Math.round(expected * 100)) {
      return { ok: false, kind, error: `Montant incohérent : ${reportedNumber} ≠ ${expected}.` };
    }

    if (
      input.currency &&
      row.currency &&
      input.currency.toUpperCase() !== row.currency.toUpperCase()
    ) {
      return { ok: false, kind, error: `Devise incohérente : ${input.currency} ≠ ${row.currency}.` };
    }

    if (!row.campaign_id && row.purchase_type !== 'account_credits' && !row.plan) {
      return { ok: false, kind, error: 'Paiement sans cible.' };
    }

    // Les fonctions SQL portent la garde `pending → completed` : on la modélise.
    if (row.status !== 'completed') {
      row.status = 'completed';
      this.creditLog.push({
        depositId: row.deposit_id,
        target: row.campaign_id ?? row.plan ?? 'portefeuille',
        at: Date.now(),
      });
    }

    return { ok: true, kind };
  }

  /**
   * Miroir de la branche `FAILED` du webhook.
   *
   * `terminalOnly` traduit la correction proposée : une notification d'échec ne
   * doit pas écraser un paiement déjà finalisé. Sans ce paramètre, on reproduit
   * le comportement actuel, qui écrase.
   */
  markFailed(depositId: string, code: string, terminalOnly = false): number {
    const row = this.find(depositId);
    if (!row) return 0;
    if (terminalOnly && row.status !== 'pending') return 0;

    row.status = 'failed';
    row.failure_code = code;
    return 1;
  }

  credits(depositId: string) {
    return this.creditLog.filter((c) => c.depositId === depositId).length;
  }
}

const DEPOSIT = '11111111-1111-4111-8111-111111111111';

function dbWithTopup(): FakeDb {
  const db = new FakeDb();
  db.seed({
    deposit_id: DEPOSIT,
    user_id: 'user-1',
    campaign_id: 'camp-1',
    plan: null,
    purchase_type: 'campaign_topup',
    amount: 5000,
    currency: 'XOF',
    status: 'pending',
  });
  return db;
}

/* =====================================================================
 * 1. Le chemin nominal
 * ===================================================================== */

section('1. Confirmation nominale');

test('un paiement conforme est confirmé et crédité une fois', () => {
  const db = dbWithTopup();
  const result = db.confirm({ depositId: DEPOSIT, amount: '5000', currency: 'XOF' });
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'campaign_topup');
  assert.equal(db.credits(DEPOSIT), 1);
  assert.equal(db.find(DEPOSIT)!.status, 'completed');
});

test('un montant reçu sous forme de nombre est accepté', () => {
  const db = dbWithTopup();
  assert.equal(db.confirm({ depositId: DEPOSIT, amount: 5000, currency: 'XOF' }).ok, true);
  assert.equal(db.credits(DEPOSIT), 1);
});

/* =====================================================================
 * 2. Idempotence — le cœur du sujet, pawaPay rejoue
 * ===================================================================== */

section('2. Rejeu du webhook');

test('un webhook rejoué ne crédite pas deux fois', () => {
  const db = dbWithTopup();
  db.confirm({ depositId: DEPOSIT, amount: '5000', currency: 'XOF' });
  const second = db.confirm({ depositId: DEPOSIT, amount: '5000', currency: 'XOF' });
  assert.equal(second.ok, true, 'un rejeu est un succès idempotent, pas une erreur');
  assert.equal(db.credits(DEPOSIT), 1, 'un seul crédit');
});

test('webhook puis réconciliation : toujours un seul crédit', () => {
  const db = dbWithTopup();
  db.confirm({ depositId: DEPOSIT, amount: '5000', currency: 'XOF' });
  db.confirm({ depositId: DEPOSIT, amount: '5000', currency: 'XOF' });
  db.confirm({ depositId: DEPOSIT, amount: '5000', currency: 'XOF' });
  assert.equal(db.credits(DEPOSIT), 1);
  assert.equal(db.find(DEPOSIT)!.status, 'completed');
});

/* =====================================================================
 * 3. Les refus qui protègent l'argent
 * ===================================================================== */

section('3. Refus avant écriture');

test('un montant inférieur ne crédite rien et laisse le paiement en attente', () => {
  const db = dbWithTopup();
  const result = db.confirm({ depositId: DEPOSIT, amount: '100', currency: 'XOF' });
  assert.equal(result.ok, false);
  assert.equal(db.credits(DEPOSIT), 0);
  assert.equal(db.find(DEPOSIT)!.status, 'pending');
});

test('un montant absent est refusé par prudence', () => {
  const db = dbWithTopup();
  assert.equal(db.confirm({ depositId: DEPOSIT, amount: null, currency: 'XOF' }).ok, false);
  assert.equal(db.credits(DEPOSIT), 0);
});

test('une devise différente ne crédite rien', () => {
  const db = dbWithTopup();
  assert.equal(db.confirm({ depositId: DEPOSIT, amount: '5000', currency: 'EUR' }).ok, false);
  assert.equal(db.credits(DEPOSIT), 0);
});

test('un dépôt inconnu ne crée rien', () => {
  const db = dbWithTopup();
  const result = db.confirm({ depositId: 'inconnu', amount: '5000', currency: 'XOF' });
  assert.equal(result.ok, false);
  assert.equal(db.creditLog.length, 0);
});

/* =====================================================================
 * 4. LA RÉGRESSION : un échec tardif ne doit pas effacer une confirmation
 * ===================================================================== */

section('4. Notification d’échec après confirmation');

test('comportement attendu : un échec tardif ne dégrade pas un paiement confirmé', () => {
  const db = dbWithTopup();
  db.confirm({ depositId: DEPOSIT, amount: '5000', currency: 'XOF' });

  const touched = db.markFailed(DEPOSIT, 'LATE_FAILURE', true);

  assert.equal(touched, 0, 'aucune ligne modifiée');
  assert.equal(db.find(DEPOSIT)!.status, 'completed', 'le statut reste final');
  assert.equal(db.credits(DEPOSIT), 1, 'le crédit reste comptabilisé');
});

test('un échec sur un paiement encore en attente reste enregistré', () => {
  const db = dbWithTopup();
  const touched = db.markFailed(DEPOSIT, 'REAL_FAILURE', true);
  assert.equal(touched, 1);
  assert.equal(db.find(DEPOSIT)!.status, 'failed');
  assert.equal(db.credits(DEPOSIT), 0);
});

/* =====================================================================
 * 5. Auto-test — le harnais peut-il échouer ?
 * ===================================================================== */

section('5. Auto-test : la garde est-elle falsifiable ?');

test('sans la garde d’état final, la régression EST visible', () => {
  const db = dbWithTopup();
  db.confirm({ depositId: DEPOSIT, amount: '5000', currency: 'XOF' });

  // Comportement NON corrigé : la notification d'échec écrase tout.
  const touched = db.markFailed(DEPOSIT, 'LATE_FAILURE', false);

  assert.equal(touched, 1, 'la ligne est bien écrasée sans la garde');
  assert.equal(
    db.find(DEPOSIT)!.status,
    'failed',
    'preuve : le paiement confirmé est repassé en échec',
  );
  assert.equal(
    db.credits(DEPOSIT),
    1,
    'et le quota reste crédité — l’écart statut/crédit est exactement le bug',
  );
});

console.log(`\n=== ${checks - failures} réussis / ${failures} échoués ===`);
process.exit(failures === 0 ? 0 : 1);
