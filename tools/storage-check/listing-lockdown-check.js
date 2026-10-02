/**
 * Contrôle du VERROU DE LISTAGE du bucket `media` (migration 0013).
 *
 * POURQUOI CE SCRIPT
 *   La migration 0013 remplace la policy de lecture :
 *
 *     AVANT : using ( bucket_id = 'media' )                     ← vrai pour tout
 *     APRÈS : using ( bucket_id = 'media' AND allow_any_operation([...]) )
 *
 *   Le durcissement a deux façons d'échouer, et elles s'opposent :
 *
 *     1. TROP FAIBLE — `list` passe encore → l'énumération reste ouverte,
 *        le défaut n'est pas corrigé ;
 *     2. TROP FORTE  — la lecture d'un objet identifié est refusée aussi →
 *        les images du bucket ne s'affichent plus. Cette panne est
 *        **silencieuse** : aucune erreur serveur, juste des images vides.
 *
 *   Les deux sont testées ici, avec un TÉMOIN : on vérifie aussi qu'un objet
 *   inexistant est bien refusé, sinon un « 200 » ne prouverait rien (une API
 *   qui répond 200 à tout ferait passer les deux tests).
 *
 * CE QUI N'EST PAS TESTÉ ICI
 *   Le téléversement par un créateur connecté : il exige une session, que ce
 *   script n'a pas. Sa policy (`media_insert_own_folder`) est vérifiée
 *   séparément, et la migration ne la touche pas.
 *
 * Usage : node tools/storage-check/listing-lockdown-check.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const PROJECT = 'mtqfacjnwxlmcahnxmvz';
const BASE = `https://${PROJECT}.supabase.co`;

/** Lit la clé anonyme depuis .env.local (jamais écrite en dur). */
function anonKey() {
  const env = path.join(__dirname, '..', '..', '.env.local');
  const line = fs
    .readFileSync(env, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY='));
  if (!line) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY introuvable dans .env.local');
  return line.slice('NEXT_PUBLIC_SUPABASE_ANON_KEY='.length).trim().replace(/^"|"$/g, '');
}

function request(method, urlPath, body, key) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: `${PROJECT}.supabase.co`,
        path: urlPath,
        method,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: data, bytes: Buffer.byteLength(data) })
        );
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Une réponse de listage est « vide » si le tableau JSON n'a aucune entrée. */
function isEmptyList(body) {
  try {
    const v = JSON.parse(body);
    return Array.isArray(v) && v.length === 0;
  } catch {
    return false;
  }
}

(async () => {
  const key = anonKey();
  let pass = 0;
  let fail = 0;
  const check = (ok, label, detail) => {
    if (ok) {
      pass++;
      console.log(`  ok     ${label}${detail ? ' — ' + detail : ''}`);
    } else {
      fail++;
      console.log(`  ECHEC  ${label}${detail ? ' — ' + detail : ''}`);
    }
  };

  console.log('=== Verrou de listage du bucket media (migration 0013) ===\n');

  // --- 1. L'énumération doit être fermée ---------------------------------
  console.log('1. Énumération (doit être FERMÉE)');

  const root = await request('POST', '/storage/v1/object/list/media', { prefix: '', limit: 50 }, key);
  check(
    root.status === 200 && isEmptyList(root.body),
    'listage de la racine ne renvoie plus aucun dossier',
    `HTTP ${root.status}, ${JSON.parse(root.body || '[]').length ?? '?'} entrée(s)`
  );

  // Le dossier réel observé avant migration, dont les PNG fuitaient.
  const leakPrefix = '23dd01aa-c602-4b31-aa3a-002a4520adcc/frames/';
  const leak = await request('POST', '/storage/v1/object/list/media', { prefix: leakPrefix, limit: 50 }, key);
  check(
    leak.status === 200 && isEmptyList(leak.body),
    'listage d’un dossier de créateur ne renvoie plus aucun fichier',
    `HTTP ${leak.status}, ${JSON.parse(leak.body || '[]').length ?? '?'} entrée(s)`
  );

  // Un ancien comportement exposait aussi le dossier intermédiaire.
  const mid = await request(
    'POST',
    '/storage/v1/object/list/media',
    { prefix: '23dd01aa-c602-4b31-aa3a-002a4520adcc/', limit: 50 },
    key
  );
  check(
    mid.status === 200 && isEmptyList(mid.body),
    'listage du dossier intermédiaire vide lui aussi',
    `HTTP ${mid.status}`
  );

  // --- 2. La lecture d'un objet identifié doit survivre ------------------
  console.log("\n2. Lecture d'un objet identifié (doit FONCTIONNER)");

  const realPath = `${leakPrefix}0c4d574c-ea7f-4e30-9978-3f42f578fdef.png`;
  const obj = await request('GET', `/storage/v1/object/public/media/${realPath}`, null, key);
  check(
    obj.status === 200 && obj.bytes > 1000,
    'une image du bucket est toujours servie',
    `HTTP ${obj.status}, ${obj.bytes} octets`
  );

  // --- 3. Le témoin : un objet inexistant doit être refusé --------------
  //
  // Sans ce témoin, les deux « 200 » ci-dessus ne prouveraient rien : une API
  // qui répondrait 200 à tout passerait le test 2 sans servir d'image.
  console.log('\n3. Témoin négatif');

  const missing = await request(
    'GET',
    '/storage/v1/object/public/media/00000000-0000-0000-0000-000000000000/frames/inexistant.png',
    null,
    key
  );
  check(
    missing.status >= 400,
    'un objet inexistant est bien refusé',
    `HTTP ${missing.status}`
  );

  // --- 4. Aucun droit d'écriture n'a été ouvert -------------------------
  console.log("\n4. Écriture (doit rester REFUSÉE en anonyme)");

  const put = await request(
    'POST',
    '/storage/v1/object/media/tentative-anonyme.png',
    null,
    key
  );
  check(
    put.status >= 400,
    "l'anonyme ne peut toujours pas déposer de fichier",
    `HTTP ${put.status}`
  );

  console.log(`\n=== ${pass} réussis / ${fail} échoués ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
