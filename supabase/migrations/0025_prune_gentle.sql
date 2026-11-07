-- Poda sem disputar o banco com os jogadores. Em 7/11, nos horários de pico, a rodada de 10 em 10
-- minutos chegou a rodar mais de 2 minutos (até estourar o limite de tempo) justo quando o banco já
-- estava no limite, e várias rodadas nem conseguiram começar. Agora:
--  * a rodada não começa (e para no meio) quando o banco está ocupado com o jogo: 4 ou mais consultas
--    rodando ao mesmo tempo, ou alguma rodando há mais de 3 s;
--  * lotes menores (1000 linhas por tabela e por mundo) e no máximo 25 s de poda por rodada.
-- O que não for apagado agora fica para as próximas rodadas, nos horários calmos.

create or replace function private.db_busy()
returns boolean language sql volatile security definer set search_path = '' as $$
  select count(*) >= 4
      or count(*) filter (where pg_catalog.clock_timestamp() - a.query_start > interval '3 seconds') > 0
    from pg_catalog.pg_stat_activity a
   where a.state = 'active'
     and a.backend_type = 'client backend'
     and a.pid <> pg_catalog.pg_backend_pid();
$$;
revoke all on function private.db_busy() from public;

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

  -- remoções interrompidas e mundos próprios sem dono (conta apagada ou mundo criado sem personagem)
  for w in
    select x.id from public.worlds x
     where x.id ~ '^br[0-9]{4}[pf][0-9a-f]{10}$'
       and (coalesce(x.stats ? 'dropping', false)
            or (x.created_at < now() - interval '1 day'
                and not coalesce(x.stats ? 'building', false)
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
