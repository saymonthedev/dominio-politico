-- Atualização incremental do mundo.
--
-- Cada servidor guarda o mundo em memória com a revisão em que o leu. Até aqui,
-- qualquer gravação (de qualquer jogador, ou do relógio) obrigava os outros
-- servidores a recarregar o mundo inteiro: milhares de linhas, ~6 MB de JSON
-- montados pelo banco a cada vez. Com vários jogadores, isso virava centenas de
-- cargas completas por hora e o banco estourava o tempo.
--
-- Agora cada gravação do motor (sim_apply) anota quais linhas mudaram e em que
-- revisão. Quem tem o mundo na revisão R pede só o que mudou depois de R
-- (sim_world_delta): dezenas ou centenas de linhas em vez do mundo inteiro.
-- A carga completa (primeira vez em cada servidor) passa a montar JSON direto
-- (sim_world_part), bem mais barato para o banco.
--
-- Revisão de uma gravação: a do lease + 1 (é o valor que a revisão terá quando
-- o lease for liberado com mudanças). O registro guarda poucas horas; quem está
-- mais atrás do que isso (ou depois de uma mudança feita fora do motor, que chama
-- sim_bump_rev) recarrega tudo, como antes.

create table if not exists private.world_changes (
  world_id text not null,
  rev bigint not null,
  tbl text not null,
  ids text[] not null,
  at timestamptz not null default now()
);
create index if not exists world_changes_world_rev on private.world_changes (world_id, rev);
alter table private.world_changes enable row level security;
revoke all on table private.world_changes from public, anon, authenticated;

-- Desde qual revisão o registro de mudanças está completo para cada mundo.
alter table private.world_leases add column if not exists delta_from bigint not null default 0;
-- nada antes desta migração foi anotado
update private.world_leases set delta_from = rev where delta_from < rev;

-- Gravação do motor: igual à anterior, com as colunas lidas do catálogo (bem mais
-- leve que information_schema) e a anotação das linhas de estado que mudaram.
create or replace function public.sim_apply(p_secret text, p_world text, p_changes jsonb, p_expected_tick int default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  allowed text[] := array[
    'worlds','persons','person_states','parties','factions','memberships','affiliation_requests','relationships','elections',
    'races','candidacies','mandates','bills','policies','illicit_acts','investigations','rumors','debates','voter_segments',
    'economy_snapshots','world_events','news_articles','notifications','finance_transactions','polls'
  ];
  stateful text[] := array[
    'persons','person_states','parties','factions','memberships','affiliation_requests','relationships','elections',
    'races','candidacies','mandates','bills','policies','illicit_acts','investigations','rumors','debates','voter_segments'
  ];
  tbl text;
  rows jsonb;
  cols text;
  upd text;
  current_tick int;
  new_tick int;
  stamp bigint;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_expected_tick is not null then
    select tick into current_tick from public.worlds where id = p_world for update;
    if current_tick is distinct from p_expected_tick then
      raise exception 'tick_conflict: esperado %, atual %', p_expected_tick, current_tick using errcode = '40001';
    end if;
  end if;
  select l.rev + 1 into stamp from private.world_leases l where l.world_id = p_world;
  stamp := coalesce(stamp, 1);
  for tbl in select jsonb_object_keys(p_changes) loop
    if not tbl = any(allowed) then raise exception 'tabela não permitida: %', tbl; end if;
    rows := p_changes -> tbl;
    if rows is null or jsonb_array_length(rows) = 0 then continue; end if;

    if tbl = 'worlds' then
      insert into private.world_seeds (world_id, seed)
      select r->>'id', r->>'seed' from jsonb_array_elements(rows) r
       where r->>'id' = p_world and coalesce(r->>'seed', 'oculta') <> 'oculta'
      on conflict (world_id) do nothing;
      select jsonb_agg(r || '{"seed":"oculta"}'::jsonb) into rows from jsonb_array_elements(rows) r;
    elsif tbl = 'persons' then
      insert into private.person_owners (world_id, person_id, user_id)
      select p_world, r->>'id', (r->>'user_id')::uuid from jsonb_array_elements(rows) r
       where r->>'world_id' = p_world and r->>'user_id' is not null
      on conflict (world_id, person_id) do nothing;
      select jsonb_agg(r - 'user_id') into rows from jsonb_array_elements(rows) r;
    end if;

    select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
           string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
             filter (where a.attname not in ('world_id', 'id', 'lease_until', 'lease_holder', 'created_at', 'seed'))
      into cols, upd
      from pg_catalog.pg_attribute a
     where a.attrelid = ('public.' || quote_ident(tbl))::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attname::text in (select jsonb_object_keys(rows -> 0));
    if tbl = 'worlds' then
      execute format(
        'insert into public.worlds (%s) select %s from jsonb_populate_recordset(null::public.worlds, $1) r where r.id = $2 on conflict (id) do update set %s',
        cols, cols, upd) using rows, p_world;
    else
      execute format(
        'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) r where r.world_id = $2 on conflict (world_id, id) do update set %s',
        tbl, cols, cols, tbl, upd) using rows, p_world;
    end if;

    if tbl = any(stateful) then
      insert into private.world_changes (world_id, rev, tbl, ids)
      select p_world, stamp, tbl, x.ids
        from (select array_agg(r->>'id') ids from jsonb_array_elements(rows) r where r->>'world_id' = p_world) x
       where x.ids is not null;
    end if;
  end loop;
  select tick into new_tick from public.worlds where id = p_world;
  return new_tick;
end $$;
revoke all on function public.sim_apply(text, text, jsonb, int) from public;
grant execute on function public.sim_apply(text, text, jsonb, int) to anon, authenticated;

-- Carga completa, parte por parte, montando JSON direto (json_agg): o mesmo conteúdo
-- de sim_load_part, mas ~3x mais barato para o banco (sem passar por jsonb) e com
-- bem menos memória por consulta. sim_load_part continua para versões antigas do app.
create or replace function public.sim_world_part(p_secret text, p_world text, p_part text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  w jsonb;
  game_date date;
  open_elections text[];
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  select (to_jsonb(x) - 'lease_until' - 'lease_holder' - 'created_at' - 'start_year' - 'status')
         || jsonb_build_object('seed', (select s.seed from private.world_seeds s where s.world_id = x.id)),
         x.game_date
    into w, game_date from public.worlds x where id = p_world;
  if w is null then return null; end if;

  if p_part = 'core' then
    return json_build_object(
      'world', w,
      'economy', (select to_json(e) from public.economy_snapshots e where e.world_id = p_world order by e.month desc limit 1),
      'voter_segments', (select coalesce(json_agg(x), '[]'::json) from public.voter_segments x where x.world_id = p_world),
      'bills', (select coalesce(json_agg(x), '[]'::json) from public.bills x where x.world_id = p_world and x.status = 'TRAMITANDO'),
      'policies', (select coalesce(json_agg(x), '[]'::json) from public.policies x where x.world_id = p_world and x.status in ('EM_ANDAMENTO','ATRASADA')),
      'rumors', (select coalesce(json_agg(x), '[]'::json) from public.rumors x where x.world_id = p_world and x.status = 'ATIVO')
    );
  elsif p_part = 'persons' then
    -- o dono do personagem fica em tabela privada; entra no lugar da coluna (sempre vazia)
    return json_build_object('persons', (
      select coalesce(json_agg(json_populate_record(p, json_build_object('user_id', o.user_id))), '[]'::json)
        from public.persons p
        left join private.person_owners o on o.world_id = p.world_id and o.person_id = p.id
       where p.world_id = p_world and (p.status = 'ACTIVE' or p.kind = 'PLAYER')
    ));
  elsif p_part = 'person_states' then
    return json_build_object('person_states', (
      select coalesce(json_agg(s), '[]'::json)
        from public.person_states s
        join public.persons p on p.world_id = s.world_id and p.id = s.id
       where s.world_id = p_world and (p.status = 'ACTIVE' or p.kind = 'PLAYER')
    ));
  elsif p_part = 'parties' then
    return json_build_object(
      'parties', (select coalesce(json_agg(x), '[]'::json) from public.parties x where x.world_id = p_world),
      'factions', (select coalesce(json_agg(x), '[]'::json) from public.factions x where x.world_id = p_world),
      'memberships', (select coalesce(json_agg(x), '[]'::json) from public.memberships x where x.world_id = p_world and x.status = 'ATIVA'),
      'affiliation_requests', (select coalesce(json_agg(x), '[]'::json) from public.affiliation_requests x where x.world_id = p_world and x.status = 'PENDENTE'),
      'relationships', (select coalesce(json_agg(x), '[]'::json) from public.relationships x where x.world_id = p_world)
    );
  elsif p_part = 'elections' then
    select coalesce(array_agg(id), '{}') into open_elections from public.elections where world_id = p_world and status <> 'ENCERRADA';
    return json_build_object(
      'elections', (select coalesce(json_agg(x), '[]'::json) from public.elections x where x.world_id = p_world),
      'races', (select coalesce(json_agg(x), '[]'::json) from public.races x where x.world_id = p_world and x.election_id = any(open_elections)),
      'candidacies', (select coalesce(json_agg(x), '[]'::json) from public.candidacies x where x.world_id = p_world and x.election_id = any(open_elections)),
      'debates', (select coalesce(json_agg(x), '[]'::json) from public.debates x where x.world_id = p_world and x.status in ('AGENDADO', 'AO_VIVO'))
    );
  elsif p_part = 'mandates' then
    return json_build_object('mandates', (
      select coalesce(json_agg(x), '[]'::json) from public.mandates x
       where x.world_id = p_world and (x.status in ('ATIVO','FUTURO') or x.end_on > (game_date - interval '9 years'))
    ));
  elsif p_part = 'crime' then
    return json_build_object(
      'illicit_acts', (select coalesce(json_agg(x), '[]'::json) from public.illicit_acts x where x.world_id = p_world and (not x.discovered or x.created_on > (game_date - interval '6 years'))),
      'investigations', (select coalesce(json_agg(x), '[]'::json) from public.investigations x where x.world_id = p_world and x.outcome is null)
    );
  end if;
  raise exception 'parte desconhecida: %', p_part;
end $$;
revoke all on function public.sim_world_part(text, text, text) from public;
grant execute on function public.sim_world_part(text, text, text) to anon, authenticated;

-- O que mudou no mundo depois da revisão p_since: a linha do mundo, a economia
-- mais recente e, por tabela, as linhas anotadas pelas gravações (mesmo formato da
-- carga completa). "full": true quando o registro não cobre esse intervalo
-- (recarregue tudo). Função estável: todas as leituras usam o mesmo instantâneo do
-- banco, então revisão, registro e linhas são coerentes entre si mesmo com uma
-- poda acontecendo ao mesmo tempo.
create or replace function public.sim_world_delta(p_secret text, p_world text, p_since bigint)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  stateful text[] := array[
    'persons','person_states','parties','factions','memberships','affiliation_requests','relationships','elections',
    'races','candidacies','mandates','bills','policies','illicit_acts','investigations','rumors','debates','voter_segments'
  ];
  cur bigint;
  dfrom bigint;
  w jsonb;
  t text;
  idlist text[];
  part json;
  body text := '';
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  select (to_jsonb(x) - 'lease_until' - 'lease_holder' - 'created_at' - 'start_year' - 'status')
         || jsonb_build_object('seed', (select s.seed from private.world_seeds s where s.world_id = x.id))
    into w from public.worlds x where id = p_world;
  if w is null then return null; end if;
  select l.rev, l.delta_from into cur, dfrom from private.world_leases l where l.world_id = p_world;
  cur := coalesce(cur, 0);
  dfrom := coalesce(dfrom, 0);
  if p_since is null or p_since < dfrom or p_since > cur then
    return json_build_object('rev', cur, 'full', true);
  end if;
  for t, idlist in
    select c.tbl, array_agg(distinct i)
      from private.world_changes c cross join lateral unnest(c.ids) i
     where c.world_id = p_world and c.rev > p_since
     group by c.tbl
  loop
    if not t = any(stateful) then continue; end if;
    if t = 'persons' then
      select coalesce(json_agg(json_populate_record(p, json_build_object('user_id', o.user_id))), '[]'::json)
        into part
        from public.persons p
        left join private.person_owners o on o.world_id = p.world_id and o.person_id = p.id
       where p.world_id = p_world and p.id = any(idlist);
    else
      execute format('select coalesce(json_agg(x), ''[]''::json) from public.%I x where x.world_id = $1 and x.id = any($2)', t)
        into part using p_world, idlist;
    end if;
    body := body || case when body = '' then '' else ',' end || to_json(t)::text || ':' || part::text;
  end loop;
  return json_build_object(
    'rev', cur,
    'full', false,
    'world', w,
    'economy', (select to_json(e) from public.economy_snapshots e where e.world_id = p_world order by e.month desc limit 1),
    'tables', ('{' || body || '}')::json
  );
end $$;
revoke all on function public.sim_world_delta(text, text, bigint) from public;
grant execute on function public.sim_world_delta(text, text, bigint) to anon, authenticated;

-- Liberação: além de subir a revisão, poda o registro de mudanças com mais de 3 h
-- (e marca a partir de que revisão ele continua completo).
create or replace function public.sim_release_rev(p_secret text, p_world text, p_holder text, p_dirty boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r bigint; pruned bigint;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  with gone as (
    delete from private.world_changes c where c.world_id = p_world and c.at < now() - interval '3 hours' returning c.rev
  ) select max(gone.rev) into pruned from gone;
  if pruned is not null then
    update private.world_leases set delta_from = greatest(delta_from, pruned) where world_id = p_world;
  end if;
  update private.world_leases
     set lease_until = now() - interval '1 second', rev = rev + case when p_dirty then 1 else 0 end
   where world_id = p_world and holder = p_holder
  returning rev into r;
  return r;
end $$;
revoke all on function public.sim_release_rev(text, text, text, boolean) from public;
grant execute on function public.sim_release_rev(text, text, text, boolean) to anon, authenticated;

-- Mudança feita fora do motor (exclusão de conta, remoção de mundo): ela não
-- passa pelo registro, então quem estiver atrás desta revisão recarrega tudo.
create or replace function public.sim_bump_rev(p_secret text, p_world text, p_by bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r bigint;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into private.world_leases as l (world_id, holder, lease_until, rev, delta_from)
  values (p_world, '', now() - interval '1 second', greatest(p_by, 1), greatest(p_by, 1))
  on conflict (world_id) do update set rev = l.rev + greatest(p_by, 1), delta_from = l.rev + greatest(p_by, 1)
  returning l.rev into r;
  return r;
end $$;
revoke all on function public.sim_bump_rev(text, text, bigint) from public;
grant execute on function public.sim_bump_rev(text, text, bigint) to anon, authenticated;

-- Remoção de mundo próprio: também apaga o registro de mudanças dele.
create or replace function public.sim_drop_world(p_secret text, p_world text)
returns void language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_world !~ '^br[0-9]{4}[pf][0-9a-f]{10}$' then raise exception 'mundo compartilhado não pode ser removido' using errcode = '22023'; end if;
  for t in
    select c.table_name from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'world_id'
  loop
    execute format('delete from public.%I where world_id = $1', t) using p_world;
  end loop;
  delete from private.person_owners where world_id = p_world;
  delete from private.world_seeds where world_id = p_world;
  delete from private.world_changes where world_id = p_world;
  delete from private.world_leases where world_id = p_world;
  delete from public.worlds where id = p_world;
end $$;
revoke all on function public.sim_drop_world(text, text) from public;
grant execute on function public.sim_drop_world(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
