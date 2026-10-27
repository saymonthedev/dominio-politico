-- RPCs do motor: carregar e gravar o estado de um mundo. Exigem o segredo de servidor.
-- Seeds e vínculos conta ↔ personagem ficam no schema privado.

create or replace function private.check_secret(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.app_secrets
    where name = 'sim' and hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
  );
$$;

create or replace function public.sim_load(p_secret text, p_world text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w jsonb;
  res jsonb;
  open_elections text[];
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  select (to_jsonb(x) - 'lease_until' - 'lease_holder' - 'created_at' - 'start_year' - 'status')
         || jsonb_build_object('seed', (select s.seed from private.world_seeds s where s.world_id = x.id))
    into w from public.worlds x where id = p_world;
  if w is null then return null; end if;
  select coalesce(array_agg(id), '{}') into open_elections from public.elections where world_id = p_world and status <> 'ENCERRADA';

  with active_persons as (
    select p.*, o.user_id as owner_id
      from public.persons p
      left join private.person_owners o on o.world_id = p.world_id and o.person_id = p.id
     where p.world_id = p_world and (p.status = 'ACTIVE' or p.kind = 'PLAYER')
  )
  select jsonb_build_object(
    'world', w,
    'economy', (select to_jsonb(e) from public.economy_snapshots e where e.world_id = p_world order by e.month desc limit 1),
    'persons', (select coalesce(jsonb_agg((to_jsonb(p) - 'owner_id') || jsonb_build_object('user_id', p.owner_id)), '[]') from active_persons p),
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

-- Personagens do usuário logado (em todos os mundos)
create or replace function public.my_characters()
returns table (world_id text, person_id text) language sql stable security definer set search_path = '' as $$
  select o.world_id, o.person_id from private.person_owners o where o.user_id = auth.uid();
$$;
