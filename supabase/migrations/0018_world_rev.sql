-- Revisão do mundo: sobe a cada gravação. O servidor guarda o mundo em memória
-- junto com a revisão em que o leu; se a revisão no banco é a mesma, reaproveita
-- o estado em vez de recarregar o mundo inteiro (milhares de linhas) a cada ação.
-- Toda gravação do motor acontece com o mundo trancado (lease), então a revisão
-- sobe na liberação; quem mexe no mundo por fora (exclusão de conta, remoção de
-- mundo) chama sim_bump_rev.
alter table private.world_leases add column if not exists rev bigint not null default 0;

-- Tranca o mundo e devolve a revisão atual (null se outro está com ele).
create or replace function public.sim_lease_rev(p_secret text, p_world text, p_holder text, p_seconds int)
returns bigint language plpgsql security definer set search_path = '' as $$
declare got text; r bigint;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into private.world_leases as l (world_id, holder, lease_until)
  values (p_world, p_holder, now() + make_interval(secs => p_seconds))
  on conflict (world_id) do update set holder = excluded.holder, lease_until = excluded.lease_until
   where l.lease_until < now() or l.holder = excluded.holder
  returning l.holder, l.rev into got, r;
  if got is null then return null; end if;
  return r;
end $$;
revoke all on function public.sim_lease_rev(text, text, text, int) from public;
grant execute on function public.sim_lease_rev(text, text, text, int) to anon, authenticated;

-- Libera o mundo; se houve gravação, a revisão sobe. Devolve a revisão final (null se o lease já era de outro).
create or replace function public.sim_release_rev(p_secret text, p_world text, p_holder text, p_dirty boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r bigint;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  update private.world_leases
     set lease_until = now() - interval '1 second', rev = rev + case when p_dirty then 1 else 0 end
   where world_id = p_world and holder = p_holder
  returning rev into r;
  return r;
end $$;
revoke all on function public.sim_release_rev(text, text, text, boolean) from public;
grant execute on function public.sim_release_rev(text, text, text, boolean) to anon, authenticated;

-- Revisão atual, para as telas conferirem se o mundo em memória ainda vale.
create or replace function public.world_rev(p_secret text, p_world text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select rev from private.world_leases where world_id = p_world), 0);
end $$;
revoke all on function public.world_rev(text, text) from public;
grant execute on function public.world_rev(text, text) to anon, authenticated;

-- A liberação antiga (versões do app ainda no ar durante a troca) também sobe a revisão.
create or replace function public.sim_release(p_secret text, p_world text, p_holder text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into private.world_leases as l (world_id, holder, lease_until)
  values (p_world, p_holder, now())
  on conflict (world_id) do update set lease_until = now() - interval '1 second', rev = l.rev + 1
   where l.holder = excluded.holder;
end $$;

-- Quem mexe no mundo por fora do motor (exclusão de conta, remoção de mundo
-- próprio) chama esta função logo depois: a revisão sobe e nenhuma memória antiga
-- é reaproveitada. Depois de remover um mundo, sobe muito (1.000.000), para um
-- mundo recriado com o mesmo id nunca repetir uma revisão já vista.
create or replace function public.sim_bump_rev(p_secret text, p_world text, p_by bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r bigint;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into private.world_leases as l (world_id, holder, lease_until, rev)
  values (p_world, '', now() - interval '1 second', greatest(p_by, 1))
  on conflict (world_id) do update set rev = l.rev + greatest(p_by, 1)
  returning l.rev into r;
  return r;
end $$;
revoke all on function public.sim_bump_rev(text, text, bigint) from public;
grant execute on function public.sim_bump_rev(text, text, bigint) to anon, authenticated;

notify pgrst, 'reload schema';
