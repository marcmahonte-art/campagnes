/**
 * Vérification EN DIRECT de la migration 0018 — transaction annulée.
 *
 * Contraintes de l'API Supabase Management :
 *   - **seul le dernier jeu de résultats est renvoyé** ;
 *   - un `do $$` ne peut pas contenir `rollback` (c'est une instruction de
 *     niveau transaction, interdite dans un bloc PL/pgSQL).
 *
 * On encapsule donc : `begin; do $$…$$; select …; rollback;`. Le `rollback`
 * n'émet pas de jeu de résultats, donc le dernier jeu est bien notre `select`.
 * Vérifié en pratique ci-dessous : si l'API renvoyait vide, on le verrait.
 *
 * Ce que ça prouve :
 *   - un pack crédite bien le quota de SA campagne ;
 *   - un webhook rejoué ne crédite PAS deux fois (idempotence réelle) ;
 *   - un second paiement crédite son propre volume.
 * Rien n'est persisté : la transaction est annulée, on le contrôle après coup.
 */
const REF = 'mtqfacjnwxlmcahnxmvz';

const q = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.SUPABASE_PAT,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (r.status >= 400) throw new Error(`HTTP ${r.status}: ${text.slice(0, 700)}`);
  return JSON.parse(text);
};

(async () => {
  const owners = await q(`select id from public.users order by created_at limit 1`);
  if (!owners.length) return console.log('SKIP : aucun utilisateur en base.');
  const ownerId = owners[0].id;

  const camps = await q(
    `select id, coalesce(name,'(sans nom)') as name, participants_granted from public.campaigns limit 1`,
  );
  if (!camps.length) return console.log('SKIP : aucune campagne en base.');
  const camp = camps[0];

  const dep1 = '11111111-1111-4111-8111-111111111111';
  const dep2 = '22222222-2222-4222-8222-222222222222';

  const script = `
begin;

do $$
declare
  v_dep1 uuid := '${dep1}';
  v_dep2 uuid := '${dep2}';
  v_camp uuid := '${camp.id}';
  v_owner uuid := '${ownerId}';
  v_res jsonb;
  v_start int;
  v_q1 int;
  v_q_rejeu int;
  v_q_final int;
  v_completed int;
begin
  select participants_granted into v_start from public.campaigns where id = v_camp;

  insert into public.payments (deposit_id, user_id, plan, campaign_id, amount, currency, status, metadata)
  values
    (v_dep1, v_owner, null, v_camp, 5000, 'XOF', 'pending', '{"is_pack":true,"distributions":500}'::jsonb),
    (v_dep2, v_owner, null, v_camp, 2500, 'XOF', 'pending', '{"is_pack":true,"distributions":100}'::jsonb);

  perform public.credit_campaign_quota(v_dep1);
  select participants_granted into v_q1 from public.campaigns where id = v_camp;

  perform public.credit_campaign_quota(v_dep1);          -- REJEU
  select participants_granted into v_q_rejeu from public.campaigns where id = v_camp;

  perform public.credit_campaign_quota(v_dep2);
  select participants_granted into v_q_final from public.campaigns where id = v_camp;

  select count(*)::int into v_completed
    from public.payments
   where deposit_id in (v_dep1, v_dep2) and status = 'completed';

  v_res := jsonb_build_object(
    'quota_depart',       v_start,
    'quota_apres_500',    v_q1,
    'quota_apres_rejeu',  v_q_rejeu,
    'quota_final',        v_q_final,
    'payments_completed', v_completed
  );
  perform set_config('app.verdict', v_res::text, false);
end;
$$;

select current_setting('app.verdict', true)::jsonb as verdict;

rollback;
`;

  const out = await q(script);
  const verdict = Array.isArray(out) && out[0] && out[0].verdict ? out[0].verdict : null;
  if (!verdict) {
    console.log('Verdict brut inexploitable :', JSON.stringify(out));
    process.exitCode = 2;
    return;
  }

  const attendu_apres_500 = verdict.quota_depart + 500;
  const attendu_final = verdict.quota_depart + 600;
  const ok_nominal = verdict.quota_apres_500 === attendu_apres_500;
  const ok_rejeu = verdict.quota_apres_rejeu === verdict.quota_apres_500;
  const ok_final = verdict.quota_final === attendu_final;
  const ok_completed = verdict.payments_completed === 2;

  console.log('');
  console.log(`quota initial           : ${verdict.quota_depart}`);
  console.log(`après pack de 500       : ${verdict.quota_apres_500}   ${ok_nominal ? '✓' : '✗'} (attendu ${attendu_apres_500})`);
  console.log(`après REJEU du même     : ${verdict.quota_apres_rejeu}   ${ok_rejeu ? '✓ pas de double crédit' : '✗ DOUBLE CRÉDIT'}`);
  console.log(`après 2e pack (100)     : ${verdict.quota_final}   ${ok_final ? '✓' : '✗'} (attendu ${attendu_final})`);
  console.log(`paiements completed     : ${verdict.payments_completed}   ${ok_completed ? '✓' : '✗'}`);
  console.log('');

  // Contrôle du rollback : rien ne doit rester en base.
  const leftover = await q(
    `select count(*)::int as n from public.payments where deposit_id in ('${dep1}','${dep2}')`,
  );
  const campAfter = await q(
    `select participants_granted from public.campaigns where id = '${camp.id}'`,
  );
  const ok_rollback =
    leftover[0].n === 0 && campAfter[0].participants_granted === verdict.quota_depart;
  console.log(
    `nettoyage (rollback)    : ${leftover[0].n} paiement(s) restant(s), quota revenu à ${campAfter[0].participants_granted}   ${ok_rollback ? '✓ rien persisté' : '✗ ÉCRITURE PERSISTÉE'}`,
  );
  console.log('');

  const allOk = ok_nominal && ok_rejeu && ok_final && ok_completed && ok_rollback;
  console.log(allOk ? 'IDEMPOTENCE PROUVÉE EN BASE RÉELLE.' : 'ÉCHEC — voir ci-dessus.');
  process.exitCode = allOk ? 0 : 1;
})();
