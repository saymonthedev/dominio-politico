-- Conversa entre jogadores (Mensagens, no celular do jogo): canal do mundo, canal do partido e
-- conversas particulares entre dois jogadores.
--  * só quem tem personagem ativo no mundo lê e escreve, e só nos canais em que participa;
--  * tudo passa pelas funções abaixo (sem acesso direto à tabela): tamanho de até 500 caracteres e no
--    máximo 6 mensagens a cada 30 s por conta;
--  * mensagem denunciada por dois jogadores diferentes some da conversa;
--  * mensagens saem com 30 dias, e as da conta somem junto com ela (exclusão de conta).

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  world_id text not null,
  channel text not null,
  person_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  body text not null check (char_length(body) between 1 and 500),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_channel_idx on public.chat_messages (world_id, channel, id desc);
create index if not exists chat_messages_user_idx on public.chat_messages (user_id, created_at desc);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;

create table if not exists private.chat_reports (
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- personagem ativo do usuário logado no mundo
create or replace function private.chat_me(p_world text)
returns table(person_id text, name text, party_id text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.party_id
    from private.person_owners o
    join public.persons p on p.world_id = o.world_id and p.id = o.person_id
   where o.world_id = p_world and o.user_id = (select auth.uid()) and p.status = 'ACTIVE'
   limit 1;
$$;
revoke all on function private.chat_me(text) from public;

-- canal permitido para este personagem: o mundo, o próprio partido ou uma conversa em que ele está
create or replace function private.chat_can(p_world text, p_channel text, p_person text, p_party text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_channel = 'mundo' then true
    when p_channel like 'partido:%' then p_party is not null and p_channel = 'partido:' || p_party
    when p_channel like 'dm:%' then
      p_person = any(string_to_array(substr(p_channel, 4), '|'))
      and (select count(*) from unnest(string_to_array(substr(p_channel, 4), '|')) x(pid)
             join public.persons q on q.world_id = p_world and q.id = x.pid and q.kind = 'PLAYER') = 2
    else false
  end;
$$;
revoke all on function private.chat_can(text, text, text, text) from public;

create or replace function public.chat_list(p_world text, p_channel text, p_after bigint default 0)
returns table(id bigint, person_id text, name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select * into me from private.chat_me(p_world);
  if me.person_id is null or not private.chat_can(p_world, p_channel, me.person_id, me.party_id) then return; end if;
  return query
    select m.id, m.person_id, m.name, m.body, m.created_at from (
      select c.id, c.person_id, c.name, c.body, c.created_at from public.chat_messages c
       where c.world_id = p_world and c.channel = p_channel and c.id > coalesce(p_after, 0) and not c.hidden
       order by c.id desc limit 60) m
    order by m.id;
end $$;
revoke all on function public.chat_list(text, text, bigint) from public;
grant execute on function public.chat_list(text, text, bigint) to authenticated;

create or replace function public.chat_send(p_world text, p_channel text, p_body text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me record;
  msg text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  new_id bigint;
  other text;
  w record;
begin
  select * into me from private.chat_me(p_world);
  if me.person_id is null then raise exception 'Você não tem personagem ativo neste mundo.' using errcode = '42501'; end if;
  if not private.chat_can(p_world, p_channel, me.person_id, me.party_id) then raise exception 'Você não participa desta conversa.' using errcode = '42501'; end if;
  if char_length(msg) = 0 then raise exception 'Mensagem vazia.' using errcode = '22023'; end if;
  if char_length(msg) > 500 then raise exception 'Mensagem longa demais (até 500 caracteres).' using errcode = '22023'; end if;
  if (select count(*) from public.chat_messages c where c.user_id = (select auth.uid()) and c.created_at > now() - interval '30 seconds') >= 6 then
    raise exception 'Muitas mensagens seguidas. Espere alguns segundos.' using errcode = 'P0001';
  end if;
  insert into public.chat_messages (world_id, channel, person_id, user_id, name, body)
  values (p_world, p_channel, me.person_id, (select auth.uid()), me.name, msg)
  returning id into new_id;
  -- conversa particular: avisa quem recebe, uma vez por sequência (nada nos 10 min anteriores)
  if p_channel like 'dm:%' then
    select x into other from unnest(string_to_array(substr(p_channel, 4), '|')) x where x <> me.person_id limit 1;
    if other is not null and not exists (
      select 1 from public.chat_messages c
       where c.world_id = p_world and c.channel = p_channel and c.person_id = me.person_id and c.id <> new_id and c.created_at > now() - interval '10 minutes'
    ) then
      select x.tick, x.game_date into w from public.worlds x where x.id = p_world;
      insert into public.notifications (world_id, id, user_id, person_id, tick, game_date, title, body, link)
      select p_world, 'ntf_chat_' || new_id, o.user_id, other, coalesce(w.tick, 0), w.game_date,
             'Mensagem de ' || me.name, left(msg, 140), '/jogo/celular?c=' || p_channel
        from private.person_owners o where o.world_id = p_world and o.person_id = other;
    end if;
  end if;
  return new_id;
end $$;
revoke all on function public.chat_send(text, text, text) from public;
grant execute on function public.chat_send(text, text, text) to authenticated;

-- conversas particulares do jogador, com a última mensagem de cada uma
create or replace function public.chat_threads(p_world text)
returns table(channel text, last_id bigint, last_at timestamptz, last_body text, last_name text)
language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select * into me from private.chat_me(p_world);
  if me.person_id is null then return; end if;
  return query
    select distinct on (c.channel) c.channel, c.id, c.created_at, c.body, c.name
      from public.chat_messages c
     where c.world_id = p_world and c.channel like 'dm:%' and not c.hidden
       and me.person_id = any(string_to_array(substr(c.channel, 4), '|'))
     order by c.channel, c.id desc;
end $$;
revoke all on function public.chat_threads(text) from public;
grant execute on function public.chat_threads(text) to authenticated;

-- denúncia: com duas denúncias de jogadores diferentes, a mensagem some
create or replace function public.chat_report(p_world text, p_message bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare me record; m record;
begin
  select * into me from private.chat_me(p_world);
  if me.person_id is null then return false; end if;
  select c.* into m from public.chat_messages c where c.id = p_message and c.world_id = p_world;
  if m.id is null or m.user_id = (select auth.uid()) or not private.chat_can(p_world, m.channel, me.person_id, me.party_id) then return false; end if;
  insert into private.chat_reports (message_id, user_id) values (p_message, (select auth.uid())) on conflict do nothing;
  if (select count(*) from private.chat_reports r where r.message_id = p_message) >= 2 then
    update public.chat_messages set hidden = true where id = p_message;
  end if;
  return true;
end $$;
revoke all on function public.chat_report(text, bigint) from public;
grant execute on function public.chat_report(text, bigint) to authenticated;

-- mensagens com mais de 30 dias saem toda madrugada (4h23 de Brasília)
select cron.schedule('limpar-conversas', '23 7 * * *', $$delete from public.chat_messages where created_at < now() - interval '30 days'$$);
