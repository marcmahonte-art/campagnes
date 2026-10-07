import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/backend/config';

/**
 * Expiration des abonnements — tâche quotidienne.
 *
 * Appelle `expire_due_plans()` (migration 0020), qui ramène à la formule
 * gratuite les comptes dont l'échéance de leur formule payante est passée.
 *
 * Deux raisons pour que ce soit un cron et non une lecture à chaque requête :
 *   - la formule lue est celle en base ; la faire expirer « à la volée » au
 *     prochain chargement de page laisserait le compte marqué payant entre
 *     l'échéance et la visite, et ferait diverger la facturation de l'affichage ;
 *   - un balayage quotidien est une seule écriture par compte échu, au lieu
 *     d'une écriture par page vue.
 *
 * Le verrou `for update skip locked` de la fonction SQL rend l'exécution
 * concurrente inoffensive : un second passage (redéploiement, cron qui se
 * recouvre) ne fait rien et ne casse rien.
 */

/**
 * Vérifie le jeton du cron.
 *
 * `x-vercel-cron` est posé par Vercel lui-même sur ses appels planifiés. On
 * accepte aussi un jeton explicite (`CRON_SECRET`), utile pour un déclenchement
 * manuel depuis un autre poste — et pour tester.
 *
 * Sans cela, la route serait publique : n'importe qui pourrait la appeler en
 * boucle.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();

  if (secret) {
    const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (provided && provided === secret) return true;
  }

  /*
   * En développement, on laisse passer si aucun secret n'est configuré — sinon
   * impossible de tester le cron en local. En production, l'absence de
   * `CRON_SECRET` ferme la porte à tout le monde : un cron qui ne fonctionne
   * pas est préférable à une route publique.
   */
  if (!secret && process.env.NODE_ENV !== 'production') return true;

  return request.headers.get('x-vercel-cron') !== null;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  if (!isSupabaseConfigured) {
    console.log('[Cron] Expiration des abonnements ignorée : Supabase non configuré.');
    return NextResponse.json({ expired: 0, mode: 'demo' });
  }

  try {
    const admin = supabaseAdmin();

    const { data, error } = await admin.rpc('expire_due_plans');

    if (error) {
      /*
       * `expire_due_plans` est créée par la migration 0020. Sur un environnement
       * où elle n'est pas encore appliquée, on le dit clairement plutôt que de
       * laisser croire que tout est normal.
       */
      console.error('[Cron] Échec de expire_due_plans() :', error);
      return NextResponse.json(
        {
          error: 'Échec de l’expiration des abonnements.',
          detail: 'La migration 0020_plan_expiry.sql est-elle appliquée ?',
        },
        { status: 500 },
      );
    }

    const expired = typeof data === 'number' ? data : 0;
    console.log(`[Cron] ${expired} abonnement(s) arrivé(s) à échéance, remis(s) au niveau gratuit.`);

    return NextResponse.json({ expired });
  } catch (err: unknown) {
    console.error('[Cron] Erreur expiration des abonnements :', err);
    return NextResponse.json(
      { error: 'Erreur interne du cron.' },
      { status: 500 },
    );
  }
}