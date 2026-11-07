-- Poda do histórico que o jogo não lê mais, para o banco caber nos 500 MB do plano grátis.
-- Entra na mesma poda de 10 em 10 minutos, em lotes por mundo:
--  * estado (person_states) de quem saiu de cena (aposentado ou morto) e não é jogador: o motor só
--    carrega o estado de quem está ativo e ninguém volta à ativa. A pessoa continua (nome, mandatos,
--    perfil), só some o estado interno;
--  * filiações encerradas de quem não é jogador: o motor só carrega as ativas, e o balanço de
--    carreira (que lê o histórico) é só de jogador;
--  * investigações concluídas: a tela mostra as 80 mais recentes do mundo; ficam as 100 mais
--    recentes, as que envolvem jogadores (alvo ou quem abriu) e as contra partidos.

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

  -- tudo o que dava para apagar saiu: as próximas rodadas pulam este mundo até ele andar 10 dias
  if done then
    insert into private.prune_marks (world_id, pruned_tick, at) values (p_world, w.tick, now())
    on conflict (world_id) do update set pruned_tick = excluded.pruned_tick, at = excluded.at;
  end if;
  return total;
end $$;
revoke all on function private.prune_world(text, int) from public;

-- regras novas: todos os mundos passam de novo pela poda na próxima rodada
delete from private.prune_marks;
