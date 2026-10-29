-- Manutenção diária (chamada pela tarefa agendada /api/cron/tick com o segredo do motor):
-- 1) Poda: notícias, eventos e notificações lidas com mais de alguns anos de jogo,
--    guardando o que importa (manchetes de importância 3, fatos com fonte, notícias
--    privadas de jogadores e tudo o que envolve um jogador).
-- 2) Mundos próprios parados: aviso aos 83 dias sem uso e remoção aos 90
--    (só se o aviso tiver saído há pelo menos 6 dias).
create or replace function public.sim_maintenance(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w record;
  n_news int := 0; n_events int := 0; n_notes int := 0; k int;
  warn jsonb := '[]'::jsonb; dropped jsonb := '[]'::jsonb;
  last_active timestamptz; warned_at timestamptz;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;

  for w in select id, tick, game_date, created_at, stats from public.worlds loop
    delete from public.news_articles n
     where n.world_id = w.id and n.game_date < w.game_date - 730
       and n.importance < 3 and not n.factual and n.user_id is null
       and not exists (select 1 from public.persons p where p.world_id = w.id and p.kind = 'PLAYER' and p.id = any (n.person_ids));
    get diagnostics k = row_count; n_news := n_news + k;

    delete from public.world_events e
     where e.world_id = w.id and e.tick < w.tick - 730
       and e.type not in ('PLAYER_ACTION', 'TIME_ADVANCED', 'CHARACTER_CREATED')
       and not exists (select 1 from public.persons p where p.world_id = w.id and p.kind = 'PLAYER' and p.id = any (e.actors));
    get diagnostics k = row_count; n_events := n_events + k;

    delete from public.notifications x
     where x.world_id = w.id and x.read_at is not null and x.game_date < w.game_date - 365;
    get diagnostics k = row_count; n_notes := n_notes + k;

    -- mundos próprios: br<ano>p… ou br<ano>f…
    if w.id ~ '^br[0-9]{4}[pf][0-9a-f]{10}$' then
      select greatest(w.created_at, coalesce(max(e.created_at), w.created_at)) into last_active
        from public.world_events e
       where e.world_id = w.id and e.type in ('PLAYER_ACTION', 'TIME_ADVANCED', 'CHARACTER_CREATED');
      warned_at := case when (w.stats ->> 'cleanup_warned') is null then null else to_timestamp((w.stats ->> 'cleanup_warned')::bigint) end;

      if warned_at is not null and last_active > warned_at then
        -- voltou a jogar depois do aviso
        update public.worlds set stats = stats - 'cleanup_warned' where id = w.id;
      elsif last_active < now() - interval '90 days' and warned_at is not null and warned_at < now() - interval '6 days' then
        perform public.sim_drop_world(p_secret, w.id);
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
    end if;
  end loop;

  return jsonb_build_object('news', n_news, 'events', n_events, 'notifications', n_notes, 'warn', warn, 'dropped', dropped);
end $$;

revoke all on function public.sim_maintenance(text) from public;
grant execute on function public.sim_maintenance(text) to anon, authenticated;
