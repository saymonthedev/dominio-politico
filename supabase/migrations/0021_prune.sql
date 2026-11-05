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
--
-- E mais: painel de saúde leve (admin_overview) e mundos próprios quase sem uso removidos mais cedo
-- (com aviso por e-mail), regra aprovada pelo dono do jogo.

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
-- Mundo quase sem uso (menos de 30 dias de jogo): aviso por e-mail aos 7 dias parado e remoção aos 10
-- (pelo menos 3 dias depois do aviso). Os demais: aviso aos 83 dias e remoção aos 90, como antes.
create or replace function public.sim_maintenance(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w record;
  warn jsonb := '[]'::jsonb; dropped jsonb := '[]'::jsonb;
  last_active timestamptz; warned_at timestamptz;
  warn_after interval; drop_after interval; grace interval; rule_days int;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  for w in
    select x.id, x.tick, x.created_at, x.stats from public.worlds x
     where x.id ~ '^br[0-9]{4}[pf][0-9a-f]{10}$' and not coalesce(x.stats ? 'dropping', false)
  loop
    if coalesce(w.tick, 0) < 30 then
      warn_after := interval '7 days'; drop_after := interval '10 days'; grace := interval '3 days'; rule_days := 10;
    else
      warn_after := interval '83 days'; drop_after := interval '90 days'; grace := interval '6 days'; rule_days := 90;
    end if;
    select greatest(w.created_at, coalesce(max(e.created_at), w.created_at)) into last_active
      from public.world_events e
     where e.world_id = w.id and e.type = any (private.player_event_types());
    warned_at := case when (w.stats ->> 'cleanup_warned') is null then null else to_timestamp((w.stats ->> 'cleanup_warned')::bigint) end;

    if warned_at is not null and last_active > warned_at then
      -- voltou a jogar depois do aviso
      update public.worlds set stats = stats - 'cleanup_warned' where id = w.id;
    elsif last_active < now() - drop_after and warned_at is not null and warned_at < now() - grace then
      -- marca para remoção; a tarefa do banco tira o mundo aos pedaços
      update public.worlds set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('dropping', extract(epoch from now())::bigint) where id = w.id;
      dropped := dropped || to_jsonb(w.id);
    elsif last_active < now() - warn_after and warned_at is null then
      update public.worlds set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('cleanup_warned', extract(epoch from now())::bigint) where id = w.id;
      warn := warn || (
        select coalesce(jsonb_agg(jsonb_build_object('world', w.id, 'email', u.email, 'last_active', last_active, 'rule_days', rule_days,
                                                      'delete_after', greatest(last_active + drop_after, now() + grace + interval '1 day'))), '[]'::jsonb)
          from private.person_owners o join auth.users u on u.id = o.user_id
         where o.world_id = w.id and u.email is not null
      );
    end if;
  end loop;
  return jsonb_build_object('news', 0, 'events', 0, 'notifications', 0, 'warn', warn, 'dropped', dropped);
end $$;
revoke all on function public.sim_maintenance(text) from public;
grant execute on function public.sim_maintenance(text) to anon, authenticated;

-- Painel de saúde leve. Antes contava crimes, investigações e notícias de todos os mundos de uma vez
-- (e o painel ainda abria cada mundo inteiro): estourava o tempo e ficava carregando. Agora: uma linha
-- barata por mundo (jogadores, atividade, relógio) e os detalhes só dos mundos compartilhados.
create or replace function public.admin_overview(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'now', now(),
    'db_bytes', pg_database_size(current_database()),
    'accounts', (select count(*) from auth.users),
    'accounts_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'accounts_24h', (select count(*) from auth.users where created_at > now() - interval '24 hours'),
    'unconfirmed', (select count(*) from auth.users where email_confirmed_at is null),
    'errors_24h', (select count(*) from private.app_errors where at > now() - interval '24 hours'),
    'errors_7d', (select count(*) from private.app_errors where at > now() - interval '7 days'),
    'errors', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'source', e.source, 'path', e.path, 'message', e.message, 'digest', e.digest) order by e.at desc), '[]'::jsonb)
                 from (select * from private.app_errors order by at desc limit 25) e),
    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object('name', t.relname, 'bytes', t.bytes) order by t.bytes desc), '[]'::jsonb)
        from (select c.relname, pg_total_relation_size(c.oid) bytes from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname in ('public', 'private') and c.relkind = 'r' order by 2 desc limit 8) t
    ),
    'worlds', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id, 'game_date', w.game_date, 'tick', w.tick, 'anchor_real_at', w.anchor_real_at, 'anchor_tick', w.anchor_tick,
        'speed', w.game_days_per_real_hour, 'created_at', w.created_at,
        'dropping', coalesce(w.stats ? 'dropping', false), 'warned', coalesce(w.stats ? 'cleanup_warned', false),
        'players', (select count(*) from private.person_owners o where o.world_id = w.id),
        'last_active', a.last_active, 'actions_24h', a.actions_24h, 'players_24h', a.players_24h, 'advances_24h', a.advances_24h
      ) order by a.last_active desc nulls last), '[]'::jsonb)
      from public.worlds w
      cross join lateral (
        select max(e.created_at) last_active,
               count(*) filter (where e.type = 'PLAYER_ACTION' and e.created_at > now() - interval '24 hours') actions_24h,
               count(distinct e.actors[1]) filter (where e.type = 'PLAYER_ACTION' and e.created_at > now() - interval '24 hours') players_24h,
               coalesce(sum((e.payload ->> 'days')::numeric) filter (where e.type = 'TIME_ADVANCED' and e.created_at > now() - interval '24 hours'), 0) advances_24h
          from public.world_events e
         where e.world_id = w.id and e.type = any (private.player_event_types())
      ) a
    ),
    'shared', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id,
        'persons', (select count(*) from public.persons p where p.world_id = w.id and p.status = 'ACTIVE'),
        'acts', (select count(*) from public.illicit_acts x where x.world_id = w.id),
        'acts_discovered', (select count(*) from public.illicit_acts x where x.world_id = w.id and x.discovered),
        'investigations_open', (select count(*) from public.investigations x where x.world_id = w.id and x.outcome is null),
        'investigations_closed', (select count(*) from public.investigations x where x.world_id = w.id and x.outcome is not null),
        'convictions', (select count(*) from public.investigations x where x.world_id = w.id and x.outcome = 'CONDENADO'),
        'news', (select count(*) from public.news_articles x where x.world_id = w.id),
        'parties_player', (select count(*) from public.parties x where x.world_id = w.id and x.founder_id is not null and x.status <> 'EXTINTO'),
        'economy', (select coalesce(jsonb_agg(jsonb_build_object('month', s.month, 'selic', s.selic, 'inflation', s.inflation_12m, 'unemployment', s.unemployment, 'gdp', s.gdp_growth) order by s.month), '[]'::jsonb)
                      from (select * from public.economy_snapshots e where e.world_id = w.id order by e.month desc limit 36) s)
      ) order by w.id), '[]'::jsonb)
      from public.worlds w where w.id !~ '^br[0-9]{4}[pf]'
    )
  ) into res;
  return res;
end $$;
revoke all on function public.admin_overview(text) from public;
grant execute on function public.admin_overview(text) to anon, authenticated;

-- Agenda a tarefa (idempotente: com o mesmo nome, o pg_cron atualiza a existente).
select cron.schedule('poda-mundos', '*/10 * * * *', 'call private.prune_all()');

notify pgrst, 'reload schema';
