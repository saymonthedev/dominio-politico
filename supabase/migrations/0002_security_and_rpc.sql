-- Segurança: RLS em tudo; leitura pública do mundo; dados de jogador só para o dono.
-- Escritas do motor passam por RPCs SECURITY DEFINER protegidas por segredo de servidor
-- (o hash fica em private.app_secrets; o valor só existe nas variáveis de ambiente do servidor).

create extension if not exists pgcrypto with schema extensions;

do $$
declare t text;
begin
  foreach t in array array[
    'sources','license_records','player_profiles','worlds','persons','person_states','parties','factions','memberships',
    'affiliation_requests','relationships','elections','races','candidacies','mandates','bills','policies','illicit_acts',
    'investigations','rumors','debates','voter_segments','economy_snapshots','world_events','news_articles','notifications',
    'finance_transactions','polls'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Leitura pública (mundo compartilhado)
do $$
declare t text;
begin
  foreach t in array array[
    'sources','license_records','worlds','persons','parties','factions','memberships','elections','races','candidacies',
    'mandates','bills','policies','investigations','rumors','debates','voter_segments','economy_snapshots'
  ] loop
    execute format('create policy "leitura publica" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- A seed do mundo não é pública (permitiria prever eventos)
revoke select on public.worlds from anon, authenticated;
grant select (id, name, ruleset_version, tick, game_date, start_game_date, anchor_real_at, anchor_tick, game_days_per_real_hour,
  election_integrity_mode, gov, stats, start_year, status, created_at) on public.worlds to anon, authenticated;

-- Função auxiliar: a pessoa (world_id, person_id) pertence ao usuário logado?
create or replace function private.owns_person(p_world text, p_person text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.persons p
    where p.world_id = p_world and p.id = p_person and p.user_id = auth.uid()
  );
$$;
grant usage on schema private to anon, authenticated;
grant execute on function private.owns_person(text, text) to anon, authenticated;

create policy "dono" on public.person_states for select to authenticated using (user_id = (select auth.uid()));
create policy "dono" on public.affiliation_requests for select to authenticated using (private.owns_person(world_id, person_id));
create policy "dono" on public.relationships for select to authenticated using (private.owns_person(world_id, a_id));
create policy "dono" on public.finance_transactions for select to authenticated using (private.owns_person(world_id, person_id));
create policy "dono ou descoberto" on public.illicit_acts for select to authenticated using (discovered or private.owns_person(world_id, person_id));
create policy "dono" on public.world_events for select to authenticated using (
  exists (select 1 from public.persons p where p.world_id = world_events.world_id and p.user_id = (select auth.uid()) and p.id = any(world_events.actors))
);
create policy "publica ou do dono" on public.news_articles for select to anon, authenticated using (visibility = 'PUBLIC' or user_id = (select auth.uid()));
create policy "publica ou do dono" on public.polls for select to anon, authenticated using (private_for is null or private.owns_person(world_id, private_for));
create policy "dono" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "dono marca como lida" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "dono" on public.player_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "dono insere" on public.player_profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "dono atualiza" on public.player_profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Nenhuma escrita direta do cliente nas tabelas do mundo
do $$
declare t text;
begin
  foreach t in array array[
    'sources','license_records','worlds','persons','person_states','parties','factions','memberships','affiliation_requests',
    'relationships','elections','races','candidacies','mandates','bills','policies','illicit_acts','investigations','rumors',
    'debates','voter_segments','economy_snapshots','world_events','news_articles','finance_transactions','polls'
  ] loop
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ RPCs do motor
create or replace function private.check_secret(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.app_secrets
    where name = 'sim' and hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
  );
$$;

create or replace function public.sim_lease(p_secret text, p_world text, p_holder text, p_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.worlds
     set lease_until = now() + make_interval(secs => p_seconds), lease_holder = p_holder
   where id = p_world and (lease_until is null or lease_until < now() or lease_holder = p_holder)
  returning true into ok;
  return coalesce(ok, false);
end $$;

create or replace function public.sim_release(p_secret text, p_world text, p_holder text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.worlds set lease_until = null, lease_holder = null where id = p_world and lease_holder = p_holder;
end $$;

-- Estado necessário para o motor avançar o mundo
create or replace function public.sim_load(p_secret text, p_world text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w jsonb;
  res jsonb;
  open_elections text[];
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(x) - 'lease_until' - 'lease_holder' - 'created_at' - 'start_year' - 'status' into w from public.worlds x where id = p_world;
  if w is null then return null; end if;
  select coalesce(array_agg(id), '{}') into open_elections from public.elections where world_id = p_world and status <> 'ENCERRADA';

  with active_persons as (
    select * from public.persons where world_id = p_world and (status = 'ACTIVE' or kind = 'PLAYER')
  )
  select jsonb_build_object(
    'world', w,
    'economy', (select to_jsonb(e) from public.economy_snapshots e where e.world_id = p_world order by e.month desc limit 1),
    'persons', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from active_persons p),
    'person_states', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.person_states s join active_persons p on p.id = s.id where s.world_id = p_world),
    'parties', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.parties x where x.world_id = p_world),
    'factions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.factions x where x.world_id = p_world),
    'memberships', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.memberships x where x.world_id = p_world and x.status = 'ATIVA'),
    'affiliation_requests', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.affiliation_requests x where x.world_id = p_world and x.status = 'PENDENTE'),
    'relationships', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.relationships x where x.world_id = p_world),
    'elections', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.elections x where x.world_id = p_world),
    'races', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.races x where x.world_id = p_world and x.election_id = any(open_elections)),
    'candidacies', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.candidacies x where x.world_id = p_world and x.election_id = any(open_elections)),
    'mandates', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.mandates x where x.world_id = p_world and (x.status in ('ATIVO','FUTURO') or x.end_on > ((w->>'game_date')::date - interval '9 years'))),
    'bills', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.bills x where x.world_id = p_world and x.status = 'TRAMITANDO'),
    'policies', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.policies x where x.world_id = p_world and x.status in ('EM_ANDAMENTO','ATRASADA')),
    'illicit_acts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.illicit_acts x where x.world_id = p_world and (not x.discovered or x.created_on > ((w->>'game_date')::date - interval '6 years'))),
    'investigations', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.investigations x where x.world_id = p_world and x.outcome is null),
    'rumors', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.rumors x where x.world_id = p_world and x.status = 'ATIVO'),
    'debates', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.debates x where x.world_id = p_world and x.status = 'AGENDADO'),
    'voter_segments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.voter_segments x where x.world_id = p_world)
  ) into res;
  return res;
end $$;

-- Grava mudanças (upsert idempotente por id). Só as colunas presentes no JSON são escritas.
create or replace function public.sim_apply(p_secret text, p_world text, p_changes jsonb, p_expected_tick int default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  allowed text[] := array[
    'worlds','persons','person_states','parties','factions','memberships','affiliation_requests','relationships','elections',
    'races','candidacies','mandates','bills','policies','illicit_acts','investigations','rumors','debates','voter_segments',
    'economy_snapshots','world_events','news_articles','notifications','finance_transactions','polls'
  ];
  tbl text;
  rows jsonb;
  cols text;
  upd text;
  current_tick int;
  new_tick int;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_expected_tick is not null then
    select tick into current_tick from public.worlds where id = p_world for update;
    if current_tick is distinct from p_expected_tick then
      raise exception 'tick_conflict: esperado %, atual %', p_expected_tick, current_tick using errcode = '40001';
    end if;
  end if;
  for tbl in select jsonb_object_keys(p_changes) loop
    if not tbl = any(allowed) then raise exception 'tabela não permitida: %', tbl; end if;
    rows := p_changes -> tbl;
    if rows is null or jsonb_array_length(rows) = 0 then continue; end if;
    select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position),
           string_agg(format('%1$I = excluded.%1$I', c.column_name), ', ' order by c.ordinal_position)
             filter (where c.column_name not in ('world_id', 'id', 'lease_until', 'lease_holder', 'created_at', 'seed'))
      into cols, upd
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = tbl
       and c.column_name in (select jsonb_object_keys(rows -> 0));
    if tbl = 'worlds' then
      execute format(
        'insert into public.worlds (%s) select %s from jsonb_populate_recordset(null::public.worlds, $1) r where r.id = $2 on conflict (id) do update set %s',
        cols, cols, upd) using rows, p_world;
    else
      execute format(
        'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) r where r.world_id = $2 on conflict (world_id, id) do update set %s',
        tbl, cols, cols, tbl, upd) using rows, p_world;
    end if;
  end loop;
  select tick into new_tick from public.worlds where id = p_world;
  return new_tick;
end $$;

-- Ajuste administrativo do relógio (avançar dias para testes e eventos)
create or replace function public.sim_set_clock(p_secret text, p_world text, p_anchor_tick int, p_anchor_real_at timestamptz, p_speed double precision)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.worlds set anchor_tick = p_anchor_tick, anchor_real_at = p_anchor_real_at, game_days_per_real_hour = p_speed where id = p_world;
end $$;

-- Exclusão de conta (LGPD): remove dados do jogador em todos os mundos
create or replace function public.delete_my_data()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.persons set status = 'RETIRED', status_note = 'Conta encerrada pelo jogador.', name = 'Personagem removido', user_id = null where user_id = uid;
  update public.person_states set user_id = null, dossiers = '{}', offers = '[]' where user_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.news_articles where user_id = uid and visibility = 'PRIVATE';
  delete from public.player_profiles where user_id = uid;
end $$;

revoke all on function public.sim_lease(text, text, text, int) from public;
revoke all on function public.sim_release(text, text, text) from public;
revoke all on function public.sim_load(text, text) from public;
revoke all on function public.sim_apply(text, text, jsonb, int) from public;
revoke all on function public.sim_set_clock(text, text, int, timestamptz, double precision) from public;
revoke all on function public.delete_my_data() from public;
grant execute on function public.sim_lease(text, text, text, int) to anon, authenticated;
grant execute on function public.sim_release(text, text, text) to anon, authenticated;
grant execute on function public.sim_load(text, text) to anon, authenticated;
grant execute on function public.sim_apply(text, text, jsonb, int) to anon, authenticated;
grant execute on function public.sim_set_clock(text, text, int, timestamptz, double precision) to anon, authenticated;
grant execute on function public.delete_my_data() to authenticated;
revoke all on function private.check_secret(text) from public, anon, authenticated;

-- O vínculo conta ↔ personagem não é público
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'persons' and column_name <> 'user_id';
  execute 'revoke select on public.persons from anon, authenticated';
  execute format('grant select (%s) on public.persons to anon, authenticated', cols);
end $$;
