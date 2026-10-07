/**
 * Vérification d'une clé Mobile Money — LECTURE SEULE, aucun paiement créé.
 *
 * Pourquoi ce script existe : le message « Le service de paiement Mobile Money
 * n'a pas répondu correctement » est volontairement vague côté navigateur. Il
 * peut venir d'une clé refusée, d'une clé valide mais du mauvais environnement,
 * ou d'une configuration de compte absente. Sans ce contrôle, on remplace la
 * clé au hasard et on ne sait toujours pas ce qui est cassé.
 *
 * Ce qu'il fait :
 *   1. appelle `GET /v2/active-conf`, la route officielle de configuration du
 *      compte — une lecture qui n'initie aucun dépôt, aucun débit, aucun SMS ;
 *   2. distingue « clé refusée » de « clé acceptée mais compte non configuré » ;
 *   3. teste aussi l'environnement opposé, parce que les clés du bac à sable et
 *      de production ne sont PAS interchangeables.
 *
 * Ce qu'il ne fait jamais : aucune initiation de paiement, aucun montant, aucun
 * numéro de téléphone. La clé n'est jamais affichée, même partiellement.
 *
 * Usage :
 *   npx ts-node -O "{\"module\":\"commonjs\"}" scripts/check_pawapay_token.ts
 *   PAWAPAY_BASE_URL=https://api.pawapay.io npx ts-node … (pour forcer un hôte)
 */

import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const SANDBOX = 'https://api.sandbox.pawapay.io';
const PRODUCTION = 'https://api.pawapay.io';

/** Masque systématiquement la clé : aucune sortie ne doit la contenir. */
function redact(text: string, secret: string): string {
  return secret ? text.split(secret).join('[MASQUÉ]') : text;
}

interface Failure {
  failureCode?: string;
  failureMessage?: string;
}

async function probe(baseUrl: string, token: string, country = 'BFA') {
  const url = `${baseUrl.replace(/\/$/, '')}/v2/active-conf?country=${country}&operationType=DEPOSIT`;
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await response.json().catch(() => ({}))) as {
      companyName?: string;
      countries?: unknown[];
      failureReason?: Failure | string;
    };

    const failure =
      typeof body.failureReason === 'string'
        ? { failureMessage: body.failureReason }
        : body.failureReason;

    return { status: response.status, body, failure };
  } catch (error) {
    const code = (error as { cause?: { code?: string } })?.cause?.code;
    return { status: 0, body: {}, failure: { failureMessage: `Réseau injoignable (${code ?? 'inconnu'})` } };
  }
}

function verdict(label: string, result: Awaited<ReturnType<typeof probe>>, token: string) {
  console.log(`\n${label}`);

  if (result.status === 200) {
    console.log('  Clé acceptée : oui');
    console.log(`  Compte : ${result.body.companyName ?? 'non renvoyé'}`);
    console.log(`  Pays configurés : ${Array.isArray(result.body.countries) ? result.body.countries.length : 'non vérifiable'}`);
    if (Array.isArray(result.body.countries) && result.body.countries.length === 0) {
      console.log('  Attention : clé valide, mais aucun pays configuré pour les dépôts.');
    }
    return true;
  }

  const message = redact(String(result.failure?.failureMessage ?? 'réponse non exploitable'), token);
  console.log(`  Clé acceptée : non — HTTP ${result.status || 'réseau'}`);
  console.log(`  Code : ${result.failure?.failureCode ?? 'aucun'}`);
  console.log(`  Message : ${message.slice(0, 200)}`);
  return false;
}

async function main() {
  const token = process.env.PAWAPAY_API_TOKEN?.trim() ?? '';
  const configured = process.env.PAWAPAY_BASE_URL?.trim().replace(/\/$/, '') ?? '';

  if (!token) {
    console.error('Aucune clé trouvée : renseignez PAWAPAY_API_TOKEN dans .env.local.');
    process.exit(1);
  }

  console.log('Vérification Mobile Money — lecture seule, aucun paiement créé.');
  console.log(`Environnement déclaré dans .env.local : ${configured || 'aucun'}`);

  const primary = configured || SANDBOX;
  const other = primary.includes('sandbox') ? PRODUCTION : SANDBOX;

  const first = await probe(primary, token);
  const ok = verdict(`1. Environnement déclaré : ${primary}`, first, token);

  if (!ok) {
    console.log(`\n2. Contrôle croisé : ${other}`);
    const second = await probe(other, token);
    const okOther = verdict(`2. Environnement opposé : ${other}`, second, token);

    if (okOther) {
      console.log(
        `\nDiagnostic : la clé appartient à ${other}, pas à ${primary}.\n` +
          `Correction : PAWAPAY_BASE_URL=${other} dans .env.local (et sur le site en ligne).`,
      );
    } else {
      console.log(
        '\nDiagnostic : la clé est refusée par les deux environnements.\n' +
          'Correction : générer une clé depuis le bon tableau de bord, puis relancer ce contrôle.',
      );
    }
    process.exit(1);
  }

  console.log('\nClé valide sur l’environnement déclaré. Le paiement peut être retesté.');
}

void main();
