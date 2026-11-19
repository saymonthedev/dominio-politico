-- Carga completa de um mundo, uma de cada vez.
--
-- Quando um servidor novo não acha a cópia do mundo (Vercel Blob), ele lê o mundo inteiro do banco:
-- dezenas de MB em 7 consultas grandes. Com vários servidores acordando ao mesmo tempo (depois de uma
-- publicação, ou num pico), todos liam o mesmo mundo juntos, o banco engasgava, as leituras estouravam
-- o tempo, ninguém gravava a cópia e a próxima leva tentava de novo: em 19/11, 9 de cada 10 cargas
-- falhavam e o login (que divide a mesma máquina) passou a demorar 50 s.
--
-- Agora o servidor pede a vez: só um por mundo, e no máximo `p_max` mundos ao mesmo tempo. Quem não
-- ganha a vez espera a cópia que o outro grava ao terminar. A vez expira sozinha (servidor que morreu
-- no meio não trava ninguém).

create table if not exists private.world_load_slots (
  world_id text primary key,
  holder text not null,
  until timestamptz not null
);

create or replace function public.sim_load_slot(p_secret text, p_world text, p_holder text, p_seconds int, p_max int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare busy int;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  -- pedidos ao mesmo tempo entram em fila curta (a conta de quantos estão carregando precisa ser exata)
  perform pg_advisory_xact_lock(hashtext('private.world_load_slots'));
  delete from private.world_load_slots where until < now();
  if exists (select 1 from private.world_load_slots where world_id = p_world and holder <> p_holder) then
    return false;
  end if;
  select count(*) into busy from private.world_load_slots where world_id <> p_world;
  if busy >= greatest(1, p_max) then
    return false;
  end if;
  insert into private.world_load_slots (world_id, holder, until)
  values (p_world, p_holder, now() + make_interval(secs => greatest(5, least(p_seconds, 120))))
  on conflict (world_id) do update set holder = excluded.holder, until = excluded.until;
  return true;
end $$;
revoke all on function public.sim_load_slot(text, text, text, int, int) from public;
grant execute on function public.sim_load_slot(text, text, text, int, int) to anon, authenticated;

create or replace function public.sim_load_done(p_secret text, p_world text, p_holder text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from private.world_load_slots where world_id = p_world and holder = p_holder;
end $$;
revoke all on function public.sim_load_done(text, text, text) from public;
grant execute on function public.sim_load_done(text, text, text) to anon, authenticated;
