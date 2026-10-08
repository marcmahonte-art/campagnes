/*
 * Contrôle `check:free-limit` — limite d'une campagne par compte Gratuit.
 *
 * PostgreSQL réel en mémoire (PGlite) : aucune connexion ni mutation de la base
 * distante. Les 23 migrations sont rejouées, puis on mesure le comportement du
 * trigger `enforce_free_campaign_limit` (migration 0023) :
 *   - 1re campagne Gratuit acceptée, 2e refusée avec le préfixe
 *     `FREE_CAMPAIGN_LIMIT` (le contrat de message reconnu par le client) ;
 *   - formule payante : aucune limite ;
 *   - formule payante expirée : la limite s'applique (plan effectif) ;
 *   - non-rétroactif : un compte qui redescend Gratuit conserve ses campagnes ;
 *   - TÉMOIN : trigger désactivé, la 2e campagne repasse — le contrôle n'est
 *     donc pas vert par hasard.
 */
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const db = new PGlite({ extensions: { pgcrypto } });
let passed = 0;
const failures = [];

async function check(label, run) {
  try {
    await run();
    passed++;
    console.log(`OK   ${label}`);
  } catch (error) {
    failures.push(`${label} → ${error && error.message ? error.message.split('\n')[0] : error}`);
    console.log(`ECHEC ${label} → ${error && error.message ? error.message.split('\n')[0] : error}`);
  }
}
async function rejects(run) {
  let rejected = false;
  let message = '';
  try {
    await run();
  } catch (error) {
    rejected = true;
    message = String(error && error.message ? error.message : error);
  }
  assert.equal(rejected, true, 'le garde-fou doit refuser réellement');
  assert.ok(
    message.includes('FREE_CAMPAIGN_LIMIT'),
    `le refus doit porter le préfixe FREE_CAMPAIGN_LIMIT, reçu : ${message}`,
  );
}

const migrations = fs
  .readdirSync(path.join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();

async function prepare() {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create publication supabase_realtime;
    create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}');
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
    create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$ select false $$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
    grant select on auth.users to anon,authenticated,service_role;`);
  for (const file of migrations) {
    if (file.startsWith('0022')) continue;
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
  }
  await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/0022_distribution_transactions.sql'), 'utf8'));
}

const FREE = randomUUID();
const PAID = randomUUID();
const EXPIRED = randomUUID();
const LEGACY = randomUUID();

async function makeUser(id, email, plan) {
  await db.query('insert into auth.users(id,email) values ($1,$2)', [id, email]);
  await db.query('update public.users set plan=$2 where id=$1', [id, plan]);
}
async function makeFrame(owner) {
  const id = randomUUID();
  await db.query('insert into frames(id,owner_id) values ($1,$2)', [id, owner]);
  return id;
}
async function addCampaign(owner, frame, name) {
  await db.query(
    "insert into campaigns(id,owner_id,name,slug,frame_id,status,participants_used) values ($1,$2,$3,$4,$5,'draft',0)",
    [randomUUID(), owner, name, `${name.toLowerCase()}-${randomUUID().slice(0, 8)}`, frame],
  );
}

(async () => {
  await prepare();
  console.log(`migrations rejouées : ${migrations.length}`);

  await makeUser(FREE, 'free@example.invalid', 'free');
  await makeUser(PAID, 'paid@example.invalid', 'creator');
  await makeUser(EXPIRED, 'expired@example.invalid', 'creator');
  await makeUser(LEGACY, 'legacy@example.invalid', 'creator');
  await db.query("update public.users set plan_expires_at = now() - interval '1 day' where id=$1", [EXPIRED]);

  const fFree = await makeFrame(FREE);
  const fPaid = await makeFrame(PAID);
  const fExp = await makeFrame(EXPIRED);
  const fLeg = await makeFrame(LEGACY);

  await check('Gratuit : la première campagne passe', async () => {
    await addCampaign(FREE, fFree, 'C1');
  });

  await check('Gratuit : la deuxième campagne est refusée par le trigger', async () => {
    await rejects(() => addCampaign(FREE, fFree, 'C2'));
  });

  await check('Créateur : deux campagnes passent (aucune limite)', async () => {
    await addCampaign(PAID, fPaid, 'P1');
    await addCampaign(PAID, fPaid, 'P2');
  });

  await check('Formule payante expirée : la deuxième est refusée', async () => {
    await addCampaign(EXPIRED, fExp, 'E1');
    await rejects(() => addCampaign(EXPIRED, fExp, 'E2'));
  });

  await check('Non rétroactif : un compte qui redescend Gratuit garde ses campagnes', async () => {
    await addCampaign(LEGACY, fLeg, 'L1');
    await addCampaign(LEGACY, fLeg, 'L2');
    await db.query("update public.users set plan='free' where id=$1", [LEGACY]);
    const count = (await db.query('select count(*)::int as n from campaigns where owner_id=$1', [LEGACY])).rows[0].n;
    assert.equal(count, 2);
    await rejects(() => addCampaign(LEGACY, fLeg, 'L3'));
  });

  /*
   * Témoin : sans le trigger, la 2e campagne repasse. Sans ce témoin, un
   * harnais qui échouerait pour une autre raison (contrainte de slug, RLS)
   * se lirait comme une limite respectée.
   */
  await check('Témoin : trigger désactivé, la deuxième campagne repasse', async () => {
    await db.exec('alter table public.campaigns disable trigger enforce_free_campaign_limit');
    await addCampaign(FREE, fFree, 'C2');
    await db.exec('alter table public.campaigns enable trigger enforce_free_campaign_limit');
  });

  console.log(`\n${passed} réussi(s), ${failures.length} échec(s)`);
  if (failures.length) process.exitCode = 1;
})();
