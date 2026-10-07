import type { DistributionExportReceipt, DistributionExportRequest, Result } from './backend/types';

export class PrivateExportUnavailable extends Error {}
export interface PreparedPrivateExport { blob: Blob; filename: string }
interface PendingExport { operation: DistributionExportRequest; file?: PreparedPrivateExport; confirmed?: boolean }
export type ExportTransport = (action: 'reserve' | 'status' | 'confirm' | 'cancel' | 'renew', operation: DistributionExportRequest) => Promise<Result<DistributionExportReceipt>>;

/** Une instance par parcours : le fichier reste local, le reçu reste reprenable. */
export class PrivateExportCoordinator {
  private pending: PendingExport | null = null;
  private busy = false;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, private key: string, private transport: ExportTransport) {
    const saved = storage.getItem(key);
    if (saved) {
      const operation = JSON.parse(saved) as DistributionExportRequest;
      if (!/^[0-9a-f-]{36}$/i.test(operation.operationId) || !/^[0-9a-f]{64}$/.test(operation.secret) || !/^[0-9a-f]{64}$/.test(operation.descriptorHash) || !['png', 'video'].includes(operation.format)) throw new Error('La reprise locale est illisible. Fermez cet onglet puis rouvrez le lien.');
      this.pending = { operation };
    }
  }
  get confirmedFile(): PreparedPrivateExport | null { return this.pending?.confirmed ? this.pending.file ?? null : null; }
  private async call(action: Parameters<ExportTransport>[0]): Promise<DistributionExportReceipt> {
    const result = await this.transport(action, this.pending!.operation);
    if (result.error || !result.data) throw new Error(result.error ?? 'La réponse est incertaine. Réessayez la même opération.');
    return result.data;
  }
  private clear() { this.storage.removeItem(this.key); this.pending = null; }
  async run(format: 'png' | 'video', descriptorHash: string, render: () => Promise<PreparedPrivateExport>): Promise<PreparedPrivateExport> {
    if (this.busy) throw new Error('Une préparation est déjà en cours.');
    this.busy = true;
    let renewal: ReturnType<typeof setInterval> | undefined;
    try {
      if (this.pending && (this.pending.operation.format !== format || this.pending.operation.descriptorHash !== descriptorHash)) {
        // Un changement de composition n'efface jamais une réservation incertaine.
        const cancelled = await this.call('cancel');
        if (cancelled.state === 'RESERVED') throw new Error('Terminez ou annulez la préparation précédente avant de recommencer.');
        this.clear();
      }
      if (!this.pending) {
        const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, '0')).join('');
        const operation = { operationId: crypto.randomUUID(), secret, format, descriptorHash };
        // Écrire AVANT le réseau : une réponse perdue doit rester récupérable.
        this.storage.setItem(this.key, JSON.stringify(operation));
        this.pending = { operation };
      }
      const reserved = await this.call('reserve');
      if (reserved.state !== 'RESERVED' && reserved.state !== 'CONFIRMED') {
        this.clear();
        throw new PrivateExportUnavailable('Ce lien ne permet pas de nouvel export. Contactez son créateur.');
      }
      if (reserved.state === 'RESERVED') renewal = setInterval(() => { void this.call('renew').catch(() => {}); }, 60000);
      if (!this.pending.file) {
        try { this.pending.file = await render(); }
        catch (error) {
          if (reserved.state !== 'CONFIRMED') {
            try { await this.call('cancel'); this.clear(); } catch { /* Reprise conservée ; expiration bornée côté base. */ }
          }
          throw error;
        }
      }
      const confirmed = await this.call('confirm');
      if (confirmed.state !== 'CONFIRMED' || !confirmed.receipt) {
        this.clear();
        throw new PrivateExportUnavailable('La préparation n’a pas été confirmée. Ce lien est indisponible.');
      }
      this.pending.confirmed = true;
      return this.pending.file;
    } finally { if (renewal) clearInterval(renewal); this.busy = false; }
  }
}

export async function technicalHash(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
