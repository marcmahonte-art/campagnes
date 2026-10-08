/*
 * PostgreSQL réel en mémoire (PGlite) : aucune connexion ni mutation de la base
 * distante.
 *
 * Ce harnais éprouve la **migration 0024** — la partie du pass qui ne peut pas
 * être prouvée en JavaScript : idempotence de l'activation, refus d'un montant
 * ou d'une devise non conformes, unicité du pass actif par navigateur, expiration
 * automatique, et étanchéité des privilèges.
 */
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
let passed = 0;

async function check(label, run) {
  await run();
  passed += 1;
  console.log(`OK ${label}`);
}
async function rejects(run, label = 'Le garde-fou doit refuser réellement') {
  let rejected = false;
  try {
    await run();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, label);
}

const db = new PGlite({ extensions: { pgcrypto } });
async function value(sql, args = []) {
  const result = await db.query(sql, args);
  return result.rows[0]?.value;
}
async function role(name, run) {
  await db.exec(`set role ${name}`);
  try {
    return await run();
  } finally {
    await db.exec('reset role');
  }
}

const migrationFiles = fs
  .readdirSync(path.join(root, 'supabase/migrations'))
  .filter((file) => file.endsWith('.sql'))
  .sort();

async function prepare() {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create publication supabase_realtime;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, metadata jsonb default '{}');
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
    create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$ select false $$;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    grant select on auth.users to anon, authenticated, service_role;
  `);

  for (const file of migrationFiles) {
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
  }
}

/** Insère une commande de pass, comme le ferait la route d'initiation. */
async function order(browser, options = {}) {
  const {
    status = 'pending',
    amount = 500,
    currency = 'XOF',
    duration = 24,
    endsAt = null,
    checkoutId = randomUUID(),
  } = options;
  await db.query(
    `insert into public.watermark_pass_orders
       (browser_id, ua_hash, provider, checkout_id, duration_h, amount, currency, country, status, ends_at)
     values ($1, $2, 'pawapay', $3, $4, $5, $6, 'CIV', $7, $8)`,
    [browser, `ua-${browser}`, checkoutId, duration, amount, currency, status, endsAt],
  );
  return checkoutId;
}

async function activate(checkoutId, provider = null, amount = null, currency = null) {
  return value(
    'select to_jsonb(public.activate_watermark_pass($1, $2, $3, $4)) as value',
    [checkoutId, provider, amount, currency],
  );
}
async function statusOf(checkoutId) {
  return value('select status as value from public.watermark_pass_orders where checkout_id = $1', [
    checkoutId,
  ]);
}

(async () => {
  await prepare();

  await check('La table existe, sans `user_id`, avec la seule durée 24 h', async () => {
    const hasUser = await value(
      `select count(*)::integer as value from information_schema.columns
        where table_schema='public' and table_name='watermark_pass_orders' and column_name='user_id'`,
    );
    assert.equal(hasUser, 0, 'un pass anonyme ne doit jamais dépendre d’un compte');
    const durationDefault = await value(
      `select column_default as value from information_schema.columns
        where table_schema='public' and table_name='watermark_pass_orders' and column_name='duration_h'`,
    );
    assert.ok(String(durationDefault).includes('24'), `défaut de durée inattendu : ${durationDefault}`);
  });

  await check('Une durée différente de 24 h est refusée par la base', async () => {
    await rejects(() => order('durée-invalide', { duration: 12 }), 'duration_h=12 doit être refusé');
  });

  await check('RLS active, aucun privilège pour anon : la table est étanche', async () => {
    assert.equal(
      await value(
        `select relrowsecurity as value from pg_class where oid = 'public.watermark_pass_orders'::regclass`,
      ),
      true,
    );
    await role('anon', async () => {
      await rejects(() => db.query('select * from public.watermark_pass_orders'), 'anon ne doit rien lire');
      await rejects(
        () =>
          db.query(
            `insert into public.watermark_pass_orders(browser_id, ua_hash, checkout_id, amount, currency)
             values ('x', 'y', gen_random_uuid(), 1, 'XOF')`,
          ),
        'anon ne doit rien écrire',
      );
    });
  });

  await check('Seul service_role peut activer ou expirer un pass', async () => {
    assert.equal(
      await value(
        `select has_function_privilege('anon', 'public.activate_watermark_pass(uuid,text,numeric,text)', 'EXECUTE') as value`,
      ),
      false,
    );
    assert.equal(
      await value(
        `select has_function_privilege('service_role', 'public.activate_watermark_pass(uuid,text,numeric,text)', 'EXECUTE') as value`,
      ),
      true,
    );
    await role('anon', async () => {
      await rejects(() => value('select public.expire_watermark_passes() as value'));
    });
  });

  const browserA = 'navigateur-a';
  let checkoutA;
  await check('Un paiement confirmé active un pass de 24 h pile', async () => {
    checkoutA = await order(browserA);
    const row = await role('service_role', () =>
      activate(checkoutA, 'ORANGE_CIV', 500, 'XOF'),
    );
    assert.equal(row.status, 'active');
    assert.equal(row.duration_h, 24);
    assert.ok(row.starts_at, 'starts_at doit être posé à la confirmation');
    assert.ok(row.completed_at, 'completed_at doit être posé');
    assert.equal(
      await value(
        `select (ends_at = starts_at + interval '24 hours') as value
           from public.watermark_pass_orders where checkout_id = $1`,
        [checkoutA],
      ),
      true,
      'ends_at doit valoir exactement starts_at + 24 h',
    );
    assert.equal(row.provider, 'ORANGE_CIV');
  });

  await check('Une seconde activation ne prolonge ni ne recrédite', async () => {
    const before = await value(
      'select ends_at as value from public.watermark_pass_orders where checkout_id = $1',
      [checkoutA],
    );
    const row = await role('service_role', () => activate(checkoutA, 'ORANGE_CIV', 500, 'XOF'));
    assert.equal(row.status, 'active');
    const after = await value(
      'select ends_at as value from public.watermark_pass_orders where checkout_id = $1',
      [checkoutA],
    );
    assert.equal(
      new Date(after).getTime(),
      new Date(before).getTime(),
      'un rejeu ne doit pas déplacer l’échéance',
    );
    assert.equal(
      await value(
        `select count(*)::integer as value from public.watermark_pass_orders
          where browser_id = $1 and status = 'active'`,
        [browserA],
      ),
      1,
      'un rejeu ne doit pas créer un second pass actif',
    );
  });

  await check('Un pass `failed` ne peut jamais être activé a posteriori', async () => {
    const checkout = await order('navigateur-failed', { status: 'failed' });
    const row = await role('service_role', () => activate(checkout, null, 500, 'XOF'));
    assert.equal(row.status, 'failed');
    assert.equal(await statusOf(checkout), 'failed');
  });

  await check('Un pass `cancelled` ne peut jamais être activé a posteriori', async () => {
    const checkout = await order('navigateur-cancelled', { status: 'cancelled' });
    const row = await role('service_role', () => activate(checkout, null, 500, 'XOF'));
    assert.equal(row.status, 'cancelled');
  });

  await check('Un montant encaissé différent du prix serveur n’active rien', async () => {
    const checkout = await order('navigateur-montant');
    const row = await role('service_role', () => activate(checkout, null, 100, 'XOF'));
    assert.equal(row.status, 'pending', 'un paiement partiel ne doit pas ouvrir de pass');
    assert.equal(await statusOf(checkout), 'pending');
  });

  await check('Une devise différente de celle de la commande n’active rien', async () => {
    const checkout = await order('navigateur-devise');
    const row = await role('service_role', () => activate(checkout, null, 500, 'GHS'));
    assert.equal(row.status, 'pending');
  });

  await check('Sans montant transmis, l’activation reste possible (webhook sans détail)', async () => {
    const checkout = await order('navigateur-sans-montant');
    const row = await role('service_role', () => activate(checkout, null, null, null));
    assert.equal(row.status, 'active');
  });

  await check('Payer un autre checkout n’active pas ce navigateur', async () => {
    const checkoutB = await order('navigateur-b');
    await role('service_role', () => activate(checkoutB, null, 500, 'XOF'));

    // Le navigateur A garde son propre pass ; B obtient le sien, sans mélange.
    assert.equal(
      await value(
        `select count(*)::integer as value from public.watermark_pass_orders
          where browser_id = 'navigateur-b' and status = 'active'`,
      ),
      1,
    );
    assert.equal(
      await value(
        `select checkout_id as value from public.watermark_pass_orders
          where browser_id = 'navigateur-b' and status = 'active'`,
      ),
      checkoutB,
    );
  });

  await check('Un navigateur ne peut pas porter deux pass actifs à la fois', async () => {
    const ends = new Date(Date.now() + 3.6e6).toISOString();
    await order('navigateur-double', { status: 'active', endsAt: ends });
    await rejects(
      () => order('navigateur-double', { status: 'active', endsAt: ends }),
      'l’index unique partiel doit refuser un second pass actif',
    );
  });

  await check('Expiration automatique : un pass échu passe à `expired`', async () => {
    const checkout = await order('navigateur-perime', {
      status: 'active',
      endsAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await role('service_role', () => value('select public.expire_watermark_passes() as value'));
    assert.equal(await statusOf(checkout), 'expired');
  });

  await check('Activer libère l’index : un pass échu du même navigateur est expiré', async () => {
    const stale = await order('navigateur-renouvellement', {
      status: 'active',
      endsAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const fresh = await order('navigateur-renouvellement');
    const row = await role('service_role', () => activate(fresh, null, 500, 'XOF'));
    assert.equal(row.status, 'active');
    assert.equal(await statusOf(stale), 'expired');
    assert.equal(
      await value(
        `select count(*)::integer as value from public.watermark_pass_orders
          where browser_id = 'navigateur-renouvellement' and status = 'active'`,
      ),
      1,
    );
  });

  await check('Un checkout inconnu lève au lieu d’activer n’importe quoi', async () => {
    await rejects(
      () => role('service_role', () => activate(randomUUID(), null, 500, 'XOF')),
      'un checkout inconnu doit lever',
    );
  });

  console.log(
    `\n${passed} groupes SQL réussis (migration 0024, PostgreSQL embarqué mono-session).`,
  );
  await db.close();
})().catch(async (error) => {
  console.error('ÉCHEC SQL', error.message);
  try {
    await db.close();
  } catch {}
  process.exitCode = 1;
});
