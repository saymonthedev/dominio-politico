-- Lease do relógio do mundo (concorrência entre cron e ações) e marcação de notificações lidas.
-- Usa insert ... on conflict em vez de update direto.
create table if not exists private.world_leases (
  world_id text primary key,
  holder text not null,
  lease_until timestamptz not null
);

create or replace function public.sim_lease(p_secret text, p_world text, p_holder text, p_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare got text;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into private.world_leases as l (world_id, holder, lease_until)
  values (p_world, p_holder, now() + make_interval(secs => p_seconds))
  on conflict (world_id) do update set holder = excluded.holder, lease_until = excluded.lease_until
   where l.lease_until < now() or l.holder = excluded.holder
  returning holder into got;
  return got is not null;
end $$;

create or replace function public.sim_release(p_secret text, p_world text, p_holder text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into private.world_leases as l (world_id, holder, lease_until)
  values (p_world, p_holder, now())
  on conflict (world_id) do update set lease_until = now() - interval '1 second'
   where l.holder = excluded.holder;
end $$;

create or replace function public.mark_notifications_read(p_ids text[] default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications as n (world_id, id, read_at)
  select x.world_id, x.id, now() from public.notifications x
   where x.user_id = auth.uid() and x.read_at is null and (p_ids is null or x.id = any(p_ids))
  on conflict (world_id, id) do update set read_at = excluded.read_at;
$$;
