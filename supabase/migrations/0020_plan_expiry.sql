-- =====================================================================
--  Campagnes — Migration 0020 : échéance des abonnements
--  Cible : Supabase / Postgres 15+
--
--  Objet :
--    Donner une **date de fin** aux formules payantes, et l'appliquer.
--
--  Le défaut que cette migration corrige :
--    Jusqu'ici, `set_user_plan(user, plan)` écrivait `users.plan` sans aucune
--    notion de durée. Le webhook recevait bien `metadata.duration` — écrit à
--    l'initiation — mais **aucun code ne le relisait**. Conséquence directe :
--    un client qui payait 3 000 FCFA pour **1 mois** obtenait la formule
--    Créateur à vie. C'est une perte d'argent sèche et un écart avec ce
--    qu'annonce la page Tarifs (« par mois », « 6 mois », « par an »).
--
--  La correction, en trois pièces :
--    1. `users.plan_expires_at` — la date de fin, NULL pour une formule
--       gratuite (qui n'expire pas) ;
--    2. `set_user_plan(user, plan, expires_at)` — la fonction qui écrit ;
--    3. `expire_due_plans()` — la fonction qui repasse les formules arrivées à
--       échéance, appelée par un cron quotidien.
--
--  Ce que la migration NE fait PAS :
--    Elle ne débite pas. Une formule qui expire rend simplement ses modules
--    premium verrouillés, comme le fait la formule gratuite. Aucune
--    reconduction automatique n'est mise en place — un client ne doit jamais
--    être rejoué sans son accord, et la page Conditions l'indique.
--
--  À exécuter après 0019_lock_down_truncate.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La date d'échéance
--
--    `plan_expires_at` est le moment où la formule **cesse** de s'appliquer,
--    pas celui où l'utilisateur perd l'accès aux données : ses campagnes, ses
--    documents et ses participants restent intacts. Seul l'accès aux modules
--    premium se referme.
-- ---------------------------------------------------------------------
alter table public.users
  add column if not exists plan_expires_at timestamptz;

create index if not exists idx_users_plan_expires_at
  on public.users(plan_expires_at)
  where plan_expires_at is not null;

comment on column public.users.plan_expires_at is
  'Date de fin de la formule payée. NULL pour la formule gratuite (qui n''expire pas) et pour un compte de démonstration. Une formule expirée mais non encore reprise par le cron reste lisible : c''est `expire_due_plans()` qui la ramène à ''free''.';

-- ---------------------------------------------------------------------
-- 2. `set_user_plan` écrit désormais la durée
--
--    `p_expires_at` est NULL pour la formule gratuite. La colonne est
--    réécrite à chaque activation : un renouvellement à 12 mois remplace donc
--    la date au lieu de s'y accumuler.
--
--    Le calcul de l'échéance à partir de la durée se fait **en SQL**, à partir
--    de `metadata.duration`. C'est le même champ écrit par
--    `app/api/payments/pawapay/initiate/route.ts` au moment de l'achat.
-- ---------------------------------------------------------------------
create or replace function public.plan_expiry_from_duration(
  p_duration      text,
  p_reference     timestamptz default now()
)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_duration = '12m' then p_reference + interval '12 months'
    when p_duration = '6m'  then p_reference + interval '6 months'
    when p_duration = '1m'  then p_reference + interval '1 month'
    else p_reference + interval '1 month'
  end;
$$;

comment on function public.plan_expiry_from_duration(text, timestamptz) is
  'Traduit une durée d''abonnement (''1m'', ''6m'', ''12m'') en date d''échéance. Une durée absente ou inconnue vaut 1 mois : mieux vaut un abonnement court qu''une formule accordée à vie par défaut.';

-- ---------------------------------------------------------------------
-- 3. Le setter, avec l'échéance
--
--    On **remplace** l'ancienne fonction à deux arguments : même nom, donc les
--    appelants existants continuent de compiler côté Postgres, mais la
--    signature à trois arguments est distincte en SQL. On supprime donc
--    explicitement l'ancienne pour ne pas laisser deux fonctions en service
--    dont une seule écrit l'échéance.
--
--    Le garde `p_expires_at` à NULL avec un plan payant est laissé possible :
--    l'exploitant peut attribuer une formule « à vie » lors d'une opération
--    commerciale (don, partenariat). C'est un choix explicite, pas un oubli.
-- ---------------------------------------------------------------------
drop function if exists public.set_user_plan(uuid, plan_kind);

create or replace function public.set_user_plan(
  p_user_id     uuid,
  p_plan        plan_kind,
  p_expires_at  timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'Identifiant de compte requis.';
  end if;

  update public.users
     set plan = p_plan,
         plan_expires_at = case
           when p_plan = 'free' then null
           else p_expires_at
         end
   where id = p_user_id;

  if not found then
    raise exception 'Aucun compte pour l''identifiant %', p_user_id;
  end if;
end;
$$;

revoke all on function public.set_user_plan(uuid, plan_kind, timestamptz)
  from public, anon, authenticated;

grant execute on function public.set_user_plan(uuid, plan_kind, timestamptz) to service_role;

comment on function public.set_user_plan(uuid, plan_kind, timestamptz) is
  'Active une formule pour un compte donné, jusqu''à p_expires_at (NULL = pas d''échéance). Réservée à service_role : webhook de paiement, cron d''expiration et activation manuelle par l''exploitant. Aucun client ne doit pouvoir l''appeler.';

-- ---------------------------------------------------------------------
-- 4. `complete_payment_and_activate_plan` transmet la durée
--
--    La fonction relit `metadata.duration` et la convertit en date d'échéance.
--    Elle reste idempotente : le garde `status = 'completed'` précède tout, un
--    rejeu de webhook ne réécrit donc jamais l'échéance d'un abonnement déjà
--    payé.
-- ---------------------------------------------------------------------
create or replace function public.complete_payment_and_activate_plan(
  p_deposit_id uuid,
  p_provider   text default null,
  p_phone      text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment  public.payments;
  v_duration text;
  v_expires  timestamptz;
begin
  select * into v_payment from public.payments
  where deposit_id = p_deposit_id
  for update;

  if not found then
    raise exception 'Paiement introuvable pour deposit_id: %', p_deposit_id;
  end if;

  if v_payment.status = 'completed' then
    return v_payment;
  end if;

  update public.payments
  set
    status = 'completed',
    provider = coalesce(p_provider, provider),
    phone_number = coalesce(p_phone, phone_number),
    updated_at = now()
  where deposit_id = p_deposit_id
  returning * into v_payment;

  /*
   * Un paiement sans formule ne peut pas activer d'abonnement. On refuse
   * plutôt que d'écrire NULL : ce serait un bug de la route `/initiate`.
   */
  if v_payment.plan is null then
    raise exception
      'Paiement % sans formule : un pack de distribution n''active aucun abonnement.', p_deposit_id;
  end if;

  v_duration := v_payment.metadata ->> 'duration';
  v_expires  := public.plan_expiry_from_duration(v_duration, now());

  perform public.set_user_plan(v_payment.user_id, v_payment.plan, v_expires);

  return v_payment;
end;
$$;

revoke all on function public.complete_payment_and_activate_plan(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_payment_and_activate_plan(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
-- 5. L'expiration — appelée par un cron quotidien
--
--    `for update skip locked` : plusieurs invocations concurrentes du cron ne
--    se marchent pas dessus et ne se contentent pas deux fois.
--
--    La fonction renvoie le nombre de comptes basculés, ce qui donne au cron un
--    chiffre à journaliser — sinon une exécution muette est indiscernable d'une
--    exécution sans effet.
-- ---------------------------------------------------------------------
create or replace function public.expire_due_plans()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with due as (
    select id
      from public.users
     where plan <> 'free'
       and plan_expires_at is not null
       and plan_expires_at <= now()
     for update skip locked
  )
  update public.users u
     set plan = 'free',
         plan_expires_at = null
   where u.id in (select id from due);

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

revoke all on function public.expire_due_plans() from public, anon, authenticated;
grant execute on function public.expire_due_plans() to service_role;

comment on function public.expire_due_plans() is
  'Ramène à la formule gratuite les comptes dont l''abonnement a atteint sa date d''échéance. Idempotente et sûre en concurrence (`for update skip locked`). Réservée à service_role : appelée par un cron quotidien.';

-- ---------------------------------------------------------------------
-- 6. Recharger le cache de schéma de PostgREST
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';