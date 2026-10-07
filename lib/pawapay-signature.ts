/**
 * Vérification des **callbacks signés** pawaPay (RFC 9421 — HTTP Message Signatures).
 *
 * Documentation officielle : https://docs.pawapay.io/v2/docs/signatures
 *
 * Le problème que ce module règle :
 *   Une route `/webhook` publique qui se contente de lire `depositId` dans le
 *   corps JSON est un point d'entrée ouvert. pawaPay propose de signer ses
 *   callbacks : on active l'option dans le Dashboard, et chaque notification
 *   porte alors `Content-Digest`, `Signature-Input`, `Signature` et
 *   `Signature-Date`. Sans vérification de cette signature, n'importe qui peut
 *   fabriquer un `COMPLETED` et se créditer une formule.
 *
 * Ce que fait ce module, dans l'ordre :
 *   1. recalcule le `Content-Digest` du corps brut et le compare à l'en-tête
 *      (le corps n'a pas été modifié en route) ;
 *   2. reconstruit la *signature base* exactement comme décrite par la RFC
 *      9421, en suivant l'ordre déclaré dans `Signature-Input` — on ne suppose
 *      jamais cet ordre, c'est pawaPay qui l'écrit dans l'en-tête ;
 *   3. vérifie la signature avec la clé publique P-256 de pawaPay, récupérée
 *      sur `GET /v2/public-key/http`.
 *
 * Le corps brut est indispensable : `request.json()` le consomme, et le
 * re-sérialiser ne redonne pas les mêmes octets (ordre des clés). C'est pour
 * cela que la route webhook lit le corps via `request.text()` et le passe ici.
 */

import {
  constants,
  createHash,
  verify as cryptoVerify,
} from 'node:crypto';
import { PAWAPAY_API_TOKEN, PAWAPAY_BASE_URL } from './pawapay';

const RSA_PSS_PADDING = constants.RSA_PKCS1_PSS_PADDING;

/**
 * Les callbacks signés sont-ils exigés ?
 *
* En production, oui : c'est le seul moyen de savoir que la notification vient
 * réellement de pawaPay. Une variable d'environnement permet d'assouplir (par
 * exemple le temps d'activer l'option dans le Dashboard), mais jamais en
 * production sans raison explicite.
 */
const envFlag = (value: string | undefined): boolean | undefined => {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return undefined;
};

export function isSignedCallbackRequired(): boolean {
  const explicit = envFlag(process.env.PAWAPAY_REQUIRE_SIGNED_CALLBACKS);
  if (explicit !== undefined) return explicit;
  // Par défaut : exigé dès que le build tourne sur un NODE_ENV de production.
  return process.env.NODE_ENV === 'production';
}

/** En-têtes conservés par la lecture du corps brut, passés tels quels à la vérification. */
export interface CallbackVerificationInput {
  /** Corps **brut** de la requête (`await request.text()`), jamais re-sérialisé. */
  rawBody: string;
  /** Méthode HTTP, en majuscules (`POST`). */
  method: string;
  /**
   * Autorités (hôtes) possibles signées par pawaPay, par ordre de préférence.
   *
   * pawaPay signe l'autorité de la requête qu'il a **envoyée**, c'est-à-dire
   * notre domaine public. Derrière le proxy Vercel, l'en-tête `Host` peut être
   * réécrit ; on essaie donc plusieurs valeurs plutôt que de rejeter à tort
   * une notification légitime.
   */
  authorityCandidates: string[];
  /** En-têtes de la requête, en minuscules. */
  headers: Record<string, string>;
  /**
   * Chemin de la requête, tel que pawaPay l'a vu (`/api/payments/pawapay/webhook`).
   *
   * Reçu du route handler plutôt que reconstitué : derrière un proxy, le chemin
 * vu par le client et celui du route handler peuvent différer, et c'est le
 * nôtre qui fait foi — pawaPay a signé ce qu'il a réellement envoyé.
   */
  path: string;
  /** Chaîne de requête (query string) incluse, sans le `?`. Vide par défaut. */
  query?: string;
}

export type CallbackVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

/* ------------------------------------------------------------------ */
/* Clés publiques pawaPay                                              */
/* ------------------------------------------------------------------ */

interface PawaPayPublicKey {
  id: string;
  key: string;
}

/**
 * Les clés de signature de pawaPay ne changent qu'épisodiquement (rotation
 * annuelle). On les met en cache en mémoire pendant une heure : chaque webhook
 * ne déclenche pas un appel HTTP de plus.
 */
const PUBLIC_KEY_TTL_MS = 60 * 60 * 1000;
let cachedKeys: { keys: PawaPayPublicKey[]; fetchedAt: number } | null = null;

async function fetchPublicKeys(): Promise<PawaPayPublicKey[]> {
  if (!PAWAPAY_API_TOKEN) {
    throw new Error('PAWAPAY_API_TOKEN absent : impossible de récupérer les clés de signature.');
  }

  const now = Date.now();
  if (cachedKeys && now - cachedKeys.fetchedAt < PUBLIC_KEY_TTL_MS) {
    return cachedKeys.keys;
  }

  const response = await fetch(`${PAWAPAY_BASE_URL}/v2/public-key/http`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${PAWAPAY_API_TOKEN}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Clés de signature pawaPay indisponibles (HTTP ${response.status}).`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('Réponse inattendue des clés de signature pawaPay.');
  }

  const keys = data
    .filter(
      (item): item is PawaPayPublicKey =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as PawaPayPublicKey).id === 'string' &&
        typeof (item as PawaPayPublicKey).key === 'string',
    )
    .map((item) => ({ id: item.id, key: item.key }));

  cachedKeys = { keys, fetchedAt: now };
  return keys;
}

/** Vide le cache — utile dans un harnais de test. */
export function resetPublicKeyCache(): void {
  cachedKeys = null;
}

/* ------------------------------------------------------------------ */
/* Content-Digest                                                      */
/* ------------------------------------------------------------------ */

/**
 * Recalcule le condensé du corps et le compare à l'en-tête `Content-Digest`.
 *
 * Format : `alg=:base64:` ou `alg=base64` (sans les deux-points, toléré).
 * La comparaison est à temps constant : le condensé n'est pas un secret, mais
 * la rigueur reste gratuite ici.
 */
function verifyContentDigest(rawBody: string, contentDigest: string): string | null {
  const match = /^(sha-256|sha-512)\s*=\s*:?([A-Za-z0-9+/=]+):?$/i.exec(contentDigest.trim());
  if (!match) {
    return `En-tête Content-Digest illisible : « ${contentDigest} ».`;
  }

  const algorithm = match[1].toLowerCase();
  const expected = Buffer.from(match[2], 'base64');
  const actual = createHash(algorithm).update(rawBody, 'utf8').digest();

  if (expected.length !== actual.length || !cryptoTimingSafeEqual(expected, actual)) {
    return 'Le corps reçu ne correspond pas au Content-Digest signé.';
  }

  return null;
}

function cryptoTimingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/* Signature-Input / Signature                                         */
/* ------------------------------------------------------------------ */

interface ParsedSignatureInput {
  /** Composants couverts, dans l'ordre exact écrit par pawaPay. */
  components: string[];
  /** Algorithme, normalisé (`ecdsa-p256-sha256`, `rsa-v1_5-sha256`…). */
  alg: string | null;
  keyId: string | null;
  created: number | null;
  expires: number | null;
  /** Partie droite de `@signature-params`, reproduite telle quelle. */
  params: string;
}

/**
 * Découpe `sig-pp=("@method" …);alg="…";keyid="…";created=…;expires=…`.
 *
 * La partie droite n'est **pas** normalisée : c'est elle qui est signée, et
 * toute retouche (casse, espaces) ferait échouer la vérification.
 */
function parseSignatureInput(header: string): ParsedSignatureInput | null {
  const trimmed = header.trim();
  const eq = trimmed.indexOf('=');
  if (eq < 0) return null;

  const params = trimmed.slice(eq + 1).trim();
  const separator = params.indexOf(')');
  if (separator < 0) return null;

  const componentsRaw = params.slice(0, separator + 1);
  const metadataRaw = params.slice(separator + 1).replace(/^;/, '');

  const components = [...componentsRaw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!components.length) return null;

  const readMeta = (name: string): string | null => {
    const found = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*"([^"]*)"`, 'i').exec(metadataRaw);
    return found ? found[1] : null;
  };

  const createdRaw = /(?:^|;)\s*created\s*=\s*(\d+)/i.exec(metadataRaw);
  const expiresRaw = /(?:^|;)\s*expires\s*=\s*(\d+)/i.exec(metadataRaw);

  return {
    components,
    alg: readMeta('alg')?.toLowerCase() ?? null,
    keyId: readMeta('keyid'),
    created: createdRaw ? Number(createdRaw[1]) : null,
    expires: expiresRaw ? Number(expiresRaw[1]) : null,
    params: params.trim(),
  };
}

/** Découpe `sig-pp=:BASE64:` et renvoie la signature en octets. */
function parseSignature(header: string): { label: string; bytes: Buffer } | null {
  const trimmed = header.trim();
  const eq = trimmed.indexOf('=');
  if (eq < 0) return null;

  const label = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();
  const wrapped = /^:([A-Za-z0-9+/=]+):$/.exec(value);
  const base64 = wrapped ? wrapped[1] : value;

  if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) return null;

  const bytes = Buffer.from(base64, 'base64');
  return bytes.length > 0 ? { label, bytes } : null;
}

/**
 * Reconstruction de la signature base, ligne par ligne, dans l'ordre signé.
 *
 * Un composant signé mais absent de la requête rend la signature invérifiable :
 * on lève, et l'appelant passe à l'autorité candidate suivante.
 */
function buildSignatureBase(
  input: CallbackVerificationInput,
  signatureInput: ParsedSignatureInput,
  authority: string,
): string {
  const derived: Record<string, string> = {
    '@method': input.method.toUpperCase(),
    '@authority': authority,
    '@path': input.path,
    '@query': input.query ?? '',
  };

  const lines: string[] = [];

  for (const component of signatureInput.components) {
    const name = component.toLowerCase();

    if (name in derived) {
      lines.push(`"${name}": ${derived[name]}`);
      continue;
    }

    const value = input.headers[name];
    if (value === undefined) {
      throw new Error(`Composant signé absent de la requête : ${component}`);
    }
    lines.push(`"${name}": ${value.trim()}`);
  }

  lines.push(`"@signature-params": ${signatureInput.params}`);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Vérification cryptographique                                         */
/* ------------------------------------------------------------------ */

function verifyWithKey(
  algorithm: string,
  signature: Buffer,
  signatureBase: string,
  publicKeyPem: string,
): boolean | null {
  switch (algorithm) {
    /*
     * RFC 9421 : la signature est la concaténation brute r||s (format
     * « raw »), et non un DER. D'où `ieee-p1363` — l'encodage par défaut de
     * Node attend du DER et ferait échouer toute vérification valide.
     */
    case 'ecdsa-p256-sha256':
      return cryptoVerify(
        'sha256',
        Buffer.from(signatureBase, 'utf8'),
        { key: publicKeyPem, dsaEncoding: 'ieee-p1363' },
        signature,
      );

    case 'ecdsa-p384-sha384':
      return cryptoVerify(
        'sha384',
        Buffer.from(signatureBase, 'utf8'),
        { key: publicKeyPem, dsaEncoding: 'ieee-p1363' },
        signature,
      );

    case 'rsa-v1_5-sha256':
      return cryptoVerify(
        'sha256',
        Buffer.from(signatureBase, 'utf8'),
        publicKeyPem,
        signature,
      );

    case 'rsa-pss-sha512':
      return cryptoVerify(
        'sha512',
        Buffer.from(signatureBase, 'utf8'),
        {
          key: publicKeyPem,
          padding: RSA_PSS_PADDING,
          // RFC 9421 : le sel fait la longueur du condensé de l'algorithme de hachage.
          saltLength: 64,
        },
        signature,
      );

    default:
      // Algorithme inconnu : on refuse plutôt que d'accepter sans vérifier.
      return null;
  }
}

/** Fenêtre de tolérance sur l'horodatage de la signature (rejeu d'un ancien callback). */
const CLOCK_SKEW_SECONDS = 300;

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                      */
/* ------------------------------------------------------------------ */

/**
 * Vérifie qu'un callback pawaPay est authentique et intact.
 *
 * En production, l'absence de `Signature` fait échouer la vérification : c'est
 * le comportement voulu. Tant que l'option n'est pas activée dans le Dashboard
 * pawaPay, cette fonction refuse donc tout callback — il faut soit activer
 * l'option, soit poser `PAWAPAY_REQUIRE_SIGNED_CALLBACKS=false` en connaissance
 * de cause (le webhook redevient alors non authentifié, et la garantie
 * d'origine disparaît même si le reste du système reste valable).
 */
export async function verifyPawaPayCallback(
  input: CallbackVerificationInput,
): Promise<CallbackVerificationResult> {
  const required = isSignedCallbackRequired();

  const contentDigest = input.headers['content-digest'];
  const signatureHeader = input.headers.signature;
  const signatureInputHeader = input.headers['signature-input'];

  const missing = !contentDigest || !signatureHeader || !signatureInputHeader;

  if (missing) {
    if (required) {
      return {
        ok: false,
        reason:
          'Callback non signé alors que la vérification est obligatoire. Activez les callbacks signés ' +
          'dans le Dashboard pawaPay (API tokens → Signed callbacks).',
      };
    }
    console.warn(
      '[pawaPay] Callback reçu SANS signature alors que la vérification est optionnelle. ' +
        'Activez les callbacks signés dans le Dashboard pawaPay.',
    );
    return { ok: true };
  }

  // 1. Intégrité du corps.
  const digestError = verifyContentDigest(input.rawBody, contentDigest!);
  if (digestError) {
    return { ok: false, reason: digestError };
  }

  // 2. Signature-Input bien formé ?
  const parsedInput = parseSignatureInput(signatureInputHeader!);
  if (!parsedInput) {
    return { ok: false, reason: 'En-tête Signature-Input illisible.' };
  }

  const parsedSignature = parseSignature(signatureHeader!);
  if (!parsedSignature) {
    return { ok: false, reason: 'En-tête Signature illisible.' };
  }

  // 3. Fraîcheur de la signature — un callback rejoué plus tard est refusé.
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (parsedInput.created !== null && Math.abs(nowSeconds - parsedInput.created) > CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'Signature trop ancienne ou horodatage dans le futur.' };
  }
  if (parsedInput.expires !== null && nowSeconds > parsedInput.expires) {
    return { ok: false, reason: 'Signature expirée.' };
  }

  if (!parsedInput.alg) {
    return { ok: false, reason: 'Algorithme de signature absent de Signature-Input.' };
  }

  // 4. Clé publique correspondante.
  let publicKeys: PawaPayPublicKey[];
  try {
    publicKeys = await fetchPublicKeys();
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Clés de signature indisponibles.';
    if (required) return { ok: false, reason };
    console.warn('[pawaPay] Vérification de signature impossible :', reason);
    return { ok: true };
  }

  const key = publicKeys.find((k) => k.id === parsedInput.keyId);
  if (!key) {
    return {
      ok: false,
      reason: `Aucune clé publique pawaPay ne correspond à keyid=${parsedInput.keyId ?? '(absent)'}.`,
    };
  }

  // 5. Vérification cryptographique, en essayant chaque autorité candidate.
  //    Le proxy Vercel peut réécrire `Host` : on préfère refuser par erreur que
  //    faire perdre un vrai callback d'un client qui a payé.
  let lastError: string | null = null;

  for (const authority of input.authorityCandidates) {
    let signatureBase: string;
    try {
      signatureBase = buildSignatureBase(input, parsedInput, authority);
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Signature base illisible.';
      continue;
    }

    const outcome = verifyWithKey(parsedInput.alg, parsedSignature.bytes, signatureBase, key.key);
    if (outcome === true) return { ok: true };
    lastError = `Signature invalide (algorithme ${parsedInput.alg}, autorité ${authority}).`;
  }

  return { ok: false, reason: lastError ?? 'Signature invalide.' };
}