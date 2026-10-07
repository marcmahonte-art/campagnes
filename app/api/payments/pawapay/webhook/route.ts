import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured, SITE_URL } from '@/lib/backend/config';
import { confirmPayment } from '@/lib/pawapay-confirm';
import { verifyPawaPayCallback } from '@/lib/pawapay-signature';

interface PawaPayWebhookPayload {
  depositId: string;
  status: 'COMPLETED' | 'FAILED' | 'ACCEPTED' | 'SUBMITTED' | string;
  amount?: string | number;
  currency?: string;
  payer?: {
    type?: string;
    accountDetails?: {
      phoneNumber?: string;
      provider?: string;
    };
  };
  failureReason?: {
    failureCode?: string;
    failureMessage?: string;
  };
}

/**
 * Autorités que pawaPay a pu signer.
 *
 * pawaPay signe l'hôte **de l'URL de callback configurée dans son Dashboard**,
 * pas l'en-tête `Host` que Vercel nous réécrit. On propose donc le domaine
 * public en premier, puis les valeurs issues des en-têtes de la requête.
 */
function authorityCandidates(request: NextRequest): string[] {
  const candidates: string[] = [];

  const configured = SITE_URL ? new URL(SITE_URL).host : '';
  if (configured && configured !== 'localhost:3000') {
    candidates.push(configured);
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    for (const value of forwardedHost.split(',')) {
      const host = value.trim();
      if (host && !candidates.includes(host)) candidates.push(host);
    }
  }

  const host = request.headers.get('host');
  if (host && !candidates.includes(host)) candidates.push(host);

  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (vercelUrl && !candidates.includes(vercelUrl)) candidates.push(vercelUrl);

  if (candidates.length === 0) candidates.push('localhost:3000');

  return candidates;
}

/** En-têtes de la requête, normalisés en minuscules comme le veut la RFC 9421. */
function collectHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

/**
 * Vérification que l'URL de callback est bien la bonne.
 *
 * PawaPay n'envoie que des `POST`. Un `GET` ici — celui d'un navigateur, ou d'un
 * test de saisie de l'URL dans le Dashboard — répondait 405, ce qui se lisait
 * comme une route cassée alors que le canal de paiement fonctionnait.
 *
 * Cette route ne fait **rien** : elle ne crédite, ne confirme, ne lit aucun
 * paiement. Elle répond 200 et le dit, pour qu'une URL collée dans le Dashboard
 * pawaPay ou ouverte à la main donne une réponse lisible.
 *
 * Elle ne renvoie ni l'état d'un dépôt, ni le nom d'un opérateur, ni le moindre
 * détail sur l'intégration : à quoi bon ouvrir une porte informative quand
 * pawaPay n'a rien à y demander.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: 'pawaPay deposit callback',
    accepts: 'POST',
    note: 'Les callbacks pawaPay arrivent en POST. Cette route ne se consulte pas depuis un navigateur.',
  });
}

export async function POST(request: NextRequest) {
  try {
    /*
     * Le corps est lu **en une seule fois**, en texte brut, puis passé au
     * vérificateur de signature et au `JSON.parse` qui suit.
     *
     * L'ordre est important : `request.json()` consommerait le corps et le
     * re-sérialiser ne redonne pas les mêmes octets (l'ordre des clés n'est pas
     * garanti), donc `Content-Digest` ne concorderait jamais. On lit donc le
     * texte une fois, on le vérifie, et on ne l'analyse qu'ensuite.
     */
    const rawBody = await request.text();

    const verification = await verifyPawaPayCallback({
      rawBody,
      method: request.method,
      path: request.nextUrl.pathname,
      query: request.nextUrl.search.replace(/^\?/, ''),
      authorityCandidates: authorityCandidates(request),
      headers: collectHeaders(request),
    });

    if (!verification.ok) {
      /*
       * On répond 401 et **rien d'autre** : ni la nature du paiement, ni le
       * motif n'est detailed à l'appelant. Un attaquant qui teste des
       * `depositId` ne doit pas apprendre si le paiement existe.
       */
      console.error('[pawaPay Webhook] Callback rejeté :', verification.reason);
      return NextResponse.json({ error: 'Callback non authentifié.' }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'JSON payload invalide.' }, { status: 400 });
    }

    const items: PawaPayWebhookPayload[] = Array.isArray(payload)
      ? (payload as PawaPayWebhookPayload[])
      : [payload as PawaPayWebhookPayload];

    if (!items.length || !items[0]?.depositId) {
      return NextResponse.json({ error: 'depositId manquant dans le payload.' }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      console.warn('[pawaPay Webhook] Supabase non configuré. Notification reçue en mode local :', items);
      return NextResponse.json({ received: true, mode: 'local' });
    }

    const admin = supabaseAdmin();

    for (const item of items) {
      const depositId = item.depositId;
      const status = item.status;
      const provider = item.payer?.accountDetails?.provider ?? null;
      const phoneNumber = item.payer?.accountDetails?.phoneNumber ?? null;

      console.log(`[pawaPay Webhook] Traitement depositId=${depositId}, status=${status}`);

      if (status === 'COMPLETED') {
        /*
         * Confirmation via le point unique (`lib/pawapay-confirm.ts`) : il
         * choisit entre crédit de quota de campagne et activation de formule
         * selon la ligne `payments`, **après** avoir vérifié que le montant
         * reçu correspond à celui attendu. Les deux fonctions SQL sont
         * idempotentes, donc un webhook rejoué par pawaPay ne crédite jamais
         * deux fois.
         */
        const result = await confirmPayment(admin, {
          depositId,
          provider,
          phone: phoneNumber,
          amount: item.amount,
          currency: item.currency,
        });

        if (!result.ok) {
          /*
           * On journalise sans jeter : un 5xx ferait rejouer pawaPay
           * indéfiniment sur une erreur qui ne se résoudra pas toute seule
           * (paiement introuvable, montant incohérent). On répond 200 pour
           * acquitter, et l'exploitant voit l'anomalie dans les logs.
           */
          console.warn(
            `[pawaPay Webhook] Confirmation NON aboutie (depositId=${depositId}, nature=${result.kind}) : ${result.error}`,
          );
        } else {
          console.log(
            `[pawaPay Webhook] Succès (${result.kind}) pour depositId=${depositId}`,
          );
        }
      } else if (status === 'FAILED') {
        const failureCode = item.failureReason?.failureCode ?? 'UNKNOWN_FAILURE';
        const failureMessage = item.failureReason?.failureMessage ?? 'Le paiement a échoué.';

        /*
         * Un échec n'écrase JAMAIS un paiement déjà finalisé.
         *
         * pawaPay rejoue ses notifications, et `/check` a pu confirmer le
         * paiement entre-temps : sans le filtre `status = 'pending'`, un
         * `FAILED` tardif repassait la ligne en « failed » alors que le quota
         * ou la formule étaient déjà crédités. L'écart était invisible à
         * l'écran et indétectable en réconciliation : le compteur disait
         * « crédité », la commande disait « échec ».
         *
         * Le filtre porte la garde : c'est la base qui décide, pas le code.
         * Zéro ligne modifiée n'est pas une erreur — c'est la preuve que la
         * notification arrivait trop tard pour être honorée.
         */
        const { data: marked, error: failedError } = await admin
          .from('payments')
          .update({
            status: 'failed',
            failure_code: failureCode,
            failure_message: failureMessage,
            updated_at: new Date().toISOString(),
          })
          .eq('deposit_id', depositId)
          .eq('status', 'pending')
          .select('deposit_id');

        if (failedError) {
          console.warn(
            `[pawaPay Webhook] Échec non enregistré (depositId=${depositId}) : ${failedError.message}`,
          );
        } else if (marked && marked.length === 0) {
          console.warn(
            `[pawaPay Webhook] Échec ignoré (depositId=${depositId}) : paiement déjà finalisé, l'état n'est pas dégradé.`,
          );
        } else {
          console.log(`[pawaPay Webhook] Échec enregistré pour depositId=${depositId}: ${failureCode}`);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error('[pawaPay Webhook] Erreur traitement webhook :', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur interne webhook.' },
      { status: 500 },
    );
  }
}