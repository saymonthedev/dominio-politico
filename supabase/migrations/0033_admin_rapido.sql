-- Painel /admin rápido: a função levava de 4 a 11 s. Quase todo o tempo ia em contar, a cada
-- abertura, pessoas, crimes e investigações dos mundos compartilhados linha por linha (4,7 s) e em
-- ler todos os eventos de jogadores de cada mundo (1,4 s). Agora:
-- * essas contagens vêm prontas do motor, guardadas em worlds.stats (n_persons, n_acts...) uma vez
--   por semana do jogo; até o mundo virar a rodada com a versão nova, aparecem vazias;
-- * a última atividade e os números das últimas 24 h saem de um índice só com os eventos dos
--   jogadores, sem ler o histórico inteiro.

create index if not exists world_events_player_at_idx on public.world_events (world_id, created_at desc)
  where type = any ('{PLAYER_ACTION,TIME_ADVANCED,CHARACTER_CREATED,PLAYER_RETIREMENT}'::text[]);

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
        'last_active', l.last_active, 'actions_24h', d.actions_24h, 'players_24h', d.players_24h, 'advances_24h', d.advances_24h
      ) order by l.last_active desc nulls last), '[]'::jsonb)
      from public.worlds w
      -- a última atividade: o primeiro item do índice dos eventos de jogadores
      left join lateral (
        select e.created_at last_active from public.world_events e
         where e.world_id = w.id and e.type = any (private.player_event_types())
         order by e.created_at desc limit 1
      ) l on true
      -- as últimas 24 h: só os eventos desse intervalo
      cross join lateral (
        select count(*) filter (where e.type = 'PLAYER_ACTION') actions_24h,
               count(distinct e.actors[1]) filter (where e.type = 'PLAYER_ACTION') players_24h,
               coalesce(sum((e.payload ->> 'days')::numeric) filter (where e.type = 'TIME_ADVANCED'), 0) advances_24h
          from public.world_events e
         where e.world_id = w.id and e.type = any (private.player_event_types()) and e.created_at > now() - interval '24 hours'
      ) d
    ),
    'shared', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id,
        'persons', (w.stats ->> 'n_persons')::bigint,
        'acts', (w.stats ->> 'n_acts')::bigint,
        'acts_discovered', (w.stats ->> 'n_acts_found')::bigint,
        'investigations_open', (w.stats ->> 'n_inv_open')::bigint,
        'investigations_closed', (w.stats ->> 'n_inv_closed')::bigint,
        'convictions', (w.stats ->> 'n_convictions')::bigint,
        'news', (select count(*) from public.news_articles x where x.world_id = w.id),
        'parties_player', (w.stats ->> 'n_parties_player')::bigint,
        'economy', (select coalesce(jsonb_agg(jsonb_build_object('month', s.month, 'selic', s.selic, 'inflation', s.inflation_12m, 'unemployment', s.unemployment, 'gdp', s.gdp_growth) order by s.month), '[]'::jsonb)
                      from (select * from public.economy_snapshots e where e.world_id = w.id order by e.month desc limit 36) s)
      ) order by w.id), '[]'::jsonb)
      from public.worlds w where w.id !~ '^br[0-9]{4}[pf]'
    )
  ) into res;
  return res;
end $$;
