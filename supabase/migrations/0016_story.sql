-- Acontecimentos da carreira: eventos com contexto e escolha, continuações
-- marcadas para o futuro, memória do personagem, saúde e fim da jornada.
-- Fica numa coluna jsonb do estado do personagem (só jogadores a usam; nos
-- demais é null). O dono lê pela política "dono" que já existe na tabela.
alter table public.person_states add column if not exists story jsonb;

-- Debates com jogador ficam "ao vivo" até a resposta do momento decisivo:
-- precisam voltar com o mundo nas próximas cargas.
create or replace function public.sim_load_part(p_secret text, p_world text, p_part text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w jsonb;
  game_date date;
  open_elections text[];
  res jsonb;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  select (to_jsonb(x) - 'lease_until' - 'lease_holder' - 'created_at' - 'start_year' - 'status')
         || jsonb_build_object('seed', (select s.seed from private.world_seeds s where s.world_id = x.id)),
         x.game_date
    into w, game_date from public.worlds x where id = p_world;
  if w is null then return null; end if;

  if p_part = 'core' then
    select jsonb_build_object(
      'world', w,
      'economy', (select to_jsonb(e) from public.economy_snapshots e where e.world_id = p_world order by e.month desc limit 1),
      'voter_segments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.voter_segments x where x.world_id = p_world),
      'bills', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.bills x where x.world_id = p_world and x.status = 'TRAMITANDO'),
      'policies', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.policies x where x.world_id = p_world and x.status in ('EM_ANDAMENTO','ATRASADA')),
      'rumors', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.rumors x where x.world_id = p_world and x.status = 'ATIVO')
    ) into res;
  elsif p_part = 'persons' then
    select jsonb_build_object('persons', (
      select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('user_id', o.user_id)), '[]')
        from public.persons p
        left join private.person_owners o on o.world_id = p.world_id and o.person_id = p.id
       where p.world_id = p_world and (p.status = 'ACTIVE' or p.kind = 'PLAYER')
    )) into res;
  elsif p_part = 'person_states' then
    select jsonb_build_object('person_states', (
      select coalesce(jsonb_agg(to_jsonb(s)), '[]')
        from public.person_states s
        join public.persons p on p.world_id = s.world_id and p.id = s.id
       where s.world_id = p_world and (p.status = 'ACTIVE' or p.kind = 'PLAYER')
    )) into res;
  elsif p_part = 'parties' then
    select jsonb_build_object(
      'parties', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.parties x where x.world_id = p_world),
      'factions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.factions x where x.world_id = p_world),
      'memberships', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.memberships x where x.world_id = p_world and x.status = 'ATIVA'),
      'affiliation_requests', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.affiliation_requests x where x.world_id = p_world and x.status = 'PENDENTE'),
      'relationships', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.relationships x where x.world_id = p_world)
    ) into res;
  elsif p_part = 'elections' then
    select coalesce(array_agg(id), '{}') into open_elections from public.elections where world_id = p_world and status <> 'ENCERRADA';
    select jsonb_build_object(
      'elections', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.elections x where x.world_id = p_world),
      'races', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.races x where x.world_id = p_world and x.election_id = any(open_elections)),
      'candidacies', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.candidacies x where x.world_id = p_world and x.election_id = any(open_elections)),
      'debates', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.debates x where x.world_id = p_world and x.status in ('AGENDADO', 'AO_VIVO'))
    ) into res;
  elsif p_part = 'mandates' then
    select jsonb_build_object('mandates', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.mandates x
       where x.world_id = p_world and (x.status in ('ATIVO','FUTURO') or x.end_on > (game_date - interval '9 years'))
    )) into res;
  elsif p_part = 'crime' then
    select jsonb_build_object(
      'illicit_acts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.illicit_acts x where x.world_id = p_world and (not x.discovered or x.created_on > (game_date - interval '6 years'))),
      'investigations', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.investigations x where x.world_id = p_world and x.outcome is null)
    ) into res;
  else
    raise exception 'parte desconhecida: %', p_part;
  end if;
  return res;
end $$;

revoke all on function public.sim_load_part(text, text, text) from public;
grant execute on function public.sim_load_part(text, text, text) to anon, authenticated;
