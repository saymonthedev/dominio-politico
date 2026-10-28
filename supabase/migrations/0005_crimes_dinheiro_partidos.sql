-- Crimes ampliados, dinheiro detalhado e partidos fundados por jogadores.
-- Só colunas novas: sim_apply grava qualquer coluna que exista na tabela, e
-- sim_load devolve as linhas inteiras (to_jsonb), então nada mais muda.

-- Dinheiro e dossiês do personagem (person_states já é visível só para o dono)
alter table public.person_states
  add column if not exists findings jsonb not null default '{}'::jsonb,
  add column if not exists dirty_money double precision not null default 0,
  add column if not exists debt double precision not null default 0,
  add column if not exists assets double precision not null default 0,
  add column if not exists ledger jsonb not null default '{"month": null, "items": [], "net": 0}'::jsonb,
  add column if not exists jailed_until date,
  add column if not exists sentence jsonb;

-- Esquemas recorrentes e contexto do ato (illicit_acts: dono ou descoberto)
alter table public.illicit_acts
  add column if not exists ongoing boolean not null default false,
  add column if not exists monthly_gain double precision not null default 0,
  add column if not exists stopped_on date,
  add column if not exists office_code text,
  add column if not exists geo text,
  add column if not exists votes_gain double precision not null default 0;

-- Investigações de pessoas ou de partidos, com acusações, origem, medidas e pena
alter table public.investigations
  add column if not exists party_id text,
  add column if not exists target_type text not null default 'PESSOA',
  add column if not exists crimes text[] not null default '{}',
  add column if not exists channel text,
  add column if not exists measures jsonb not null default '[]'::jsonb,
  add column if not exists sentence jsonb;
alter table public.investigations alter column person_id drop not null;
create index if not exists investigations_party_idx on public.investigations (world_id, party_id) where party_id is not null;

-- Partidos fundados no jogo
alter table public.parties
  add column if not exists founder_id text,
  add column if not exists founded_on date,
  add column if not exists formation jsonb,
  add column if not exists fund_suspended_until date;
