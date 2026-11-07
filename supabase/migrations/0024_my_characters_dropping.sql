-- Mundo sendo apagado deixa de contar como personagem da conta na hora. A remoção roda em pedaços,
-- e enquanto não terminava o jogo ainda mandava o jogador para o mundo antigo (e para o balanço da
-- carreira de lá), mesmo depois de ele ter criado um personagem novo.
create or replace function public.my_characters()
returns table(world_id text, person_id text)
language sql stable security definer set search_path = '' as $$
  select o.world_id, o.person_id
    from private.person_owners o
    join public.worlds w on w.id = o.world_id
   where o.user_id = auth.uid()
     and not coalesce(w.stats ? 'dropping', false);
$$;
