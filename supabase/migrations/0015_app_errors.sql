-- Erros do servidor (páginas, ações e tarefa diária) guardados por 14 dias,
-- fora da API pública, e mostrados no painel /admin.
create table if not exists private.app_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source text not null,
  path text,
  message text not null,
  digest text
);
create index if not exists app_errors_at_idx on private.app_errors (at desc);

create or replace function public.log_error(p_secret text, p_source text, p_path text, p_message text, p_digest text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into private.app_errors (source, path, message, digest)
  values (left(coalesce(p_source, '?'), 40), left(p_path, 300), left(coalesce(p_message, '?'), 2000), left(p_digest, 80));
  delete from private.app_errors where at < now() - interval '14 days';
end $$;
revoke all on function public.log_error(text, text, text, text, text) from public;
grant execute on function public.log_error(text, text, text, text, text) to anon, authenticated;

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
    'errors_24h', (select count(*) from private.app_errors where at > now() - interval '24 hours'),
    'errors_7d', (select count(*) from private.app_errors where at > now() - interval '7 days'),
    'errors', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'source', e.source, 'path', e.path, 'message', e.message, 'digest', e.digest) order by e.at desc), '[]'::jsonb)
                 from (select * from private.app_errors order by at desc limit 25) e),
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
