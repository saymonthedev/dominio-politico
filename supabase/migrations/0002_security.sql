-- Segurança: RLS em todas as tabelas. Sem políticas de escrita, o cliente não
-- consegue inserir/alterar/apagar nada: as escritas do motor passam por RPCs
-- SECURITY DEFINER protegidas por segredo de servidor (0003_rpc.sql).
--
-- Dados sensíveis ficam no schema privado (não exposto pela API):
--   private.world_seeds   — seed de cada mundo (permitiria prever eventos)
--   private.person_owners — vínculo conta ↔ personagem

create extension if not exists pgcrypto with schema extensions;

create table if not exists private.world_seeds (
  world_id text primary key,
  seed text not null
);

create table if not exists private.person_owners (
  world_id text not null,
  person_id text not null,
  user_id uuid not null,
  primary key (world_id, person_id)
);
create index if not exists person_owners_user_idx on private.person_owners (user_id);

do $$
declare t text;
begin
  foreach t in array array[
    'sources','license_records','player_profiles','worlds','persons','person_states','parties','factions','memberships',
    'affiliation_requests','relationships','elections','races','candidacies','mandates','bills','policies','illicit_acts',
    'investigations','rumors','debates','voter_segments','economy_snapshots','world_events','news_articles','notifications',
    'finance_transactions','polls'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Leitura pública (mundo compartilhado)
do $$
declare t text;
begin
  foreach t in array array[
    'sources','license_records','worlds','persons','parties','factions','memberships','elections','races','candidacies',
    'mandates','bills','policies','investigations','rumors','debates','voter_segments','economy_snapshots'
  ] loop
    execute format('create policy "leitura publica" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

create or replace function private.owns_person(p_world text, p_person text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.person_owners o
    where o.world_id = p_world and o.person_id = p_person and o.user_id = auth.uid()
  );
$$;
grant usage on schema private to anon, authenticated;
grant execute on function private.owns_person(text, text) to anon, authenticated;

create policy "dono" on public.person_states for select to authenticated using (user_id = (select auth.uid()));
create policy "dono" on public.affiliation_requests for select to authenticated using (private.owns_person(world_id, person_id));
create policy "dono" on public.relationships for select to authenticated using (private.owns_person(world_id, a_id));
create policy "dono" on public.finance_transactions for select to authenticated using (private.owns_person(world_id, person_id));
create policy "dono ou descoberto" on public.illicit_acts for select to authenticated using (discovered or private.owns_person(world_id, person_id));
create policy "dono" on public.world_events for select to authenticated using (
  exists (
    select 1 from public.person_states s
    where s.world_id = world_events.world_id and s.user_id = (select auth.uid()) and s.id = any(world_events.actors)
  )
);
create policy "publica ou do dono" on public.news_articles for select to anon, authenticated using (visibility = 'PUBLIC' or user_id = (select auth.uid()));
create policy "publica ou do dono" on public.polls for select to anon, authenticated using (private_for is null or private.owns_person(world_id, private_for));
create policy "dono" on public.notifications for select to authenticated using (user_id = (select auth.uid()));

create policy "dono" on public.player_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "dono insere" on public.player_profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "dono atualiza" on public.player_profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
