-- =====================================================================
--  Campagnes — Migration 0011 : partage social
--  Cible : Supabase / Postgres 15+
--
--  Deux besoins distincts, une seule migration :
--
--    * le créateur peut définir le texte et les hashtags de partage de sa
--      campagne. Sans cela, Campagnes compose le texte à partir du nom
--      (voir `lib/share.ts`) ;
--    * les partages sont comptés, pour que la page Analytics du créateur
--      affiche autre chose que « bientôt disponible ».
--
--  Ce qui n'est **pas** fait ici, volontairement : aucune donnée personnelle
--  n'est enregistrée. Pas d'identifiant de participant, pas d'adresse IP, pas
--  d'empreinte de navigateur. Un événement dit seulement « un partage WhatsApp
--  a eu lieu pour cette campagne, à cet instant ».
--
--  Cette migration n'est PAS appliquée automatiquement.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Texte de partage défini par le créateur
-- ---------------------------------------------------------------------
alter table public.campaigns add column if not exists share_text text;
alter table public.campaigns add column if not exists share_hashtags text[];

comment on column public.campaigns.share_text is
  'Texte de partage rédigé par le créateur. NULL → Campagnes en compose un à partir du nom.';
comment on column public.campaigns.share_hashtags is
  'Hashtags du créateur, sans le # initial. #Campagnes et celui du nom sont ajoutés automatiquement.';

-- ---------------------------------------------------------------------
-- 2. Événements de partage
-- ---------------------------------------------------------------------
create table if not exists public.campaign_events (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_type  text not null check (event_type in (
                'share_clicked','share_whatsapp','share_facebook','share_tiktok',
                'share_copy_text','share_copy_link','share_download'
              )),
  created_at  timestamptz not null default now()
);

create index if not exists campaign_events_campaign_idx
  on public.campaign_events(campaign_id, created_at desc);

comment on table public.campaign_events is
  'Compteurs de partage. Append-only, sans aucune donnée personnelle.';

-- ---------------------------------------------------------------------
-- 3. Enregistrement d'un événement
-- ---------------------------------------------------------------------
create or replace function public.record_share_event(
  p_campaign_id uuid,
  p_event_type  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Le type est validé ici : la liste du navigateur ne prouve rien.
  if p_event_type is null or p_event_type not in (
    'share_clicked','share_whatsapp','share_facebook','share_tiktok',
    'share_copy_text','share_copy_link','share_download'
  ) then
    raise exception 'Type d''événement inconnu.' using errcode = '22023';
  end if;

  -- Un brouillon ne reçoit aucun événement : il n'est visible de personne.
  if not exists (
    select 1 from public.campaigns
     where id = p_campaign_id and status = 'published'
  ) then
    return;
  end if;

  insert into public.campaign_events (campaign_id, event_type)
  values (p_campaign_id, p_event_type);
end;
$$;

comment on function public.record_share_event(uuid, text) is
  'Enregistre un partage. Le compteur est déclaratif : il vient du navigateur et peut être gonflé artificiellement.';

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.campaign_events enable row level security;

-- Aucune policy d'écriture : on n'écrit que par `record_share_event`.
-- Aucune policy pour `anon` : un visiteur ne peut pas lire les compteurs.
revoke all on table public.campaign_events from anon;

drop policy if exists campaign_events_owner on public.campaign_events;
create policy campaign_events_owner on public.campaign_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.campaigns c
       where c.id = campaign_events.campaign_id and c.owner_id = auth.uid()
    )
  );

grant select on table public.campaign_events to authenticated;

-- ---------------------------------------------------------------------
-- 5. Agrégat lisible par le créateur
--    `security_invoker` : la vue s'exécute avec les droits de l'appelant,
--    donc la RLS ci-dessus s'applique. Sans cela, la vue contournerait les
--    policies et exposerait les compteurs de tout le monde.
-- ---------------------------------------------------------------------
create or replace view public.campaign_share_stats
  with (security_invoker = true)
as
select
  campaign_id,
  count(*)::int                                                       as total,
  count(*) filter (where event_type = 'share_whatsapp')::int          as whatsapp,
  count(*) filter (where event_type = 'share_facebook')::int          as facebook,
  count(*) filter (where event_type = 'share_tiktok')::int            as tiktok
from public.campaign_events
group by campaign_id;

grant select on public.campaign_share_stats to authenticated;

-- ---------------------------------------------------------------------
-- 6. Droits d'exécution
-- ---------------------------------------------------------------------
revoke all on function public.record_share_event(uuid, text) from public;
grant execute on function public.record_share_event(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
--  Limite connue, à assumer
--  -------------------------------------------------------------------
--  Le compteur de partages est **déclaratif** : il est envoyé par le
--  navigateur du participant. Quelqu'un qui appellerait la fonction en boucle
--  gonflerait le chiffre affiché au créateur.
--
--  Ce n'est pas corrigeable sans déplacer le partage côté serveur, ce qui
--  n'existe pas — le partage est un geste local (ouvrir WhatsApp, copier dans
--  le presse-papiers). Une limitation de fréquence par IP réduirait le
--  problème sans le supprimer, au prix d'un stockage d'adresses IP que ce
--  module s'interdit.
--
--  Conséquence pratique : ces chiffres sont **indicatifs**, et l'interface ne
--  doit pas les présenter comme une mesure certifiée.
-- =====================================================================
