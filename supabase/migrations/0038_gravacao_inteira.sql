-- Gravação do dia tudo ou nada (19/11).
--
-- Um dia grande vai para o banco em vários lotes. Se o servidor cai no meio (limite de tempo, banco
-- engasgado), uma parte fica gravada e a outra não, e quem lê o mundo depois vê um dia pela metade.
-- Foi o que deixou personagens sem ficha no mundo de 2002.
--
-- Agora, antes dos lotes, o servidor guarda o pacote inteiro (comprimido) em private.world_journal
-- e o apaga quando termina. Se cair no meio, o próximo servidor que trancar o mundo encontra o
-- pacote, grava o que faltou (as gravações do motor são idempotentes), sobe a revisão e só então
-- segue. Gravação que cabe numa chamada só não usa o diário: uma chamada já é tudo ou nada.
--
-- O pacote vale para a revisão do lease em que foi escrito. Se a liberação sobe a revisão com o
-- pacote ainda lá (a gravação falhou no meio), ele acompanha a revisão nova. Pacote de revisão que
-- não bate (alguém gravou depois por outro caminho) é descartado.

create table if not exists private.world_journal (
  world_id text primary key references public.worlds (id) on delete cascade,
  holder text not null,
  rev bigint not null,
  data bytea not null,
  at timestamptz not null default now()
);
alter table private.world_journal enable row level security;
revoke all on table private.world_journal from public, anon, authenticated;

-- Guarda o pacote antes dos lotes. Só quem está com o lease grava; devolve a revisão do lease.
create or replace function public.sim_journal_put(p_secret text, p_world text, p_holder text, p_data text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r bigint;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  select l.rev into r from private.world_leases l where l.world_id = p_world and l.holder = p_holder;
  if r is null then raise exception 'lease_lost: o mundo não está com este servidor' using errcode = '55P03'; end if;
  insert into private.world_journal (world_id, holder, rev, data)
  values (p_world, p_holder, r, decode(p_data, 'base64'))
  on conflict (world_id) do update set holder = excluded.holder, rev = excluded.rev, data = excluded.data, at = now();
  return r;
end $$;
revoke all on function public.sim_journal_put(text, text, text, text) from public;
grant execute on function public.sim_journal_put(text, text, text, text) to anon, authenticated;

-- Pacote pendente do mundo (null se não há): a revisão e os dados em base64.
create or replace function public.sim_journal_get(p_secret text, p_world text)
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select json_build_object('rev', j.rev, 'data', encode(j.data, 'base64'))
            from private.world_journal j where j.world_id = p_world);
end $$;
revoke all on function public.sim_journal_get(text, text) from public;
grant execute on function public.sim_journal_get(text, text) to anon, authenticated;

-- Pacote gravado inteiro (ou velho): sai do diário. Com p_bump, a revisão sobe com o lease ainda
-- na mão (quem completou a gravação cortada de outro servidor avisa os demais). Devolve a revisão.
create or replace function public.sim_journal_done(p_secret text, p_world text, p_holder text, p_rev bigint, p_bump boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r bigint;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from private.world_journal j where j.world_id = p_world and j.rev = p_rev;
  if p_bump then
    update private.world_leases l set rev = l.rev + 1
     where l.world_id = p_world and l.holder = p_holder
    returning l.rev into r;
  else
    select l.rev into r from private.world_leases l where l.world_id = p_world;
  end if;
  return r;
end $$;
revoke all on function public.sim_journal_done(text, text, text, bigint, boolean) from public;
grant execute on function public.sim_journal_done(text, text, text, bigint, boolean) to anon, authenticated;

-- Liberação (igual à da 0019) e, se a revisão sobe com o pacote deste servidor ainda pendente
-- (gravação que falhou no meio), o pacote passa a valer para a revisão nova.
create or replace function public.sim_release_rev(p_secret text, p_world text, p_holder text, p_dirty boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r bigint; pruned bigint;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  with gone as (
    delete from private.world_changes c where c.world_id = p_world and c.at < now() - interval '3 hours' returning c.rev
  ) select max(gone.rev) into pruned from gone;
  if pruned is not null then
    update private.world_leases set delta_from = greatest(delta_from, pruned) where world_id = p_world;
  end if;
  update private.world_leases
     set lease_until = now() - interval '1 second', rev = rev + case when p_dirty then 1 else 0 end
   where world_id = p_world and holder = p_holder
  returning rev into r;
  if p_dirty and r is not null then
    update private.world_journal j set rev = r where j.world_id = p_world and j.holder = p_holder;
  end if;
  return r;
end $$;
revoke all on function public.sim_release_rev(text, text, text, boolean) from public;
grant execute on function public.sim_release_rev(text, text, text, boolean) to anon, authenticated;
