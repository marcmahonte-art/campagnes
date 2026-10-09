/*
 * PostgreSQL réel en mémoire (PGlite) : aucune connexion ni mutation de la base
 * distante.
 *
 * Ce harnais éprouve les migrations **0025** et **0026** — la partie du Super
 * Admin qui ne peut pas être prouvée en JavaScript :
 *
 *   - personne n'est administrateur à l'application de la migration ;
 *   - `is_admin()` ne s'ouvre jamais seul, y compris quand la table n'existe
 *     pas ou quand la requête échoue ;
 *   - aucun rôle client ne peut écrire dans `admin_members` ;
 *   - le journal d'audit est réellement immuable, y compris pour
 *     `service_role` ;
 *   - un administrateur suspendu perd ses droits sans effacer son historique.
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

async function rows(sql, args = []) {
  const result = await db.query(sql, args);
  return result.rows;
}

/*
 * Changement de rôle.
 *
 * `set role` ne suffit pas ici : PGlite ouvre la session en `postgres`, qui
 * est superutilisateur et **contourne RLS** — les policies sembleraient
 * respectées alors qu'elles ne seraient jamais évaluées. On passe donc par
 * `set session authorization`, qui retire réellement le privilège, vers des
 * rôles d'essai sans superutilisateur mais membres de `anon` /
 * `authenticated`.
 */
const TEST_ROLES = {
  anon: 'test_anon',
  authenticated: 'test_authenticated',
  service_role: 'service_role',
};

async function role(name, run) {
  const target = TEST_ROLES[name] ?? name;
  await db.exec(`set session authorization ${target}`);
  try {
    return await run();
  } finally {
    // `reset session authorization` dépend de l'implémentation : on repasse
    // explicitement par le superutilisateur pour ne jamais laisser la session
    // dans un rôle restreint entre deux vérifications.
    await db.exec('set session authorization postgres');
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
    -- Rôles d'essai : membres des rôles Supabase, mais SANS superutilisateur,
    -- sinon RLS ne serait jamais évaluée et tout test de policy serait faux.
    create role test_anon login;
    create role test_authenticated login;
    grant anon to test_anon;
    grant authenticated to test_authenticated;
    grant usage on schema public, auth, storage to test_anon, test_authenticated;
    grant select, insert on auth.users to test_anon, test_authenticated;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    grant select on auth.users to anon, authenticated, service_role;
  `);

  for (const file of migrationFiles) {
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
  }
}

/**
 * Se fait passer pour l'utilisateur `id` **connecté**.
 *
 * La session doit combiner deux choses : le rôle `authenticated` (sinon les
 * policies ne s'appliquent pas) et le JWT `sub` (sinon `auth.uid()` reste
 * vide). Régler l'un sans l'autre donnerait un test qui passe à tort.
 */
async function asUser(id, run) {
  const uuid = id ?? randomUUID();
  return role('authenticated', async () => {
    await db.exec(`set request.jwt.claim.sub = '${uuid}'`);
    try {
      return await run(uuid);
    } finally {
      await db.exec("set request.jwt.claim.sub = ''");
    }
  });
}

/**
 * Déclare un administrateur.
 *
 * L'ordre n'est pas un détail : `user_id` référence **`auth.users`**, donc la
 * session doit exister avant le droit. C'est précisément ce qui empêche de
 * nommer administrateur un identifiant qui n'a jamais ouvert de session.
 */
async function member(id, options = {}) {
  const { role: adminRole = 'super_admin', status = 'active' } = options;
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@exemple.test`]);
  await db.query(
    `insert into public.admin_members (user_id, role, status) values ($1, $2, $3)`,
    [id, adminRole, status],
  );
}

(async () => {
  await prepare();

  await check('La table des administrateurs est créée VIDE', async () => {
    const count = await value('select count(*)::integer as value from public.admin_members');
    assert.equal(count, 0, 'aucune migration ne doit désigner d’administrateur');
  });

  await check('Personne n’est admin juste après la migration', async () => {
    const verdict = await asUser(randomUUID(), () => value('select public.is_admin() as value'));
    assert.equal(verdict, false);
  });

  await check('Un compte non administrateur ne voit pas les autres membres', async () => {
    const other = randomUUID();
    await member(other);
    const visible = await asUser(randomUUID(), () =>
      value('select count(*)::integer as value from public.admin_members'),
    );
    assert.equal(visible, 0, 'la policy ne laisse voir que sa propre ligne');

    const mine = await asUser(other, () =>
      value('select count(*)::integer as value from public.admin_members'),
    );
    assert.equal(mine, 1, 'un administrateur voit au moins sa propre ligne');
  });

  await check('Le bon compte est reconnu administrateur', async () => {
    const id = randomUUID();
    await member(id);
    const verdict = await asUser(id, () => value('select public.is_admin() as value'));
    assert.equal(verdict, true);
  });

  await check('Un administrateur suspendu perd son droit sans disparaître', async () => {
    const id = randomUUID();
    await member(id, { status: 'suspended' });
    assert.equal(await asUser(id, () => value('select public.is_admin() as value')), false);
    assert.equal(
      await value('select count(*)::integer as value from public.admin_members where user_id = $1', [id]),
      1,
      'la suspension retire un droit, elle n’efface pas l’historique',
    );
  });

  await check('Aucun rôle client ne peut écrire dans admin_members', async () => {
    await role('anon', async () => {
      await rejects(
        () =>
          db.query(
            `insert into public.admin_members (user_id, role) values (gen_random_uuid(), 'super_admin')`,
          ),
        'anon ne doit jamais pouvoir se nommer administrateur',
      );
    });
    await role('authenticated', async () => {
      await rejects(
        () =>
          db.query(
            `insert into public.admin_members (user_id, role) values (gen_random_uuid(), 'super_admin')`,
          ),
        'un client connecté ne doit jamais s’auto-promouvoir',
      );
      await rejects(
        () => db.query(`update public.admin_members set status = 'active'`),
        'un client ne doit pas réactiver une suspension',
      );
    });
  });

  await check('`is_admin()` échoue fermé quand la table disparaît', async () => {
    const id = randomUUID();
    await member(id);
    assert.equal(await asUser(id, () => value('select public.is_admin() as value')), true);

    // On retire la table sous la fonction : c'est exactement le scénario d'une
    // migration non appliquée sur un environnement.
    await db.exec('alter table public.admin_members rename to admin_members_hidden');
    try {
      const verdict = await asUser(id, () => value('select public.is_admin() as value'));
      assert.equal(verdict, false, 'sans table, le verdict doit être false, pas une erreur ouverte');
    } finally {
      await db.exec('alter table public.admin_members_hidden rename to admin_members');
    }
  });

  await check('Le journal est refusé à tous les rôles clients', async () => {
    await role('anon', async () => {
      await rejects(() => db.query('select * from public.admin_audit_log'));
    });
    await role('authenticated', async () => {
      await rejects(() => db.query('select * from public.admin_audit_log'));
      await rejects(
        () =>
          db.query(
            `insert into public.admin_audit_log (actor_id, action) values (gen_random_uuid(), 'export:users')`,
          ),
        'personne n’écrit son propre journal',
      );
    });
  });

  await check('`log_admin_action` est réservée à service_role', async () => {
    assert.equal(
      await value(
        `select has_function_privilege('authenticated', 'public.log_admin_action(uuid,text,text,text,text,text,jsonb)', 'EXECUTE') as value`,
      ),
      false,
    );
    assert.equal(
      await value(
        `select has_function_privilege('service_role', 'public.log_admin_action(uuid,text,text,text,text,text,jsonb)', 'EXECUTE') as value`,
      ),
      true,
    );
  });

  await check('Une entrée de journal est écrite avec son motif et son contexte', async () => {
    const actor = randomUUID();
    const id = await role('service_role', () =>
      value(
        `select public.log_admin_action($1, $2, $3, $4, $5, $6, $7::jsonb) as value`,
        [actor, 'pilotage@campagnes.app', 'export:users', 'users', null, 'Audit trimestriel', { rows: 12 }],
      ),
    );
    assert.ok(id, 'l’écriture doit renvoyer un identifiant');

    const entry = (
      await rows('select * from public.admin_audit_log where id = $1', [id])
    )[0];
    assert.equal(entry.action, 'export:users');
    assert.equal(entry.resource_type, 'users');
    assert.equal(entry.reason, 'Audit trimestriel');
    assert.equal(entry.metadata_safe.rows, 12);
    assert.equal(entry.actor_email, 'pilotage@campagnes.app');
  });

  await check('Le journal est immuable, y compris pour service_role', async () => {
    const id = await value('select id as value from public.admin_audit_log limit 1');
    await role('service_role', async () => {
      await rejects(
        () => db.query(`update public.admin_audit_log set reason = 'motif réécrit' where id = $1`, [id]),
        'une trace ne se réécrit pas',
      );
      await rejects(
        () => db.query('delete from public.admin_audit_log where id = $1', [id]),
        'une trace ne se supprime pas',
      );
    });
  });

  await check('Un type de ressource vide retombe sur « - » plutôt que sur une erreur', async () => {
    const id = await role('service_role', () =>
      value(`select public.log_admin_action($1, null, $2, $3, null, null, null) as value`, [
        randomUUID(),
        'admin:access',
        '   ',
      ]),
    );
    const entry = (await rows('select resource_type as value from public.admin_audit_log where id = $1', [id]))[0];
    assert.equal(entry.value, '-');
  });

  await check('Un rôle inconnu est refusé par la base elle-même', async () => {
    await rejects(
      () =>
        db.query(
          `insert into public.admin_members (user_id, role) values (gen_random_uuid(), 'organization')`,
        ),
      'une formule commerciale n’est pas un rôle d’administration',
    );
  });

  console.log(`\n${passed} groupe(s) SQL vert(s).`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
