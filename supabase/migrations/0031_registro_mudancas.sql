-- Correção (14/11): progresso que sumia ao voltar ao jogo depois de algumas horas.
--
-- O servidor monta um mundo a partir da cópia guardada fora do banco (Vercel Blob) mais as mudanças
-- registradas depois dela (private.world_changes). A marca world_leases.delta_from diz a partir de que
-- revisão esse registro está completo: pedido mais antigo que ela recebe "leia o mundo inteiro".
-- A poda geral (private.prune_all, desde 11/11) apagava o registro com mais de 3 horas sem mexer na
-- marca. Quem voltava horas depois recebia "nenhuma mudança" e ficava com o mundo da cópia, que pode
-- estar até 30 minutos atrás da última ação: filiação, pré-candidatura e o que mais tivesse sido feito
-- no fim da sessão sumiam (e a próxima ação podia gravar o estado velho por cima).

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

  -- registro de mudanças com mais de 3 horas; a marca de cada mundo avança junto (como em
  -- sim_release_rev), para quem pedir mudanças de antes do corte ler o mundo inteiro
  with gone as (
    delete from private.world_changes c where c.ctid = any (array(
      select x.ctid from private.world_changes x where x.at < now() - interval '3 hours' limit 5000))
    returning c.world_id, c.rev
  ), cut as (
    select g.world_id, max(g.rev) as rev from gone g group by g.world_id
  )
  update private.world_leases l set delta_from = greatest(l.delta_from, cut.rev)
    from cut where l.world_id = cut.world_id;
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

-- Todos os mundos sobem uma revisão com a marca junto (o mesmo que sim_bump_rev): memória dos
-- servidores e cópias guardadas deixam de valer e cada mundo é lido inteiro do banco na próxima vez.
-- Assim nenhuma cópia gravada a partir de um estado velho volta a ser usada.
update private.world_leases set rev = rev + 1, delta_from = rev + 1;
