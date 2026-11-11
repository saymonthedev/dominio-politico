-- Limpeza grande (11/11): o banco chegou a 476 MB, perto dos 500 MB do plano grátis, e com o relógio
-- novo os mundos compartilhados andam ~534 dias de jogo por dia real. A poda passa a apagar também o
-- que o motor não carrega e nenhuma tela mostra:
--  * notificações com mais de 1 ano de jogo, lidas ou não;
--  * crimes já descobertos com mais de 6 anos de jogo (o motor só carrega os dos últimos 6) e crimes
--    de personagens que saíram de cena há mais de 1 ano, nunca os de jogadores nem os citados em
--    alguma investigação;
--  * mandatos encerrados há mais de 9 anos de jogo de personagens que saíram de cena (o motor só
--    carrega os dos últimos 9; o perfil de quem está em cena continua com o histórico inteiro);
--  * o registro de mudanças com mais de 3 horas (ninguém lê o que passou disso).
-- Tudo em lotes, com a mesma regra de esperar o banco folgar. A compactação das 4h05 devolve o espaço.

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

  -- notificações: lidas com mais de 180 dias de jogo; qualquer uma com mais de 1 ano
  delete from public.notifications a where a.ctid = any (array(
    select x.ctid from public.notifications x
     where x.world_id = p_world
       and ((x.read_at is not null and x.game_date < w.game_date - 180) or x.game_date < w.game_date - 365)
     limit p_rows));
  get diagnostics n = row_count; total := total + n;
  if n >= p_rows then done := false; end if;

  -- estado de quem saiu de cena (a pessoa fica)
  delete from public.person_states s where s.ctid = any (array(
    select x.ctid from public.person_states x
      join public.persons p on p.world_id = x.world_id and p.id = x.id
     where x.world_id = p_world and p.status <> 'ACTIVE' and p.kind <> 'PLAYER'
     limit p_rows));
  get diagnostics n = row_count; total := total + n;
  if n >= p_rows then done := false; end if;

  -- filiações encerradas de quem não é jogador
  delete from public.memberships a where a.ctid = any (array(
    select x.ctid from public.memberships x
     where x.world_id = p_world and x.status <> 'ATIVA'
       and not coalesce(x.person_id = any (players), false)
     limit p_rows));
  get diagnostics n = row_count; total := total + n;
  if n >= p_rows then done := false; end if;

  -- investigações concluídas fora das 100 mais recentes, sem jogador e sem partido como alvo
  delete from public.investigations a where a.ctid = any (array(
    select x.ctid from public.investigations x
     where x.world_id = p_world and x.outcome is not null
       and coalesce(x.target_type, 'PESSOA') <> 'PARTIDO'
       and not coalesce(x.person_id = any (players), false)
       and not coalesce(x.opened_by = any (players), false)
       and x.id not in (
         select y.id from public.investigations y
          where y.world_id = p_world
          order by y.opened_on desc nulls last
          limit 100)
     limit p_rows));
  get diagnostics n = row_count; total := total + n;
  if n >= p_rows then done := false; end if;

  -- crimes antigos ou de quem saiu de cena (nunca de jogador nem citados em investigação)
  delete from public.illicit_acts a where a.ctid = any (array(
    select x.ctid from public.illicit_acts x
     where x.world_id = p_world
       and not coalesce(x.person_id = any (players), false)
       and ((coalesce(x.discovered, false) and x.created_on < (w.game_date - interval '6 years')::date)
            or (x.person_id is not null and x.created_on < w.game_date - 365
                and not exists (select 1 from public.persons p
                                 where p.world_id = p_world and p.id = x.person_id and p.status = 'ACTIVE')))
       and not exists (select 1 from public.investigations i
                        where i.world_id = p_world and x.id = any (i.act_ids))
     limit p_rows));
  get diagnostics n = row_count; total := total + n;
  if n >= p_rows then done := false; end if;

  -- mandatos encerrados há mais de 9 anos de quem saiu de cena
  delete from public.mandates a where a.ctid = any (array(
    select x.ctid from public.mandates x
     where x.world_id = p_world and x.status = 'ENCERRADO'
       and x.end_on is not null and x.end_on < (w.game_date - interval '9 years')::date
       and not coalesce(x.person_id = any (players), false)
       and not exists (select 1 from public.persons p
                        where p.world_id = p_world and p.id = x.person_id and p.status = 'ACTIVE')
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

create or replace procedure private.prune_all()
language plpgsql as $$
declare
  started timestamptz := clock_timestamp();
  w record;
  n int;
begin
  -- banco ocupado com o jogo: fica para a próxima rodada
  if private.db_busy() then return; end if;

  -- marcas de mundos que já não existem
  delete from private.prune_marks m where not exists (select 1 from public.worlds x where x.id = m.world_id);
  commit;

  -- registro de mudanças com mais de 3 horas (a busca de mudanças só olha as últimas 3 horas)
  delete from private.world_changes c where c.ctid = any (array(
    select x.ctid from private.world_changes x where x.at < now() - interval '3 hours' limit 5000));
  commit;

  -- remoções interrompidas e mundos próprios sem dono (conta apagada ou mundo criado sem personagem)
  for w in
    select x.id from public.worlds x
     where x.id ~ '^br[0-9]{4}[pf][0-9a-f]{10}$'
       and (coalesce(x.stats ? 'dropping', false)
            or (x.created_at < now() - interval '1 day'
                and (not coalesce(x.stats ? 'building', false)
                     or (x.stats->>'building')::bigint < extract(epoch from now() - interval '1 day'))
                and not exists (select 1 from private.person_owners o where o.world_id = x.id)))
  loop
    exit when clock_timestamp() - started > interval '15 seconds' or private.db_busy();
    perform private.drop_world_chunk(w.id, 2000, interval '5 seconds');
    commit;
  end loop;

  -- poda: um lote por mundo e por rodada, em ordem sorteada (todos acabam passando)
  for w in select x.id from public.worlds x where not coalesce(x.stats ? 'dropping', false) order by random() loop
    exit when clock_timestamp() - started > interval '25 seconds' or private.db_busy();
    n := private.prune_world(w.id, 1000);
    commit;
  end loop;
end $$;

-- todos os mundos passam de novo pela poda, agora com as regras novas
delete from private.prune_marks;

-- rodadas extras de poda a cada 5 minutos até 1h da manhã de Brasília (4h UTC); depois, só a de 10 em 10
select cron.schedule('poda-extra', '*/5 * * * *', $job$
do $$
begin
  if now() > timestamptz '2026-11-11 04:00:00+00' then
    perform cron.unschedule('poda-extra');
  else
    call private.prune_all();
  end if;
end $$;
$job$);
