-- Poda mais leve: cada rodada (a cada 10 minutos) só olha os mundos que andaram desde a última
-- poda completa. Antes, toda rodada varria os mundos todos, inclusive os parados, e gastava cerca
-- de 10 s de banco sem apagar nada (era a consulta que mais pesava no banco).

create table if not exists private.prune_marks (
  world_id text primary key,
  -- dia de jogo (tick) em que a última poda completa terminou
  pruned_tick int not null,
  at timestamptz not null default now()
);
revoke all on table private.prune_marks from public, anon, authenticated;

create or replace function private.prune_world(p_world text, p_rows int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  w record;
  players text[];
  mark int;
  n int;
  total int := 0;
  done boolean := true;
begin
  select x.id, x.tick, x.game_date into w from public.worlds x where x.id = p_world;
  if not found or w.tick is null or w.game_date is null then return 0; end if;

  -- o mundo andou menos de 10 dias desde a última poda completa: nada novo para apagar
  -- (tick menor que a marca: o mundo foi recriado com o mesmo id, então poda de novo)
  select m.pruned_tick into mark from private.prune_marks m where m.world_id = p_world;
  if mark is not null and w.tick >= mark and w.tick - mark < 10 then return 0; end if;

  select coalesce(array_agg(p.id), '{}') into players
    from public.persons p where p.world_id = p_world and p.kind = 'PLAYER';

  delete from public.world_events e where e.ctid = any (array(
    select x.ctid from public.world_events x
     where x.world_id = p_world and x.tick < w.tick - 30
       and not coalesce(x.type = any (private.player_event_types()), false)
       and not coalesce(x.actors && players, false)
     limit p_rows));
  get diagnostics n = row_count; total := total + n;
  if n >= p_rows then done := false; end if;

  delete from public.news_articles a where a.ctid = any (array(
    select x.ctid from public.news_articles x
     where x.world_id = p_world and x.game_date < w.game_date - 365
       and not coalesce(x.factual, false) and x.user_id is null
       and not coalesce(x.person_ids && players, false)
     limit p_rows));
  get diagnostics n = row_count; total := total + n;
  if n >= p_rows then done := false; end if;

  delete from public.notifications a where a.ctid = any (array(
    select x.ctid from public.notifications x
     where x.world_id = p_world and x.read_at is not null and x.game_date < w.game_date - 180
     limit p_rows));
  get diagnostics n = row_count; total := total + n;
  if n >= p_rows then done := false; end if;

  -- tudo o que dava para apagar saiu: as próximas rodadas pulam este mundo até ele andar 10 dias
  if done then
    insert into private.prune_marks (world_id, pruned_tick, at) values (p_world, w.tick, now())
    on conflict (world_id) do update set pruned_tick = excluded.pruned_tick, at = excluded.at;
  end if;
  return total;
end $$;
revoke all on function private.prune_world(text, int) from public;

create or replace procedure private.prune_all()
language plpgsql as $$
declare
  started timestamptz := clock_timestamp();
  w record;
  n int;
begin
  -- marcas de mundos que já não existem
  delete from private.prune_marks m where not exists (select 1 from public.worlds x where x.id = m.world_id);
  commit;

  -- remoções interrompidas e mundos próprios sem dono (conta apagada ou mundo criado sem personagem)
  for w in
    select x.id from public.worlds x
     where x.id ~ '^br[0-9]{4}[pf][0-9a-f]{10}$'
       and (coalesce(x.stats ? 'dropping', false)
            or (x.created_at < now() - interval '1 day'
                and not coalesce(x.stats ? 'building', false)
                and not exists (select 1 from private.person_owners o where o.world_id = x.id)))
  loop
    exit when clock_timestamp() - started > interval '20 seconds';
    perform private.drop_world_chunk(w.id, 4000, interval '5 seconds');
    commit;
  end loop;

  -- poda: um lote por mundo e por rodada, em ordem sorteada (todos acabam passando)
  for w in select x.id from public.worlds x where not coalesce(x.stats ? 'dropping', false) order by random() loop
    exit when clock_timestamp() - started > interval '40 seconds';
    n := private.prune_world(w.id, 3000);
    commit;
  end loop;
end $$;

-- Compactação toda madrugada (4h05 em Brasília, o horário com menos jogadores): devolve ao disco o
-- espaço que o banco guarda depois de atualizar e apagar linhas. Não apaga dado nenhum; trava cada
-- tabela por alguns segundos enquanto a reescreve. O plano grátis trava o banco acima de 500 MB.
select cron.schedule(
  'compactar-banco',
  '5 7 * * *',
  $$vacuum (full, analyze) public.person_states, public.persons, public.mandates, public.investigations, public.news_articles, public.illicit_acts, public.memberships, public.world_events, public.races, public.candidacies, public.polls, public.finance_transactions, public.notifications, private.world_changes$$
);
