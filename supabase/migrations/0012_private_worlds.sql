-- Mundos próprios (só de um jogador, reais ou fictícios): ids br<ano>p… / br<ano>f….
-- Quando o dono apaga o personagem ou a conta, o mundo inteiro é removido.
create or replace function public.sim_drop_world(p_secret text, p_world text)
returns void language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  -- só mundos próprios; os mundos compartilhados (br2026 etc.) nunca são apagados por aqui
  if p_world !~ '^br[0-9]{4}[pf][0-9a-f]{10}$' then raise exception 'mundo compartilhado não pode ser removido' using errcode = '22023'; end if;
  for t in
    select c.table_name from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'world_id'
  loop
    execute format('delete from public.%I where world_id = $1', t) using p_world;
  end loop;
  delete from private.person_owners where world_id = p_world;
  delete from private.world_seeds where world_id = p_world;
  delete from private.world_leases where world_id = p_world;
  delete from public.worlds where id = p_world;
end $$;

revoke all on function public.sim_drop_world(text, text) from public;
grant execute on function public.sim_drop_world(text, text) to anon, authenticated;
