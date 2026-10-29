-- Painel de saúde do jogo (página /admin, restrita): números agregados de cada
-- mundo, contas e tamanho do banco. Só o servidor chama, com o segredo do motor.
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
    'unconfirmed', (select count(*) from auth.users where email_confirmed_at is null),
    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object('name', t.relname, 'bytes', pg_total_relation_size(t.oid)) order by pg_total_relation_size(t.oid) desc), '[]'::jsonb)
        from (select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind = 'r' order by pg_total_relation_size(c.oid) desc limit 8) t
    ),
    'worlds', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id, 'game_date', w.game_date, 'tick', w.tick, 'anchor_real_at', w.anchor_real_at, 'speed', w.game_days_per_real_hour,
        'persons', (select count(*) from public.persons p where p.world_id = w.id and p.status = 'ACTIVE'),
        'players', (select count(*) from public.persons p where p.world_id = w.id and p.kind = 'PLAYER' and p.status = 'ACTIVE'),
        'players_24h', (select count(distinct a) from public.world_events e, unnest(e.actors) a where e.world_id = w.id and e.type = 'PLAYER_ACTION' and e.created_at > now() - interval '24 hours'),
        'players_7d', (select count(distinct a) from public.world_events e, unnest(e.actors) a where e.world_id = w.id and e.type = 'PLAYER_ACTION' and e.created_at > now() - interval '7 days'),
        'actions_24h', (select count(*) from public.world_events e where e.world_id = w.id and e.type = 'PLAYER_ACTION' and e.created_at > now() - interval '24 hours'),
        'advances_24h', (select coalesce(sum((e.payload ->> 'days')::int), 0) from public.world_events e where e.world_id = w.id and e.type = 'TIME_ADVANCED' and e.created_at > now() - interval '24 hours'),
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
      from public.worlds w
    )
  ) into res;
  return res;
end $$;

revoke all on function public.admin_overview(text) from public;
grant execute on function public.admin_overview(text) to anon, authenticated;
