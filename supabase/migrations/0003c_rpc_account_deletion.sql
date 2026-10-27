-- Exclusão de dados do jogador (LGPD). Rodar no SQL Editor do Supabase
-- (o MCP pede confirmação para funções com UPDATE/DELETE).
create or replace function public.delete_my_data()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.persons p set status = 'RETIRED', status_note = 'Conta encerrada pelo jogador.', name = 'Personagem removido'
    from private.person_owners o where o.world_id = p.world_id and o.person_id = p.id and o.user_id = uid;
  update public.person_states set user_id = null, dossiers = '{}', offers = '[]' where user_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.news_articles where user_id = uid and visibility = 'PRIVATE';
  delete from public.player_profiles where user_id = uid;
  delete from private.person_owners where user_id = uid;
end $$;
