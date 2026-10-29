-- Relógio compartilhado entre jogadores: quem jogou nas últimas 72 h (ação,
-- avanço do tempo ou personagem novo) e os últimos avanços manuais do tempo.
-- Leitura agregada para o servidor e para o Painel; nenhum dado privado sai daqui.
create or replace function public.clock_activity(p_world text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with ev as (
    select e.type, e.actors, e.payload, e.created_at
      from public.world_events e
     where e.world_id = p_world
       and e.type in ('PLAYER_ACTION', 'TIME_ADVANCED', 'CHARACTER_CREATED')
       and e.created_at > now() - interval '7 days'
  ), players as (
    select distinct a.id
      from ev
      cross join lateral unnest(ev.actors) as a(id)
      join public.persons p on p.world_id = p_world and p.id = a.id and p.kind = 'PLAYER' and p.status = 'ACTIVE'
     where ev.created_at > now() - interval '72 hours'
  ), adv as (
    select ev.actors[1] as person_id, ev.payload, ev.created_at
      from ev
     where ev.type = 'TIME_ADVANCED'
     order by ev.created_at desc
     limit 12
  )
  select jsonb_build_object(
    'active', (select coalesce(jsonb_agg(players.id), '[]'::jsonb) from players),
    'advances', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'person_id', adv.person_id,
               'name', p.name,
               'days', coalesce((adv.payload ->> 'days')::int, 0),
               'from', adv.payload ->> 'from',
               'to', adv.payload ->> 'to',
               'at', adv.created_at
             ) order by adv.created_at desc), '[]'::jsonb)
        from adv
        left join public.persons p on p.world_id = p_world and p.id = adv.person_id
    ),
    'hour', (
      select jsonb_build_object('days', coalesce(sum(coalesce((ev.payload ->> 'days')::int, 0)), 0), 'oldest', min(ev.created_at))
        from ev
       where ev.type = 'TIME_ADVANCED' and ev.created_at > now() - interval '60 minutes'
    ),
    'now', now()
  );
$$;

revoke all on function public.clock_activity(text) from public;
grant execute on function public.clock_activity(text) to anon, authenticated;
