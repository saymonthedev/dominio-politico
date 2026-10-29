-- 1) Mundos próprios (br<ano>p… / br<ano>f…) só podem ser lidos pelo dono.
--    Os compartilhados continuam de leitura pública. O motor lê e grava por
--    funções SECURITY DEFINER, que não passam por estas políticas.
create or replace function private.can_read_world(p_world text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_world !~ '^br[0-9]{4}[pf]'
      or exists (select 1 from private.person_owners o where o.world_id = p_world and o.user_id = (select auth.uid()));
$$;
revoke all on function private.can_read_world(text) from public;
grant execute on function private.can_read_world(text) to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['bills','candidacies','debates','economy_snapshots','elections','factions','investigations',
                           'mandates','memberships','parties','persons','policies','races','rumors','voter_segments']
  loop
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('create policy "leitura publica" on public.%I for select to anon, authenticated using (private.can_read_world(world_id))', t);
  end loop;
end $$;

drop policy if exists "leitura publica" on public.worlds;
create policy "leitura publica" on public.worlds for select to anon, authenticated using (private.can_read_world(id));

drop policy if exists "publica ou do dono" on public.news_articles;
create policy "publica ou do dono" on public.news_articles for select to anon, authenticated
  using (((visibility = 'PUBLIC') and private.can_read_world(world_id)) or (user_id = (select auth.uid())));

drop policy if exists "publica ou do dono" on public.polls;
create policy "publica ou do dono" on public.polls for select to anon, authenticated
  using (((private_for is null) and private.can_read_world(world_id)) or private.owns_person(world_id, private_for));

drop policy if exists "dono ou descoberto" on public.illicit_acts;
create policy "dono ou descoberto" on public.illicit_acts for select to authenticated
  using ((discovered and private.can_read_world(world_id)) or private.owns_person(world_id, person_id));

-- 2) O servidor precisa saber se um mundo existe e quantos mundos próprios há,
--    sem enxergar o conteúdo deles.
create or replace function public.world_exists(p_world text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.worlds where id = p_world);
$$;
create or replace function public.private_world_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.worlds where id ~ '^br[0-9]{4}[pf]';
$$;
revoke all on function public.world_exists(text) from public;
revoke all on function public.private_world_count() from public;
grant execute on function public.world_exists(text) to anon, authenticated;
grant execute on function public.private_world_count() to anon, authenticated;

-- 3) Funções da conta exigem login (revisão de segurança do Supabase).
revoke execute on function public.my_characters() from public, anon;
revoke execute on function public.delete_my_data() from public, anon;
revoke execute on function public.mark_notifications_read(text[]) from public, anon;
grant execute on function public.my_characters() to authenticated;
grant execute on function public.delete_my_data() to authenticated;
grant execute on function public.mark_notifications_read(text[]) to authenticated;
