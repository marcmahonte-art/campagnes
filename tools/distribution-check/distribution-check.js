/**
 * Contrôle de la CHAÎNE DE DISTRIBUTION PRIVÉE (migrations 0008 + 0009).
 *
 * POURQUOI CE SCRIPT
 *   L'affordance « Lien privé de distribution » a été réactivée dans l'éditeur de
 *   campagne. Elle repose sur trois pièces qui peuvent disparaître
 *   indépendamment, et dont l'absence ne se voit pas :
 *
 *     * `create_distribution_link` — la RPC de création (côté créateur) ;
 *     * `resolve_distribution`      — la résolution du jeton (côté participant) ;
 *     * la RLS sur `distribution_links` — sans elle, tous les jetons fuient.
 *
 *   Le mode d'échec le plus vicieux est le dernier : une table sans RLS ne
 *   produit aucune erreur, elle rend simplement les jetons lisibles par
 *   n'importe quel visiteur. C'est exactement ce que faisait la 0008.
 *
 * LE TÉMOIN — À LIRE AVANT DE FAIRE CONFIANCE AU RÉSULTAT
 *   Un test du type « la réponse est vide donc c'est fermé » est FAUX : la
 *   table peut être vide, et `[]` sortirait alors même sans RLS. Ce script a
 *   d'abord été écrit ainsi, et il annonçait 6/6 avec la RLS désactivée.
 *
 *   Il lui faut donc un jeton dont on sait qu'il EXISTE en base, pour vérifier
 *   qu'il reste invisible. Trois sources, dans l'ordre :
 *
 *     1. `TEMOIN_TOKEN` (ou le fichier `.witness`) — un jeton réel fourni ;
 *     2. un témoin **auto-produit** : si la clé service role est disponible,
 *        le script écrit lui-même une ligne, vérifie qu'elle est invisible en
 *        anonyme, puis la **supprime** (voir plus bas) ;
 *     3. sinon, il le DIT et sort en code 2 : contrôle partiel, pas succès.
 *
 * LE TÉMOIN AUTO-PRODUIT — CE QU'IL FAIT ET NE FAIT PAS
 *   Il sert uniquement à prouver l'étanchéité de la RLS : la table étant vide,
 *   aucun « [] » n'a de sens. La ligne écrite est :
 *
 *     * `status = 'REVOKED'` — totalement inerte : `resolve_distribution` la
 *       rejette, elle n'ouvre aucune campagne, même si le nettoyage échouait ;
 *     * `quota_total = 1` — le minimum autorisé par la contrainte ;
 *     * liée à une campagne existante (contrainte étrangère) ;
 *     * **supprimée** dans un `finally`, avant tout `process.exit`, y compris
 *       en cas d'exception.
 *
 *   Elle n'est PAS un jeton de test du parcours participant : pour cela, la
 *   preuve a été faite une fois à la main en base (voir plus bas).
 *
 *   Désactivation : `TEMOIN_AUTO=0`.
 *
 * CE QUI EST VÉRIFIÉ ICI (par HTTP, sans session)
 *   1. `create_distribution_link` REFUSE l'anonyme (42501).
 *   2. `resolve_distribution` répond sans erreur à un jeton inconnu, et rend
 *      `null` — pas une exception, pas un jeton, pas une campagne.
 *   3. `distribution_links` n'est PAS lisible en anonyme, y compris quand le
 *      témoin prouve qu'il y a bien des lignes à cacher.
 *   4. `distribution_links` n'est PAS inscriptible en anonyme.
 *
 * CE QUI N'EST PAS VÉRIFIÉ ICI
 *   Le chemin AUTHENTIFIÉ complet (créer un vrai jeton, le résoudre, ouvrir
 *   `/d/[token]`). Il exige une session utilisateur. Il a été prouvé une fois
 *   à la main en base :
 *     create_distribution_link(...)  →  jeton de 64 caractères
 *     resolve_distribution(jeton)    →  l'UUID de la campagne
 *   Le jeton de test avait été supprimé après la mesure.
 *
 * Usage : npm run check:distribution
 *         TEMOIN_TOKEN=<jeton réel> npm run check:distribution
 *         TEMOIN_AUTO=0 npm run check:distribution
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROJECT = 'mtqfacjnwxlmcahnxmvz';
const WITNESS_FILE = path.join(__dirname, '.witness');

/** Lit une clé depuis .env.local (jamais écrite en dur dans le dépôt). */
function envKey(name) {
  const env = path.join(__dirname, '..', '..', '.env.local');
  const line = fs
    .readFileSync(env, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  if (!line) return null;
  return line.slice(name.length + 1).trim().replace(/^"|"$/g, '');
}

function anonKey() {
  const key = envKey('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY introuvable dans .env.local');
  return key;
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || envKey('SUPABASE_SERVICE_ROLE_KEY') || null;
}

/**
 * Jeton témoin fourni de l'extérieur, s'il y en a un.
 *
 * Il doit exister réellement en base pour que le point 3 ait un sens. On
 * l'accepte par variable d'environnement (prioritaire) ou par fichier.
 */
function witnessToken() {
  const fromEnv = (process.env.TEMOIN_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const v = fs.readFileSync(WITNESS_FILE, 'utf8').trim();
    return v || null;
  } catch {
    return null;
  }
}

function request(method, urlPath, body, key) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = https.request(
      {
        host: `${PROJECT}.supabase.co`,
        path: urlPath,
        method,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function parseRows(body) {
  try {
    const v = JSON.parse(body);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Témoin auto-produit — écriture puis suppression                     */
/* ------------------------------------------------------------------ */

/** Jeton en attente de suppression. Toujours vidé dans le `finally`. */
let pendingCleanup = null;

/**
 * Écrit une ligne témoin, totalement inerte, pour prouver que la RLS cache
 * bien des lignes réelles. Renvoie son jeton, ou `null` si impossible.
 */
async function createAutoWitness() {
  if ((process.env.TEMOIN_AUTO || '').trim() === '0') return null;
  const svc = serviceRoleKey();
  if (!svc) return null;

  // Une contrainte étrangère impose une campagne réelle. Sans campagne, il n'y
  // a rien à prouver de toute façon — la table resterait vide.
  const campaigns = await request(
    'GET',
    '/rest/v1/campaigns?select=id&limit=1&order=created_at.asc',
    undefined,
    svc
  );
  const rows = parseRows(campaigns.body);
  if (campaigns.status !== 200 || rows.length === 0) return null;

  const token = crypto.randomBytes(32).toString('hex'); // 256 bits, 64 car.
  const inserted = await request(
    'POST',
    '/rest/v1/distribution_links',
    {
      campaign_id: rows[0].id,
      token,
      quota_total: 1,
      // Inerte par construction : `resolve_distribution` rend `null` dès que
      // le statut n'est pas ACTIVE. Cette ligne ne peut ouvrir aucune
      // campagne, même si le nettoyage venait à échouer.
      status: 'REVOKED',
    },
    svc
  );
  if (inserted.status >= 300) return null;

  pendingCleanup = token;
  return token;
}

/** Supprime la ligne témoin. Appelée avant toute sortie du script. */
async function removeAutoWitness() {
  const token = pendingCleanup;
  pendingCleanup = null;
  if (!token) return;
  const svc = serviceRoleKey();
  if (!svc) return;
  try {
    await request(
      'DELETE',
      `/rest/v1/distribution_links?token=eq.${encodeURIComponent(token)}`,
      undefined,
      svc
    );
  } catch {
    // Rien à faire de plus : la ligne est REVOKED, elle n'ouvre rien.
  }
}

(async () => {
  let exitCode = 0;
  try {
    await main();
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    exitCode = 1;
  } finally {
    await removeAutoWitness();
  }
  process.exit(exitCode);

  async function main() {
    const key = anonKey();
    let pass = 0;
    let fail = 0;
    let witnessCounted = false;
    const check = (ok, label, detail) => {
      if (ok) {
        pass++;
        console.log(`  ok     ${label}${detail ? ' — ' + detail : ''}`);
      } else {
        fail++;
        console.log(`  ECHEC  ${label}${detail ? ' — ' + detail : ''}`);
      }
    };

    console.log('=== Chaîne de distribution privée (migrations 0008 + 0009) ===\n');

    // --- 1. La création de jeton reste fermée à l'anonyme -------------------
    //
    // La fonction est `security definer` : elle s'exécute avec les droits de son
    // propriétaire, donc un GRANT trop large ouvrirait la création à tout le
    // monde. C'est le premier point qui peut casser en silence.
    console.log('1. Création de jeton (doit REFUSER l’anonyme)');

    const create = await request(
      'POST',
      '/rest/v1/rpc/create_distribution_link',
      { p_campaign_id: '00000000-0000-0000-0000-000000000000', p_quota: 10 },
      key
    );
    let createErr = null;
    try {
      createErr = JSON.parse(create.body);
    } catch {}
    check(
      create.status >= 400,
      'un appel anonyme est refusé',
      `HTTP ${create.status}, code ${createErr?.code ?? '?'}`
    );
    check(
      createErr?.code === '42501' || /permission denied/i.test(create.body),
      'le refus vient bien des droits, pas d’une panne silencieuse',
      createErr?.message ? `« ${createErr.message} »` : ''
    );

    // --- 2. La résolution d'un jeton inconnu ----------------------------------
    //
    // Elle DOIT répondre sans erreur et rendre `null`. Une exception ici
    // remonterait jusqu'à l'écran participant sous forme de page vide.
    console.log('\n2. Résolution d’un jeton inconnu (doit rendre null, sans erreur)');

    const resolve = await request(
      'POST',
      '/rest/v1/rpc/resolve_distribution',
      { p_token: 'jeton-inexistant-000000000000' },
      key
    );
    check(resolve.status === 200, 'l’appel aboutit', `HTTP ${resolve.status}`);
    check(
      resolve.body.trim() === 'null',
      'un jeton inconnu ne résout rien',
      `corps « ${resolve.body.trim().slice(0, 40)} »`
    );

    // --- 3. La table des jetons n'est pas lisible ---------------------------
    //
    // C'est LE défaut de la 0008 : aucune RLS. Une table sans RLS rend ses lignes
    // à tout le monde, sans la moindre erreur.
    //
    // ATTENTION — PIÈGE VÉRIFIÉ. Un simple « la réponse est vide » ne prouve
    // RIEN : la table peut être vide, et `[]` serait alors rendu même sans RLS.
    // C'est exactement ce qui s'est produit à la première écriture de ce script :
    // il annonçait 6/6 avec la RLS désactivée. Le contrôle a donc besoin d'un
    // jeton dont on sait qu'il existe, pour vérifier qu'il reste invisible.
    console.log('\n3. Lecture directe de distribution_links (doit être FERMÉE)');

    const read = await request(
      'GET',
      '/rest/v1/distribution_links?select=token&limit=1',
      undefined,
      key
    );
    check(
      read.status >= 400 || read.body.trim() === '[]',
      'les jetons ne sont pas énumérables directement',
      `HTTP ${read.status}${read.body.trim() === '[]' ? ', aucune ligne rendue' : ''}`
    );

    // Témoin : fourni d'abord, auto-produit ensuite. Le second cas est le seul
    // qui puisse prouver quelque chose quand la table est vide.
    let witness = witnessToken();
    let existenceVia = witness ? 'resolve' : 'auto';

    if (!witness) {
      witness = await createAutoWitness();
      if (witness) console.log('  (témoin auto-produit — ligne REVOKED, supprimée à la fin)');
    }

    if (witness) {
      // Filtre ciblé sur le témoin : une lecture filtrée ne peut pas être « vide
      // par hasard ». Si une ligne sort ici, la RLS laisse passer.
      const targeted = await request(
        'GET',
        `/rest/v1/distribution_links?select=token&token=eq.${encodeURIComponent(witness)}`,
        undefined,
        key
      );
      check(
        targeted.body.trim() === '[]',
        'un jeton précis ne ressort pas non plus en lecture directe',
        `HTTP ${targeted.status}`
      );

      // Contrôle croisé — le cœur du témoin. Il prouve que la ligne existe bel
      // et bien : sans lui, les « [] » ci-dessus seraient indiscernables d'une
      // table vide, et passeraient donc avec la RLS désactivée.
      //
      // Deux chemins selon l'origine : un témoin `ACTIVE` se prouve par la RPC
      // de résolution ; un témoin auto-produit est `REVOKED`, que cette RPC
      // rejette volontairement, donc on le prouve par une lecture service role
      // — c'est la même table, lue avec les droits qui doivent tout voir.
      if (existenceVia === 'resolve') {
        const resolved = await request(
          'POST',
          '/rest/v1/rpc/resolve_distribution',
          { p_token: witness },
          key
        );
        witnessCounted = resolved.status === 200 && resolved.body.trim() !== 'null';
        check(
          witnessCounted,
          'le témoin existe bien en base — donc les « [] » ci-dessus cachent quelque chose',
          witnessCounted
            ? `résolu vers « ${resolved.body.trim().replace(/"/g, '').slice(0, 36)}… »`
            : `non résolu (corps « ${resolved.body.trim().slice(0, 30)} »)`
        );
      } else {
        const svc = serviceRoleKey();
        const found = await request(
          'GET',
          `/rest/v1/distribution_links?select=token&token=eq.${encodeURIComponent(witness)}`,
          undefined,
          svc
        );
        witnessCounted = found.status === 200 && parseRows(found.body).length === 1;
        check(
          witnessCounted,
          'la ligne témoin existe bien en base — donc les « [] » ci-dessus cachent quelque chose',
          witnessCounted
            ? 'lisible en service role, invisible en anonyme'
            : `HTTP ${found.status}, ${parseRows(found.body).length} ligne(s)`
        );
      }
    } else {
      console.log(
        '  ATTENTION  aucun jeton témoin — le point 3 ne peut pas distinguer\n' +
          '             « RLS fermée » de « table vide » et ne prouve donc rien.\n' +
          '             Fournir TEMOIN_TOKEN=<jeton réel>, ou laisser la clé\n' +
          '             service role disponible pour un témoin auto-produit.'
      );
    }

    // --- 4. La table des jetons n'est pas inscriptible en anonyme ----------
    console.log('\n4. Écriture directe dans distribution_links (doit être REFUSÉE)');

    const write = await request(
      'POST',
      '/rest/v1/distribution_links',
      { campaign_id: '00000000-0000-0000-0000-000000000000', token: 'x', quota_total: 1 },
      key
    );
    check(
      write.status >= 400,
      'un anonyme ne peut pas inventer un jeton',
      `HTTP ${write.status}`
    );

    console.log(`\n=== ${pass} réussis / ${fail} échoués ===`);
    if (fail > 0) {
      exitCode = 1;
      return;
    }
    if (!witnessCounted) {
      console.log('Contrôle PARTIEL : sans témoin, l’étanchéité de la RLS reste non prouvée.');
      exitCode = 2;
      return;
    }
    exitCode = 0;
  }
})();
