/* PostgreSQL réel en mémoire : aucune connexion ni mutation de la base distante. */
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
let passed = 0;
async function check(label, run) { await run(); passed++; console.log(`OK ${label}`); }
async function rejects(run) { let rejected = false; try { await run(); } catch { rejected = true; } assert.equal(rejected, true, 'Le garde-fou doit refuser réellement'); }
const A = randomUUID(), B = randomUUID(), C = randomUUID(), F = randomUUID(), L = randomUUID();
const token = 'historique-temoin';
const db = new PGlite({ extensions: { pgcrypto } });
async function value(sql, args = []) { const result = await db.query(sql, args); return result.rows[0]?.value; }
async function role(name, uid, run) {
  await db.exec(`set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  try { return await run(); } finally { await db.exec('reset role'); }
}
function op() { return { id: randomUUID(), secret: 'a'.repeat(64), hash: 'b'.repeat(64), format: 'png' }; }
async function operation(action, target, request) {
  return value('select public.distribution_export_v1($1,$2,$3,$4,$5,$6) as value', [action, target, request.id, request.secret, request.format, request.hash]);
}
async function prepare() {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create publication supabase_realtime;
    create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}');
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$ select false $$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
    grant select on auth.users to anon,authenticated,service_role;`);
  const files = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    if (file.startsWith('0022')) continue;
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
  }
  await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4)', [A,'temoin-a@example.invalid',B,'temoin-b@example.invalid']);
  await db.query('insert into frames(id,owner_id) values ($1,$2)', [F,A]);
  await db.query("insert into campaigns(id,owner_id,name,slug,frame_id,status,participants_used) values ($1,$2,'Témoin isolé','temoin-isole',$3,'published',10)", [C,A,F]);
  await db.query('insert into distribution_links(id,campaign_id,token,quota_total,quota_used) values ($1,$2,$3,3,1)',[L,C,token]);
  await db.query('insert into account_credit_balances(user_id,balance) values ($1,100)',[A]);
  // Témoin rouge : l'ancien privilège UPDATE permet vraiment de fabriquer du quota.
  await role('authenticated',A,async()=> { await db.query('update distribution_links set quota_total=4 where id=$1',[L]); });
  assert.equal(await value('select quota_total as value from distribution_links where id=$1',[L]),4);
  await db.query('update distribution_links set quota_total=3 where id=$1',[L]);
  // Témoin rouge : l'ancien revoke est effectivement exécutable par PUBLIC/anon.
  assert.equal(await value("select has_function_privilege('anon','public.revoke_distribution_link(text)','EXECUTE') as value"),true);
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/0022_distribution_transactions.sql'),'utf8'));
}
(async()=> {
  await prepare();
  await check('Installation des 22 migrations et baseline historique conservée',async()=> {
    const row=(await db.query('select token,quota_total,quota_used,history_used,history_delta,funding_origin from distribution_links where id=$1',[L])).rows[0];
    assert.deepEqual(row,{token,quota_total:3,quota_used:1,history_used:1,history_delta:1,funding_origin:'historical'});
    assert.equal(await value('select count(*)::integer as value from distribution_usages'),0);
  });
  await check('Anonyme : jetons invisibles et révocation interdite',async()=> {
    await role('anon',null,async()=> {
      await rejects(()=>db.query('select * from distribution_links'));
      await rejects(()=>value('select revoke_distribution_link($1) as value',[token]));
      assert.equal(await value('select resolve_distribution($1) as value',['inconnu']),null);
    });
  });
  await check('Propriétaire B : lecture vide, logo/révocation refusés',async()=> {
    await role('authenticated',B,async()=> {
      assert.equal((await db.query('select * from distribution_links')).rows.length,0);
      assert.equal(await value('select revoke_distribution_link($1) as value',[token]),false);
      assert.equal(await value('select update_distribution_logo_v1($1,$2) as value',[token,'https://example.invalid/logo.png']),false);
    });
  });
  await check('Propriétaire A : mutations directes quota, token, plan et expiration interdites',async()=> {
    await role('authenticated',A,async()=> {
      for(const sql of ['update distribution_links set quota_total=999','update distribution_links set token=token','update campaigns set participants_granted=999',"update users set plan='org'",'update users set plan_expires_at=now()']) await rejects(()=>db.exec(sql));
      await db.query('update users set org_name=$1 where id=$2',['Organisation témoin',A]);
      await db.query('update campaigns set name=$1 where id=$2',['Campagne témoin',C]);
    });
  });
  await check('Campagne publique épuisée : accès privé indépendant, résolution pure répétable',async()=> {
    const before=await value('select row_to_json(l) as value from distribution_links l where id=$1',[L]);
    await role('anon',null,async()=> {
      const first=await value('select resolve_distribution($1) as value',[token]);
      assert.equal(first.protocol_version,1); assert.equal(first.campaign_id,C);
      assert.deepEqual(first,await value('select resolve_distribution($1) as value',[token]));
      assert.equal('quota' in first,false);
    });
    assert.deepEqual(before,await value('select row_to_json(l) as value from distribution_links l where id=$1',[L]));
  });
  let funded;
  const ref=randomUUID();
  await check('Création financée et reprise identique sans double débit',async()=> {
    await role('authenticated',A,async()=> {
      funded=await value('select create_funded_distribution_link_v1($1,1,$2) as value',[C,ref]);
      assert.equal(await value('select create_funded_distribution_link_v1($1,1,$2) as value',[C,ref]),funded);
      await rejects(()=>value('select create_funded_distribution_link_v1($1,2,$2) as value',[C,ref]));
    });
    assert.equal(await value('select balance as value from account_credit_balances where user_id=$1',[A]),99);
  });
  const requests=Array.from({length:20},op); let winner;
  await check('20 demandes simultanément soumises pour une unité : une seule réservée',async()=> {
    await role('anon',null,async()=> {
      const results=await Promise.all(requests.map((request)=>operation('reserve',funded,request)));
      assert.equal(results.filter(result=>result.state==='RESERVED').length,1);
      assert.equal(results.filter(result=>result.state==='UNAVAILABLE').length,19);
      winner=requests[results.findIndex(result=>result.state==='RESERVED')];
    });
  });
  await check('Réservation non facturée, secret erroné refusé, dernière unité confirmable',async()=> {
    assert.equal(await value('select quota_used as value from distribution_links where token=$1',[funded]),0);
    await role('anon',null,async()=> {
      assert.equal((await operation('status',funded,{...winner,secret:'c'.repeat(64)})).state,'UNAVAILABLE');
      assert.equal((await operation('reserve',funded,winner)).state,'RESERVED');
      const confirmed=await operation('confirm',funded,winner);
      assert.equal(confirmed.state,'CONFIRMED'); assert.ok(confirmed.receipt);
      assert.deepEqual(await operation('confirm',funded,winner),confirmed);
      assert.deepEqual(await operation('cancel',funded,winner),confirmed);
    });
    assert.equal(await value('select quota_used as value from distribution_links where token=$1',[funded]),1);
    assert.equal(await value('select count(*)::integer as value from distribution_usages where operation_id=$1',[winner.id]),1);
    assert.equal(await value('select participants_used as value from campaigns where id=$1',[C]),10);
  });
  await check('Épuisé/revoqué/inconnu : réponse uniforme et aucun secours économique',async()=> {
    await role('anon',null,async()=> {
      assert.deepEqual(await operation('reserve',funded,op()),{state:'UNAVAILABLE'});
      assert.deepEqual(await operation('reserve','inconnu',op()),{state:'UNAVAILABLE'});
      assert.equal(await value('select resolve_distribution($1) as value',[funded]),null);
      assert.equal(await value('select resolve_distribution($1) as value',[funded]),null);
      assert.deepEqual(await value('select to_jsonb(t) as value from claim_distribution($1) t',[token]),{granted:false,used:0,quota:0,campaign_id:null});
    });
  });
  await check('Échec de rendu : annulation idempotente libère sans usage',async()=> {
    const request=op();
    await role('anon',null,async()=> {
      assert.equal((await operation('reserve',token,request)).state,'RESERVED');
      assert.equal((await operation('cancel',token,request)).state,'CANCELLED');
      assert.equal((await operation('cancel',token,request)).state,'CANCELLED');
    });
    assert.equal(await value('select quota_used as value from distribution_links where id=$1',[L]),1);
  });
  await check('Expiration de réservation et renouvellement borné',async()=> {
    const request=op();
    await role('anon',null,()=>operation('reserve',token,request));
    await db.query("update distribution_export_operations set created_at=clock_timestamp()-interval '11 minutes',expires_at=clock_timestamp()-interval '1 minute' where operation_id=$1",[request.id]);
    await role('anon',null,async()=> { assert.equal((await operation('confirm',token,request)).state,'EXPIRED'); });
    const next=op(); await role('anon',null,async()=> { await operation('reserve',token,next); await operation('renew',token,next); await operation('cancel',token,next); });
    assert.equal(await value("select bool_and(expires_at<=created_at+interval '10 minutes') as value from distribution_export_operations"),true);
  });
  await check('Révocation avant confirmation : réservation annulée ; reçu confirmé conservé',async()=> {
    const request=op(); await role('anon',null,()=>operation('reserve',token,request));
    await role('authenticated',A,()=>value('select revoke_distribution_link($1) as value',[token]));
    await role('anon',null,async()=> { assert.deepEqual(await operation('confirm',token,request),{state:'UNAVAILABLE'}); });
    await role('authenticated',A,()=>value('select revoke_distribution_link($1) as value',[funded]));
    await role('anon',null,async()=> { assert.equal((await operation('status',funded,winner)).state,'CONFIRMED'); });
  });
  await check('Recharge même URL, remboursement acheté exactement une fois, historique non remboursable',async()=> {
    let fresh;
    await role('authenticated',A,async()=> {
      fresh=await value('select create_funded_distribution_link_v1($1,2,$2) as value',[C,randomUUID()]);
      const reference=randomUUID();
      assert.equal(await value('select recharge_distribution_v1($1,2,$2) as value',[fresh,reference]),true);
      assert.equal(await value('select recharge_distribution_v1($1,2,$2) as value',[fresh,reference]),true);
      await rejects(()=>value('select recharge_distribution_v1($1,3,$2) as value',[fresh,reference]));
      await value('select revoke_distribution_link($1) as value',[fresh]);
      assert.equal(await value('select recharge_distribution_v1($1,1,$2) as value',[fresh,randomUUID()]),false);
      assert.equal(await value('select refund_distribution_v1($1,$2) as value',[fresh,randomUUID()]),true);
      assert.equal(await value('select refund_distribution_v1($1,$2) as value',[fresh,randomUUID()]),true);
      await value('select refund_distribution_v1($1,$2) as value',[token,randomUUID()]);
    });
    assert.equal(await value('select balance as value from account_credit_balances where user_id=$1',[A]),99);
  });
  await check('Affectation publique : replay après épuisement du solde et payload lié',async()=> {
    const reference=randomUUID();
    await role('service_role',null,async()=> {
      const first=await value('select to_jsonb(allocate_account_credits($1,$2,99,$3)) as value',[A,C,reference]);
      assert.equal(first.balance,0);
      assert.equal((await value('select to_jsonb(allocate_account_credits($1,$2,99,$3)) as value',[A,C,reference])).balance,0);
      await rejects(()=>value('select allocate_account_credits($1,$2,98,$3) as value',[A,C,reference]));
    });
  });
  await check('Paiement completed terminal : callback tardif sans double crédit ni facture',async()=> {
    const deposit=randomUUID();
    await db.query("insert into payments(deposit_id,user_id,plan,amount,purchase_type,metadata) values($1,$2,null,100,'account_credits','{\"credit_amount\":10}')",[deposit,A]);
    await role('service_role',null,async()=> {
      await value('select to_jsonb(credit_account_credits($1)) as value',[deposit]);
      await value('select to_jsonb(issue_invoice_for_payment($1)) as value',[deposit]);
      await db.query("update payments set status='failed' where deposit_id=$1",[deposit]);
      assert.equal(await value('select status as value from payments where deposit_id=$1',[deposit]),'completed');
      await value('select to_jsonb(credit_account_credits($1)) as value',[deposit]);
      await value('select to_jsonb(issue_invoice_for_payment($1)) as value',[deposit]);
    });
    assert.equal(await value('select balance as value from account_credit_balances where user_id=$1',[A]),10);
    assert.equal(await value('select count(*)::integer as value from invoices'),1);
  });
  await check('Lecture propriétaire réconciliée et logo validé',async()=> {
    await role('authenticated',A,async()=> {
      const links=await value('select get_distribution_links_v1($1) as value',[C]);
      assert.ok(links.length>=3); assert.equal(links.find(l=>l.id===L).history_delta,1);
      assert.equal(await value('select update_distribution_logo_v1($1,$2) as value',[token,'https://example.invalid/logo.png']),true);
      await rejects(()=>value('select update_distribution_logo_v1($1,$2) as value',[token,'javascript:alert(1)']));
    });
  });
  console.log(`\n${passed} groupes SQL réussis. Moteur PostgreSQL embarqué mono-session : Promise.all est sérialisé ; la concurrence multi-connexion reste à vérifier avant production.`);
  fs.writeFileSync(path.join(root,'outputs/distribution-tests-sql.json'),JSON.stringify({passed,engine:'PostgreSQL PGlite',migrationCount:22,multiConnectionConcurrency:false},null,2));
  await db.close();
})().catch(async(error)=>{console.error('ÉCHEC SQL',error.message);try{await db.close();}catch{}process.exitCode=1;});
