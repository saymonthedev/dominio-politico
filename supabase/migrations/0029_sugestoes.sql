-- Sugestões dos jogadores (13/11): texto, até 3 fotos (guardadas no Vercel Blob, pasta
-- sugestoes/<conta>/) e o nome para os créditos. Só o dono do jogo vê todas (pelo /admin, com o
-- segredo do servidor) e marca como concluída ou reprovada, com uma nota. Concluída vira aviso de
-- atualização para todos, com crédito; reprovada vira aviso só para quem sugeriu.

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 2000),
  images text[] not null default '{}',
  world_year int,
  status text not null default 'NOVA' check (status in ('NOVA', 'CONCLUIDA', 'REPROVADA')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists suggestions_user_idx on public.suggestions (user_id, created_at desc);
create index if not exists suggestions_status_idx on public.suggestions (status, decided_at desc);
alter table public.suggestions enable row level security;
drop policy if exists "sugestao propria" on public.suggestions;
create policy "sugestao propria" on public.suggestions for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.suggestions from anon, authenticated;

-- envio: a conta é a do login; fotos só da pasta do próprio jogador; no máximo 5 por dia
create or replace function public.suggestion_create(p_title text, p_body text, p_author text, p_images text[], p_year int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  n int;
  new_id uuid;
begin
  if uid is null then raise exception 'Entre na sua conta para mandar sugestões.' using errcode = '42501'; end if;
  select count(*) into n from public.suggestions s where s.user_id = uid and s.created_at > now() - interval '1 day';
  if n >= 5 then raise exception 'Você já mandou 5 sugestões hoje. Tente de novo amanhã.' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_images, 1), 0) > 3 then raise exception 'No máximo 3 fotos por sugestão.' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(coalesce(p_images, '{}')) i where i !~ ('^sugestoes/' || uid::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')) then
    raise exception 'Foto inválida.' using errcode = 'P0001';
  end if;
  insert into public.suggestions (user_id, author_name, title, body, images, world_year)
  values (uid, btrim(p_author), btrim(p_title), btrim(p_body), coalesce(p_images, '{}'), p_year)
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.suggestion_create(text, text, text, text[], int) from public;
grant execute on function public.suggestion_create(text, text, text, text[], int) to authenticated;

-- /admin: todas as sugestões (as novas primeiro), com o e-mail de quem mandou
create or replace function public.suggestions_admin(p_secret text)
returns table (id uuid, user_id uuid, email text, author_name text, title text, body text, images text[], world_year int, status text, admin_note text, created_at timestamptz, decided_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select s.id, s.user_id, u.email::text, s.author_name, s.title, s.body, s.images, s.world_year, s.status, s.admin_note, s.created_at, s.decided_at
      from public.suggestions s
      left join auth.users u on u.id = s.user_id
     order by (s.status = 'NOVA') desc, coalesce(s.decided_at, s.created_at) desc
     limit 300;
end $$;
revoke all on function public.suggestions_admin(text) from public;
grant execute on function public.suggestions_admin(text) to anon, authenticated;

-- /admin: concluir, reprovar ou voltar para nova
create or replace function public.suggestion_decide(p_secret text, p_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('NOVA', 'CONCLUIDA', 'REPROVADA') then raise exception 'situação inválida' using errcode = 'P0001'; end if;
  update public.suggestions
     set status = p_status,
         admin_note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_at = case when p_status = 'NOVA' then null else now() end
   where id = p_id;
end $$;
revoke all on function public.suggestion_decide(text, uuid, text, text) from public;
grant execute on function public.suggestion_decide(text, uuid, text, text) to anon, authenticated;

-- avisos do jogo: sugestões que viraram atualização (para todos, com crédito) e as reprovadas da
-- própria conta (só para ela), dos últimos 30 dias
create or replace function public.suggestion_popups()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'news', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'note', s.admin_note, 'author', s.author_name, 'at', s.decided_at) order by s.decided_at desc)
        from (select * from public.suggestions x
               where x.status = 'CONCLUIDA' and x.decided_at > now() - interval '30 days'
               order by x.decided_at desc limit 10) s), '[]'::jsonb),
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'note', s.admin_note, 'at', s.decided_at) order by s.decided_at desc)
        from public.suggestions s
       where s.user_id = (select auth.uid()) and s.status = 'REPROVADA' and s.decided_at > now() - interval '30 days'), '[]'::jsonb)
  );
$$;
revoke all on function public.suggestion_popups() from public;
grant execute on function public.suggestion_popups() to authenticated;
