-- Banco enxuto, com limpeza que nunca estoura o tempo.
--
-- O banco passou do limite do plano (500 MB): a poda diária (sim_maintenance) apagava
-- tudo de uma vez, estourava o tempo e desfazia tudo, então nada era podado. A remoção
-- de mundos (sim_drop_world) tinha o mesmo problema e deixava mundos órfãos para trás.
--
-- Agora:
-- 1) uma tarefa do próprio banco (pg_cron, a cada 10 min) poda aos poucos, mundo a mundo,
--    em lotes pequenos e com COMMIT entre eles (nada fica preso numa transação longa);
-- 2) mundos são removidos em pedaços (sim_drop_world_step), cada chamada bem abaixo do
--    limite de tempo; o mundo marcado "removendo" sai da contagem de vagas na hora e a
--    tarefa do banco termina o que faltar, se a remoção for interrompida;
-- 3) sim_maintenance só decide aviso e remoção de mundos próprios parados.
--
-- O que a poda tira (nada que alguma tela mostre ao jogador):
-- * eventos internos do motor que não envolvem nenhum jogador (nenhuma tela lê);
-- * notícias com mais de 1 ano de jogo, menos as factuais, as privadas e as que citam jogadores;
-- * notificações já lidas com mais de 6 meses de jogo;
-- * mundos próprios sem dono há mais de 1 dia (conta apagada ou mundo criado sem personagem).

create extension if not exists pg_cron with schema pg_catalog;

-- Tipos de evento que contam a história do jogador (a Carreira e a limpeza de mundos parados leem).
create or replace function private.player_event_types()
returns text[] language sql immutable set search_path = '' as $$
  select array['PLAYER_ACTION', 'TIME_ADVANCED', 'CHARACTER_CREATED', 'PLAYER_RETIREMENT']::text[]
$$;

-- Poda um mundo: até p_rows linhas de cada tipo por chamada. Devolve quantas linhas saíram.
create or replace function private.prune_world(p_world text, p_rows int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  w record;
  players text[];
  n int;
  total int := 0;
begin
  select x.id, x.tick, x.game_date into w from public.worlds x where x.id = p_world;
  if not found or w.tick is null or w.game_date is null then return 0; end if;
  select coalesce(array_agg(p.id), '{}') into players
    from public.persons p where p.world_id = p_world and p.kind = 'PLAYER';

  delete from public.world_events e where e.ctid = any (array(
    select x.ctid from public.world_events x
     where x.world_id = p_world and x.tick < w.tick - 30
       and not coalesce(x.type = any (private.player_event_types()), false)
       and not coalesce(x.actors && players, false)
     limit p_rows));
  get diagnostics n = row_count; total := total + n;

  delete from public.news_articles a where a.ctid = any (array(
    select x.ctid from public.news_articles x
     where x.world_id = p_world and x.game_date < w.game_date - 365
       and not coalesce(x.factual, false) and x.user_id is null
       and not coalesce(x.person_ids && players, false)
     limit p_rows));
  get diagnostics n = row_count; total := total + n;

  delete from public.notifications a where a.ctid = any (array(
    select x.ctid from public.notifications x
     where x.world_id = p_world and x.read_at is not null and x.game_date < w.game_date - 180
     limit p_rows));
  get diagnostics n = row_count; total := total + n;

  return total;
end $$;
revoke all on function private.prune_world(text, int) from public;

-- Tabelas do jogo que guardam linhas por mundo (todas têm world_id; a linha do mundo fica por último).
create or replace function private.world_tables()
returns text[] language sql stable set search_path = '' as $$
  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = 'world_id' and a.attnum > 0 and not a.attisdropped
   where ns.nspname = 'public' and c.relkind = 'r'
$$;

-- Remove um pedaço de um mundo próprio (até p_rows linhas por vez, por tabela, dentro de p_budget).
-- true: o mundo saiu inteiro; false: falta um pedaço (chame de novo).
create or replace function private.drop_world_chunk(p_world text, p_rows int, p_budget interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  t text;
  n int;
  started timestamptz := clock_timestamp();
begin
  if p_world !~ '^br[0-9]{4}[pf][0-9a-f]{10}$' then
    raise exception 'mundo compartilhado não pode ser removido' using errcode = '22023';
  end if;
  -- marca na hora: some da contagem de vagas e ninguém recria por cima enquanto sai
  update public.worlds set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('dropping', extract(epoch from now())::bigint)
   where id = p_world and not coalesce(stats ? 'dropping', false);
  foreach t in array private.world_tables() loop
    loop
      execute format(
        'delete from public.%I d where d.ctid = any (array(select x.ctid from public.%I x where x.world_id = $1 limit $2))', t, t)
        using p_world, p_rows;
      get diagnostics n = row_count;
      exit when n < p_rows;
      if clock_timestamp() - started > p_budget then return false; end if;
    end loop;
    if clock_timestamp() - started > p_budget then return false; end if;
  end loop;
  delete from private.person_owners where world_id = p_world;
  delete from private.world_seeds where world_id = p_world;
  delete from private.world_changes where world_id = p_world;
  delete from private.world_leases where world_id = p_world;
  delete from public.worlds where id = p_world;
  return true;
end $$;
revoke all on function private.drop_world_chunk(text, int, interval) from public;

-- Remoção pelo servidor do jogo: um pedaço por chamada (~2 s). true quando o mundo saiu inteiro.
create or replace function public.sim_drop_world_step(p_secret text, p_world text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.drop_world_chunk(p_world, 4000, interval '2 seconds');
end $$;
revoke all on function public.sim_drop_world_step(text, text) from public;
grant execute on function public.sim_drop_world_step(text, text) to anon, authenticated;

-- Versão antiga (servidores ainda não atualizados): começa a remoção; o banco termina sozinho.
create or replace function public.sim_drop_world(p_secret text, p_world text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.drop_world_chunk(p_world, 4000, interval '2 seconds');
end $$;
revoke all on function public.sim_drop_world(text, text) from public;
grant execute on function public.sim_drop_world(text, text) to anon, authenticated;

-- Mundo sendo removido não ocupa vaga.
create or replace function public.private_world_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.worlds
   where id ~ '^br[0-9]{4}[pf]' and not coalesce(stats ? 'dropping', false);
$$;
revoke all on function public.private_world_count() from public;
grant execute on function public.private_world_count() to anon, authenticated;

-- Situação da criação: null (não existe), 0 (pronto), -1 (sendo removido) ou a hora (epoch)
-- em que a criação começou.
create or replace function public.sim_world_building(p_secret text, p_world text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare b bigint;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  select case when w.stats ? 'dropping' then -1 else coalesce((w.stats->>'building')::bigint, 0) end
    into b from public.worlds w where w.id = p_world;
  return b;
end $$;
revoke all on function public.sim_world_building(text, text) from public;
grant execute on function public.sim_world_building(text, text) to anon, authenticated;

-- Tarefa do banco (a cada 10 min): termina remoções interrompidas, remove mundos próprios
-- sem dono e poda os mundos aos poucos. Cada passo grava na hora (COMMIT) e a rodada
-- inteira para em ~40 s. (Sem SET no procedimento: com ele o Postgres proíbe o COMMIT;
-- por isso todos os nomes aqui dentro vão com o esquema.)
create or replace procedure private.prune_all()
language plpgsql as $$
declare
  started timestamptz := clock_timestamp();
  w record;
  n int;
begin
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
revoke all on procedure private.prune_all() from public;

-- Manutenção diária: só os avisos e as remoções de mundos próprios parados (a poda é da tarefa do banco).
create or replace function public.sim_maintenance(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w record;
  warn jsonb := '[]'::jsonb; dropped jsonb := '[]'::jsonb;
  last_active timestamptz; warned_at timestamptz;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  for w in
    select x.id, x.created_at, x.stats from public.worlds x
     where x.id ~ '^br[0-9]{4}[pf][0-9a-f]{10}$' and not coalesce(x.stats ? 'dropping', false)
  loop
    select greatest(w.created_at, coalesce(max(e.created_at), w.created_at)) into last_active
      from public.world_events e
     where e.world_id = w.id and e.type = any (private.player_event_types());
    warned_at := case when (w.stats ->> 'cleanup_warned') is null then null else to_timestamp((w.stats ->> 'cleanup_warned')::bigint) end;

    if warned_at is not null and last_active > warned_at then
      -- voltou a jogar depois do aviso
      update public.worlds set stats = stats - 'cleanup_warned' where id = w.id;
    elsif last_active < now() - interval '90 days' and warned_at is not null and warned_at < now() - interval '6 days' then
      -- marca para remoção; a tarefa do banco tira o mundo aos pedaços
      update public.worlds set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('dropping', extract(epoch from now())::bigint) where id = w.id;
      dropped := dropped || to_jsonb(w.id);
    elsif last_active < now() - interval '83 days' and warned_at is null then
      update public.worlds set stats = stats || jsonb_build_object('cleanup_warned', extract(epoch from now())::bigint) where id = w.id;
      warn := warn || (
        select coalesce(jsonb_agg(jsonb_build_object('world', w.id, 'email', u.email, 'last_active', last_active,
                                                      'delete_after', greatest(last_active + interval '90 days', now() + interval '7 days'))), '[]'::jsonb)
          from private.person_owners o join auth.users u on u.id = o.user_id
         where o.world_id = w.id and u.email is not null
      );
    end if;
  end loop;
  return jsonb_build_object('news', 0, 'events', 0, 'notifications', 0, 'warn', warn, 'dropped', dropped);
end $$;
revoke all on function public.sim_maintenance(text) from public;
grant execute on function public.sim_maintenance(text) to anon, authenticated;

-- Índice nunca usado (0 leituras) que só pesava nas gravações e no tamanho do banco.
drop index if exists public.news_persons_idx;

-- Agenda a tarefa (idempotente: troca a anterior de mesmo nome).
select cron.unschedule(jobid) from cron.job where jobname = 'poda-mundos';
select cron.schedule('poda-mundos', '*/10 * * * *', 'call private.prune_all()');

notify pgrst, 'reload schema';
