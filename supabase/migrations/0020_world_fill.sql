-- Criação de mundo retomável.
--
-- Criar um mundo grava ~15 mil linhas em lotes. Se a função cai no meio (limite
-- de tempo, banco sobrecarregado), o mundo ficava pela metade para sempre: a linha
-- do mundo existia, então ninguém tentava de novo, e o motor quebrava sem economia,
-- eleições ou mandatos.
--
-- Agora a linha do mundo nasce com stats.building (hora do início) e só perde a
-- marca no fim (sim_world_ready). Um mundo marcado há mais de alguns segundos é
-- retomado: a criação é determinística (mesma semente, mesmos ids), e sim_fill
-- insere só as linhas que faltam, sem tocar nas que já existem (nem no que o
-- jogador já fez).

create or replace function public.sim_fill(p_secret text, p_world text, p_changes jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  allowed text[] := array[
    'persons','person_states','parties','factions','memberships','affiliation_requests','relationships','elections',
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
  ids text[];
  total int := 0;
  stamp bigint;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  select l.rev + 1 into stamp from private.world_leases l where l.world_id = p_world;
  stamp := coalesce(stamp, 1);
  for tbl in select jsonb_object_keys(p_changes) loop
    -- a linha do mundo nunca é regravada aqui (o relógio pode ter andado)
    if tbl = 'worlds' then continue; end if;
    if not tbl = any(allowed) then raise exception 'tabela não permitida: %', tbl; end if;
    rows := p_changes -> tbl;
    if rows is null or jsonb_array_length(rows) = 0 then continue; end if;
    if tbl = 'persons' then
      insert into private.person_owners (world_id, person_id, user_id)
      select p_world, r->>'id', (r->>'user_id')::uuid from jsonb_array_elements(rows) r
       where r->>'world_id' = p_world and r->>'user_id' is not null
      on conflict (world_id, person_id) do nothing;
      select jsonb_agg(r - 'user_id') into rows from jsonb_array_elements(rows) r;
    end if;
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
      into cols
      from pg_catalog.pg_attribute a
     where a.attrelid = ('public.' || quote_ident(tbl))::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attname::text in (select jsonb_object_keys(rows -> 0));
    execute format(
      'with ins as (insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) r where r.world_id = $2 on conflict do nothing returning id) select coalesce(array_agg(id), ''{}'') from ins',
      tbl, cols, cols, tbl) into ids using rows, p_world;
    total := total + coalesce(array_length(ids, 1), 0);
    if coalesce(array_length(ids, 1), 0) > 0 and tbl = any(stateful) then
      insert into private.world_changes (world_id, rev, tbl, ids) values (p_world, stamp, tbl, ids);
    end if;
  end loop;
  return total;
end $$;
revoke all on function public.sim_fill(text, text, jsonb) from public;
grant execute on function public.sim_fill(text, text, jsonb) to anon, authenticated;

-- Situação da criação: null (mundo não existe), 0 (pronto) ou a hora (epoch) em que a criação começou.
create or replace function public.sim_world_building(p_secret text, p_world text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare b bigint;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce((w.stats->>'building')::bigint, 0) into b from public.worlds w where w.id = p_world;
  return b;
end $$;
revoke all on function public.sim_world_building(text, text) from public;
grant execute on function public.sim_world_building(text, text) to anon, authenticated;

-- Criação concluída: tira a marca de "em construção".
create or replace function public.sim_world_ready(p_secret text, p_world text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.worlds set stats = stats - 'building' where id = p_world and stats ? 'building';
end $$;
revoke all on function public.sim_world_ready(text, text) from public;
grant execute on function public.sim_world_ready(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
