import { adminError, adminJson, requireAdmin } from '@/lib/admin/guard';
import { getSystemHealth, listAuditLog } from '@/lib/admin/repository';

/**
 * État technique et journal.
 *
 * Les chiffres ici sont des **signaux d'exploitation**, pas des métriques
 * commerciales : un paiement resté en attente n'est pas un revenu, c'est une
 * réconciliation à faire. Aucune clé, aucun jeton, aucun payload de webhook ne
 * sort de cette route.
 */
export async function GET() {
  const guard = await requireAdmin('admin:read');
  if (!guard.ok) return guard.response;

  try {
    const health = await getSystemHealth();
    /*
     * Le journal est réservé aux rôles qui ont le droit de le lire : c'est
     * l'historique des actions d'administration, pas un tableau de bord de
     * plus. Un compte en lecture simple ne le voit donc pas.
     */
    const audit = guard.admin.role === 'super_admin' ? await listAuditLog(50) : [];

    return adminJson({
      ok: true,
      health,
      audit,
      auditVisible: guard.admin.role === 'super_admin',
      definitions: {
        stalePendingPayments: 'Paiements en attente depuis plus de 30 minutes : à réconcilier auprès de la passerelle.',
        recentFailedPayments: 'Paiements en échec au cours des dernières 24 h.',
        reservedExportOperations: 'Exports réservés mais jamais confirmés.',
        exhaustedCampaigns: 'Campagnes ayant consommé tout leur quota.',
      },
    });
  } catch (error) {
    return adminError(
      error instanceof Error ? error.message : 'Lecture de l’état système impossible.',
      500,
    );
  }
}
