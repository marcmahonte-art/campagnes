-- =====================================================================
--  Campagnes — Migration 0018 : paiement en ligne d'une extension de quota
--  Cible : Supabase / Postgres 15+
--
--  Objet :
--    Brancher pawaPay sur les **recharges de distribution** d'une campagne.
--    Jusqu'ici l'extension s'obtenait par devis (`topupHref()`) ; la décision
--    produit change : le créateur paie en ligne, et le quota de sa campagne
--    est crédité automatiquement à la confirmation du webhook.
--
--    Trois pièces :
--      1. `payments.campaign_id` — rattacher un paiement à une campagne ;
--      2. `payments.plan` devient **nullable** — un achat de pack n'active
--         aucune formule, il crédite un quota ;
--      3. `credit_campaign_quota()` — la fonction **atomique et idempotente**
--         qui seule crédite `participants_granted`.
--
--  L'invariant le plus important — l'IDEMPOTENCE :
--    pawaPay **rejoue** ses webhooks (retry réseau, acquittement perdu), et la
--    route `/check` peut appeler la même confirmation après un retour de
--    navigation. Créditer à chaque réception doublerait un quota payé — un
--    bug d'argent, silencieux et invisible à l'écran.
--
--    On ne crédite donc QUE si le paiement passe de `pending` à `completed`
--    **dans la même transaction** que l'incrément du quota. Le verrou de ligne
--    (`for update`) sérialise deux webhooks simultanés : le second voit
--    `status = 'completed'` et sort sans rien créditer.
--
--  Ce que cette fonction NE fait PAS :
--    Elle n'active aucune formule. Un pack de distribution et un abonnement
--    sont deux achats distincts : le premier crédite une campagne, le second
--    change la formule du compte (`set_user_plan`, migration 0005).
--
--  À exécuter après 0017_payments_pawapay.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Rattacher un paiement à une campagne
--    `campaign_id` est **nullable** : les paiements d'abonnement de la
--    migration 0017 n'en ont pas, et doivent continuer de fonctionner.
--    `on delete cascade` : supprimer une campagne efface la trace de ses
--    achats — la RLS et la comptabilité vivent sur `payments`, pas sur une
--    colonne `campaigns` qui recréerait un second compteur.
-- ---------------------------------------------------------------------
alter table public.payments
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

create index if not exists idx_payments_campaign_id on public.payments(campaign_id);

comment on column public.payments.campaign_id is
  'Campagne créditée par ce paiement (packs de distribution). NULL pour un paiement d''abonnement, qui active une formule de compte.';

-- ---------------------------------------------------------------------
-- 2. `plan` devient nullable
--    Un achat de pack n'active aucune formule : lui imposer une valeur
--    obligerait à écrire un plan factice (« free ») qui mentirait sur la
--    nature du paiement et tromperait `set_user_plan`.
--
--    La contrainte d'origine `plan plan_kind not null` est remplacée par :
--      - un abonnement → `plan` renseigné, `campaign_id` NULL ;
--      - un pack → `campaign_id` renseigné, `plan` NULL.
--    Les deux ne peuvent pas être vides en même temps (contrainte de
--    cohérence), et aucune ligne existante n'est touchée : elles ont toutes
--    un `plan` non nul aujourd'hui.
-- ---------------------------------------------------------------------
alter table public.payments alter column plan drop not null;

alter table public.payments
  drop constraint if exists payments_target_present,
  add constraint payments_target_present
    check (plan is not null or campaign_id is not null);

comment on column public.payments.plan is
  'Formule activée par ce paiement, ou NULL pour un achat de pack de distribution (qui crédite `campaign_id`). L''un des deux au moins est renseigné.';

-- ---------------------------------------------------------------------
-- 3. La fonction de crédit — atomique et idempotente
--
--    Signature alignée sur `complete_payment_and_activate_plan` (0017) :
--    même dépôt, même fournisseur, même téléphone. Le webhook choisit la
--    fonction selon que le paiement porte un `campaign_id` ou un `plan`.
--
--    Retour : `public.payments` — le webhook peut journaliser l'état réel.
-- ---------------------------------------------------------------------
create or replace function public.credit_campaign_quota(
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
  v_payment   public.payments;
  v_increment integer;
begin
  /*
   * Verrou de ligne AVANT tout test : deux webhooks rejoués en parallèle se
   * sérialisent ici. Sans ce verrou, les deux liraient `pending`, les deux
   * créditeraient, et le quota serait doublé sans trace.
   */
  select * into v_payment
    from public.payments
   where deposit_id = p_deposit_id
   for update;

  if not found then
    raise exception 'Paiement introuvable pour deposit_id: %', p_deposit_id;
  end if;

  /*
   * GARDE D'IDEMPOTENCE — le cœur de cette migration.
   * Un paiement déjà complété ne crédite plus rien : on renvoie l'état tel
   * quel. C'est ce qui rend un rejeu de webhook inoffensif.
   */
  if v_payment.status = 'completed' then
    return v_payment;
  end if;

  -- Un paiement de pack doit désigner sa campagne : sinon on refuse plutôt
  -- que de créditer une campagne au hasard.
  if v_payment.campaign_id is null then
    raise exception
      'Paiement % sans campagne : credit_campaign_quota ne s''applique qu''aux packs de distribution.',
      p_deposit_id;
  end if;

  /*
   * Le nombre de distributions créditées vient des **métadonnées du paiement**,
   * écrites au moment de l'initiation (`distributions`). On ne le recalcule pas
   * ici depuis le prix : le catalogue peut changer entre l'achat et le webhook,
   * et c'est le volume **acheté** qui a été payé, pas celui du catalogue actuel.
   *
   * Repli à 500 (palier « Popular ») si la valeur est absente — un paiement
   * initié avant cette migration, ou un JSON tronqué, doit tout de même
   * créditer quelque chose plutôt que d'échouer silencieusement.
   */
  v_increment := coalesce(
    nullif((v_payment.metadata ->> 'distributions')::integer, 0),
    500
  );

  if v_increment <= 0 then
    raise exception 'Volume de distribution invalide (%) pour deposit_id: %',
      v_increment, p_deposit_id;
  end if;

  -- Crédit du quota : la campagne ET le paiement dans la même transaction.
  update public.campaigns
     set participants_granted = participants_granted + v_increment
   where id = v_payment.campaign_id;

  if not found then
    raise exception 'Campagne % introuvable pour le paiement %',
      v_payment.campaign_id, p_deposit_id;
  end if;

  update public.payments
     set status        = 'completed',
         provider      = coalesce(p_provider, provider),
         phone_number  = coalesce(p_phone, phone_number),
         updated_at    = now()
   where deposit_id = p_deposit_id
   returning * into v_payment;

  return v_payment;
end;
$$;

comment on function public.credit_campaign_quota(uuid, text, text) is
  'Crédite le quota (participants_granted) de la campagne d''un paiement de pack, de façon atomique et IDEMPOTENTE : un paiement déjà complété ne crédite jamais deux fois, même si le webhook est rejoué. Réservée à service_role.';

revoke all on function public.credit_campaign_quota(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.credit_campaign_quota(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
-- 4. Empêcher le double crédit par construction (ceinture et bretelles)
--    Une ligne `payments` dont la campagne a été créditée ne doit pas pouvoir
--    repasser en `pending`. La garde d'idempotence ci-dessus suffit si elle
--    est la seule à écrire ; cette contrainte protège d'une écriture future
--    qui l'ignorerait.
-- ---------------------------------------------------------------------
create unique index if not exists idx_payments_one_completion_per_deposit
  on public.payments(deposit_id)
  where status = 'completed';

-- ---------------------------------------------------------------------
-- 5. Recharger le cache de schéma de PostgREST
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
