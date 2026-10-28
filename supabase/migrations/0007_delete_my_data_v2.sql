-- Exclusão de conta: também apaga dossiês e achados, zera dinheiro não declarado,
-- encerra a fundação de partido em andamento e tira o jogador da presidência.
create or replace function public.delete_my_data()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.parties x set status = 'EXTINTO'
    from private.person_owners o
   where o.user_id = uid and x.world_id = o.world_id and x.founder_id = o.person_id and x.status = 'EM_FORMACAO';
  update public.parties x set president_id = null
    from private.person_owners o
   where o.user_id = uid and x.world_id = o.world_id and x.president_id = o.person_id;
  update public.affiliation_requests r set status = 'RETIRADO'
    from private.person_owners o
   where o.user_id = uid and r.world_id = o.world_id and r.person_id = o.person_id and r.status = 'PENDENTE';
  update public.persons p set status = 'RETIRED', status_note = 'Conta encerrada pelo jogador.', name = 'Personagem removido'
    from private.person_owners o where o.world_id = p.world_id and o.person_id = p.id and o.user_id = uid;
  update public.person_states
     set user_id = null, dossiers = '{}', findings = '{}', offers = '[]', dirty_money = 0, ledger = '{"month": null, "items": [], "net": 0}'::jsonb
   where user_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.news_articles where user_id = uid and visibility = 'PRIVATE';
  delete from public.player_profiles where user_id = uid;
  delete from private.person_owners where user_id = uid;
  delete from auth.users where id = uid;
end $$;
