-- Migration 0006 — Le trigger d'inscription lit le username choisi par le créateur.
--
-- Quand l'inscription passe par l'API Supabase avec `options.data.username`,
-- ce champ arrive dans `new.raw_user_meta_data`. On l'utilise comme base
-- du pseudo, à la place de l'email — le créateur garde le contrôle dès
-- l'inscription, et l'onboarding n'a plus qu'à valider.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base      text;
  candidate text;
  n         int := 0;
begin
  -- Le créateur a fourni un nom d'utilisateur lors de l'inscription.
  -- On le nettoie (minuscules, alphanumérique, tiret, underscore) et on
  -- le tronque à la limite du format.
  base := lower(regexp_replace(
    coalesce(new.raw_user_meta_data->>'username', ''),
    '[^a-z0-9_-]', '', 'g'
  ));

  -- S'il est trop court ou absent, on retombe sur l'email (comportement
  -- d'origine) pour ne jamais créer un compte sans pseudo.
  if base is null or char_length(base) < 3 then
    base := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]', '', 'g'));
    if base is null or char_length(base) < 3 then
      base := 'createur';
    end if;
  end if;

  base := left(base, 28);

  candidate := base;
  while exists (select 1 from public.users u where u.username = candidate) loop
    n := n + 1;
    candidate := left(base, 28) || n::text;
  end loop;

  insert into public.users (id, email, username)
  values (new.id, new.email, candidate)
  on conflict (id) do nothing;

  return new;
end;
$$;
