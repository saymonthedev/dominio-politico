-- Limpeza top (14/11): o banco chegou a 487 MB, perto dos 500 MB do plano grátis, porque os mundos
-- andaram décadas desde a última limpeza. A poda passa a apagar também o que nenhuma tela mostra e o
-- motor não carrega:
--  * lançamentos financeiros com mais de 2 anos de jogo (a tela de Finanças mostra só os 240 mais
--    recentes; o extrato do mês fica no estado do jogador);
--  * notícias simuladas fora da carreira de algum jogador com mais de 6 meses de jogo (antes, 1 ano);
--  * pesquisas de eleições antigas (fica a última eleição encerrada e as abertas);
--  * registros de "passou o tempo" com mais de 3 dias reais.
-- O resto das regras não muda. Tudo em lotes, esperando o banco folgar; a compactação das 4h05
-- devolve o espaço.

create or replace function private.prune_world(p_world text, p_rows int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  w record;
  players text[];
  mark int;
  n int;
  total int := 0;
  done boolean := true;
  last_closed int;
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

  -- "passou o tempo" dos jogadores com mais de 3 dias reais (a Carreira mostra os mais recentes)
  delete from public.world_events e where e.ctid = any (array(
    select x.ctid from public.world_events x
     where x.world_id = p_world and x.type = 'TIME_ADVANCED' and x.created_at < now() - interval '3 days'
     limit p_rows));
  get diagnostics n = row_count; total := total + n;
  if n >= p_rows then done := false; end if;

  -- notícias simuladas fora da carreira de algum jogador: 6 meses de jogo
  delete from public.news_articles a where a.ctid = any (array(
    select x.ctid from public.news_articles x
     where x.world_id = p_world and x.game_date < w.game_date - 180
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

  -- lançamentos financeiros com mais de 2 anos de jogo (ninguém lê; o extrato do mês fica no estado)
  delete from public.finance_transactions a where a.ctid = any (array(
    select x.ctid from public.finance_transactions x
     where x.world_id = p_world and x.game_date < w.game_date - 730
     limit p_rows));
  get diagnostics n = row_count; total := total + n;
  if n >= p_rows then done := false; end if;

  -- pesquisas de eleições antigas (fica a última encerrada, para a página de resultados, e as abertas)
  select max(e.year) into last_closed from public.elections e where e.world_id = p_world and e.status = 'ENCERRADA';
  if last_closed is not null then
    delete from public.polls a where a.ctid = any (array(
      select x.ctid from public.polls x
        join public.races r on r.world_id = x.world_id and r.id = x.race_id
        join public.elections e on e.world_id = r.world_id and e.id = r.election_id
       where x.world_id = p_world and e.status = 'ENCERRADA' and e.year < last_closed
       limit p_rows));
    get diagnostics n = row_count; total := total + n;
    if n >= p_rows then done := false; end if;
  end if;

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

-- todos os mundos passam de novo pela poda, agora com as regras novas
delete from private.prune_marks;

-- rodadas extras de poda a cada 5 minutos até 4h de Brasília (7h UTC), antes da compactação das 4h05
select cron.schedule('poda-extra', '*/5 * * * *', $job$
do $$
begin
  if now() > timestamptz '2026-11-14 07:00:00+00' then
    perform cron.unschedule('poda-extra');
  else
    call private.prune_all();
  end if;
end $$;
$job$);
