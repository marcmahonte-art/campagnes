-- =====================================================================
--  Campagnes — Migration 0010 : signalements de contenu
--  Cible : Supabase / Postgres 15+
--
--  Objectif : rendre la page publique `/signalement` réellement fonctionnelle.
--
--  Le formulaire est ouvert à tous — y compris à une personne sans compte, qui
--  est précisément celle qui a le plus de raisons de signaler. Deux
--  conséquences en découlent :
--
--    * la validation doit vivre en base, pas dans le navigateur : celle du
--      navigateur se contourne en une ligne ;
--    * l'envoi doit être limité en fréquence, sans quoi le formulaire devient
--      une porte d'entrée pour le remplissage massif.
--
--  Aucune policy n'est créée pour `anon` sur `content_reports` : les
--  signalements s'écrivent uniquement par la fonction, et ne se lisent que
--  depuis l'équipe. Un signalement ne doit jamais être visible du créateur visé.
--
--  Cette migration n'est PAS appliquée automatiquement.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table des signalements
-- ---------------------------------------------------------------------
create table if not exists public.content_reports (
  id              uuid primary key default gen_random_uuid(),
  reason          text not null check (
                    reason in ('illegal','copyright','privacy','impersonation',
                               'hate','misleading','spam','other')
                  ),
  campaign_url    text check (campaign_url is null or char_length(campaign_url) <= 500),
  description     text not null check (char_length(btrim(description)) between 10 and 4000),
  reporter_email  text not null check (
                    char_length(reporter_email) <= 320
                    and reporter_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                  ),
  attachment_path text,
  status          text not null default 'NEW' check (status in ('NEW','REVIEWING','CLOSED')),
  created_at      timestamptz not null default now()
);

create index if not exists content_reports_created_at_idx on public.content_reports(created_at desc);
create index if not exists content_reports_status_idx     on public.content_reports(status);

comment on table public.content_reports is
  'Signalements de contenu envoyés depuis /signalement. Lecture réservée à l''équipe.';

-- ---------------------------------------------------------------------
-- 2. Compteur de fréquence
--    L'adresse IP n'est stockée que pour limiter les envois. Elle n'est
--    jamais rattachée au signalement lui-même, et les lignes anciennes sont
--    supprimées à chaque appel.
-- ---------------------------------------------------------------------
create table if not exists public.report_throttle (
  ip         inet not null,
  created_at timestamptz not null default now()
);

create index if not exists report_throttle_ip_idx on public.report_throttle(ip, created_at desc);

comment on table public.report_throttle is
  'Compteur glissant des envois par adresse IP. Purge à chaque appel de submit_report.';

-- ---------------------------------------------------------------------
-- 3. Envoi d'un signalement
-- ---------------------------------------------------------------------
create or replace function public.submit_report(
  p_reason          text,
  p_campaign_url    text,
  p_description     text,
  p_email           text,
  p_attachment_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers json;
  v_ip      inet;
  v_recent  integer;
  v_id      uuid;
begin
  -- IP du client telle que PostgREST la transmet. Absente hors de ce contexte
  -- (appel direct, tests) : on continue alors sans limitation, plutôt que
  -- d'échouer sur un envoi légitime.
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;

  begin
    v_ip := nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '')::inet;
  exception when others then
    v_ip := null;
  end;

  -- Validation serveur — la seule qui compte.
  if p_reason is null or p_reason not in (
    'illegal','copyright','privacy','impersonation','hate','misleading','spam','other'
  ) then
    raise exception 'Motif de signalement invalide.' using errcode = '22023';
  end if;

  if p_description is null or char_length(btrim(p_description)) < 10 then
    raise exception 'La description doit contenir au moins 10 caractères.' using errcode = '22023';
  end if;

  if char_length(p_description) > 4000 then
    raise exception 'La description ne peut pas dépasser 4 000 caractères.' using errcode = '22023';
  end if;

  if p_email is null
     or char_length(btrim(p_email)) > 320
     or btrim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Adresse email invalide.' using errcode = '22023';
  end if;

  if p_campaign_url is not null and char_length(btrim(p_campaign_url)) > 500 then
    raise exception 'Le lien de la campagne est trop long.' using errcode = '22023';
  end if;

  -- Limitation de fréquence : 5 envois par heure et par adresse.
  if v_ip is not null then
    delete from public.report_throttle where created_at < now() - interval '24 hours';

    select count(*) into v_recent
      from public.report_throttle
     where ip = v_ip and created_at > now() - interval '1 hour';

    if v_recent >= 5 then
      raise exception 'Trop de signalements envoyés récemment. Réessayez dans une heure.'
        using errcode = '53400';
    end if;
  end if;

  insert into public.content_reports (
    reason, campaign_url, description, reporter_email, attachment_path
  )
  values (
    p_reason,
    nullif(btrim(coalesce(p_campaign_url, '')), ''),
    btrim(p_description),
    btrim(p_email),
    p_attachment_path
  )
  returning id into v_id;

  if v_ip is not null then
    insert into public.report_throttle (ip) values (v_ip);
  end if;

  return v_id;
end;
$$;

comment on function public.submit_report(text, text, text, text, text) is
  'Enregistre un signalement après validation complète et limitation de fréquence (5/heure/IP).';

-- ---------------------------------------------------------------------
-- 4. RLS — personne ne lit les signalements depuis l'application
-- ---------------------------------------------------------------------
alter table public.content_reports enable row level security;
alter table public.report_throttle  enable row level security;

-- Aucune policy n'est volontairement créée : ni `anon` ni `authenticated` ne
-- peuvent lire ou écrire ces tables directement. L'écriture passe par
-- `submit_report`, la lecture par l'équipe (rôle `service_role`).

-- ---------------------------------------------------------------------
-- 5. Espace privé des pièces jointes
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

drop policy if exists reports_attachment_insert on storage.objects;
create policy reports_attachment_insert on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'reports'
    and metadata is not null
    and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 5242880
    and (metadata ->> 'mimetype') in ('image/png','image/jpeg','image/webp','application/pdf')
  );

-- Aucune policy de lecture : le bucket reste privé, y compris pour la personne
-- qui vient d'y déposer un fichier.

-- ---------------------------------------------------------------------
-- 6. Droits d'exécution
-- ---------------------------------------------------------------------
revoke all on function public.submit_report(text, text, text, text, text) from public;
grant execute on function public.submit_report(text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
--  Reste à faire
--  -------------------------------------------------------------------
--  * Aucune notification n'est envoyée à l'équipe à la réception d'un
--    signalement : il faut consulter la table. Une alerte par email serait
--    la suite logique.
--  * Les signalements n'ont pas d'interface d'administration : le traitement
--    se fait aujourd'hui directement en base (colonne `status`).
--  * La page de confidentialité doit mentionner le traitement transitoire de
--    l'adresse IP par ce formulaire (voir `app/confidentialite/page.tsx`).
-- =====================================================================
