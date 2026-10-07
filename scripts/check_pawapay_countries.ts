/**
 * Quels pays sont **réellement ouverts** sur le compte marchand ? LECTURE SEULE.
 *
 * Pourquoi ce script existe : la liste de `lib/payments/corridors.ts` dit ce que
 * la passerelle sait faire. Elle ne dit pas ce qui est activé **sur ce compte**.
 * Un corridor documenté mais non activé donne un paiement qui échoue côté
 * opérateur, sans que rien n'indique la cause.
 *
 * Ce qu'il fait :
 *   1. appelle `GET /v2/active-conf` — route officielle de configuration du
 *      compte, aucune initiation de dépôt, aucun débit, aucun SMS ;
 *   2. interroge le compte **sans filtre pays** pour lister ce qui est configuré,
 *      puis chaque corridor de l'Afrique de l'Ouest un par un ;
 *   3. croise avec notre liste et dit **quoi corriger** ;
 *   4. si la clé est refusée, teste l'environnement opposé : une clé de
 *      production sur l'hôte de bac à sable échoue comme une clé invalide.
 *
 * Ce qu'il ne fait jamais : aucun paiement, aucun montant, aucun numéro.
 * La clé n'est jamais affichée, même partiellement.
 *
 * Usage :
 *   npx ts-node -O "{\"module\":\"commonjs\"}" scripts/check_pawapay_countries.ts
 *   PAWAPAY_BASE_URL=https://api.pawapay.io npx ts-node … (pour forcer un hôte)
 */

import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

import {
  DEFAULT_PAYMENT_COUNTRY,
  PAYMENT_CORRIDORS,
  payableCorridors,
} from '../lib/payments/corridors';

const SANDBOX = 'https://api.sandbox.pawapay.io';
const PRODUCTION = 'https://api.pawapay.io';

/** Masque systématiquement la clé : aucune sortie ne doit la contenir. */
function redact(text: string, secret: string): string {
  return secret ? text.split(secret).join('[MASQUÉ]') : text;
}

interface ActiveConfResponse {
  companyName?: string;
  countries?: Array<{ country?: string; providers?: unknown[] }>;
  failureReason?: { failureCode?: string; failureMessage?: string } | string;
}

async function probe(baseUrl: string, token: string, country?: string) {
  const query = new URLSearchParams({ operationType: 'DEPOSIT' });
  if (country) query.set('country', country);
  const url = `${baseUrl.replace(/\/$/, '')}/v2/active-conf?${query.toString()}`;

  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await response.json().catch(() => ({}))) as ActiveConfResponse;
    const failure =
      typeof body.failureReason === 'string'
        ? { failureMessage: body.failureReason }
        : body.failureReason;
    return { status: response.status, body, failure };
  } catch (error) {
    const code = (error as { cause?: { code?: string } })?.cause?.code;
    return {
      status: 0,
      body: {},
      failure: { failureMessage: `Réseau injoignable (${code ?? 'inconnu'})` },
    };
  }
}

function formatFailure(probeResult: Awaited<ReturnType<typeof probe>>, token: string): string {
  const raw = probeResult.failure?.failureMessage ?? 'réponse non exploitable';
  return redact(String(raw), token).slice(0, 160);
}

async function main() {
  const token = process.env.PAWAPAY_API_TOKEN?.trim() ?? '';
  const configured = process.env.PAWAPAY_BASE_URL?.trim().replace(/\/$/, '') ?? '';

  if (!token) {
    console.error('Aucune clé trouvée : renseignez PAWAPAY_API_TOKEN dans .env.local.');
    process.exit(1);
  }

  const primary = configured || SANDBOX;
  const other = primary.includes('sandbox') ? PRODUCTION : SANDBOX;

  console.log('Vérification des corridors — lecture seule, aucun paiement créé.');
  console.log(`Environnement déclaré : ${configured || 'aucun (bac à sable par défaut)'}`);
  console.log(`Pays de référence dans le code : ${DEFAULT_PAYMENT_COUNTRY}`);

  const global = await probe(primary, token);

  if (global.status !== 200) {
    console.log(`\nClé refusée sur ${primary} (HTTP ${global.status || 'réseau'}) : ${formatFailure(global, token)}`);
    const crosscheck = await probe(other, token);
    console.log(`Contrôle croisé sur ${other} : HTTP ${crosscheck.status || 'réseau'} — ${formatFailure(crosscheck, token)}`);

    if (crosscheck.status === 200) {
      console.log(
        `\nDiagnostic : la clé appartient à ${other}, pas à ${primary}.\n` +
          `Correction : PAWAPAY_BASE_URL=${other} dans .env.local ET sur le site en ligne, puis relancer.`,
      );
    } else {
      console.log(
        '\nDiagnostic : la clé est refusée par les deux environnements.\n' +
          'Correction : générer une clé depuis le bon tableau de bord, puis relancer ce contrôle.',
      );
    }
    process.exit(1);
  }

  const configuredCountries = (global.body.countries ?? [])
    .map((entry) => entry.country)
    .filter((code): code is string => typeof code === 'string');

  console.log(`\nCompte marchand : ${global.body.companyName ?? 'non renvoyé'}`);
  console.log(
    configuredCountries.length
      ? `Pays configurés pour les dépôts : ${configuredCountries.join(', ')}`
      : 'Aucun pays configuré pour les dépôts sur ce compte.',
  );

  console.log('\nCorridor par corridor (Afrique de l’Ouest) :');
  const payable = payableCorridors().map((corridor) => corridor.countryCode);

  for (const corridor of PAYMENT_CORRIDORS) {
    const result = await probe(primary, token, corridor.countryCode);
    const active = result.status === 200;
    const inList = configuredCountries.includes(corridor.countryCode);
    const status = active ? (inList ? 'configuré' : 'répond (non listé)') : 'non configuré';
    const role = payable.includes(corridor.countryCode) ? 'facturable' : 'non tarifé';
    console.log(
      `  ${corridor.countryCode} ${corridor.country.padEnd(14)} ${corridor.currency}  ${status.padEnd(20)} ${role}`,
    );
  }

  const missing = payable.filter((code) => !configuredCountries.includes(code));
  console.log('');

  if (missing.length === 0) {
    console.log('Tous les pays facturables sont ouverts sur le compte. Rien à corriger.');
    return;
  }

  console.log(
    `À corriger : ${missing.join(', ')} ${
      missing.length > 1 ? 'sont proposés' : 'est proposé'
    } dans l’interface mais pas ouverts sur le compte marchand.\n` +
      'Deux options : demander leur activation au prestataire, ou les retirer de\n' +
      '`lib/payments/corridors.ts` (passer `priced: false`) tant qu’ils ne le sont pas.\n' +
      'Tant que ce n’est pas fait, un client de ces pays paiera dans le vide.',
  );
}

void main();
