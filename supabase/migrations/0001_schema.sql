-- Domínio Político — schema inicial
-- Todas as tabelas de mundo usam chave (world_id, id): cada ponto de partida
-- (2002, 2006, …, 2026) é um mundo persistente independente.

create schema if not exists private;

-- ---------------------------------------------------------------- globais
create table public.sources (
  id text primary key,
  title text not null,
  url text not null,
  publisher text not null,
  license text not null,
  retrieved_on date
);

-- License Registry (documento técnico): nenhum ativo real vai a produção sem CLEARED
create table public.license_records (
  id text primary key,
  asset_type text not null,
  rights_holder text not null,
  source text not null,
  license_type text not null,
  commercial_use_allowed boolean not null default false,
  territory text,
  starts_at date,
  expires_at date,
  attribution_required boolean not null default true,
  attribution_text text,
  contract_reference text,
  license_status text not null default 'PENDING' check (license_status in ('PENDING','CLEARED','REJECTED','EXPIRED')),
  content_hash text,
  is_real_world_asset boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  accepted_terms_at timestamptz,
  age_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table private.app_secrets (
  name text primary key,
  hash text not null
);

-- ---------------------------------------------------------------- mundo
create table public.worlds (
  id text primary key,
  name text not null,
  seed text not null,
  ruleset_version text not null,
  tick int not null default 0,
  game_date date not null,
  start_game_date date not null,
  anchor_real_at timestamptz not null,
  anchor_tick int not null default 0,
  game_days_per_real_hour double precision not null default 2,
  election_integrity_mode boolean not null default false,
  gov jsonb not null default '{}',
  stats jsonb not null default '{}',
  start_year int,
  status text not null default 'ATIVO',
  lease_until timestamptz,
  lease_holder text,
  created_at timestamptz not null default now()
);

create table public.persons (
  world_id text not null, id text not null,
  kind text not null, user_id uuid, name text not null, birth_year int, uf text, municipality text,
  profession text, origin text, party_id text, faction_id text, stage text, reputation double precision,
  visibility double precision, ideology jsonb, status text, status_note text, office_code text, office_geo text,
  real_party_label text, source_id text, external_ref text, tier int, role_label text, created_tick int,
  primary key (world_id, id)
);
create index persons_status_idx on public.persons (world_id, status);
create index persons_user_idx on public.persons (user_id) where user_id is not null;
create index persons_party_idx on public.persons (world_id, party_id);

create table public.person_states (
  world_id text not null, id text not null,
  user_id uuid, traits jsonb, money double precision, energy double precision, political_capital double precision,
  party_standing double precision, debate_prep double precision, scandal double precision, reach jsonb, action_log jsonb,
  offers jsonb, interests text[], domicile_since date, filiation_date date, ineligible_until date, activism double precision,
  income_last_year double precision, last_action_tick int, action_seq int, dossiers jsonb,
  primary key (world_id, id)
);
create index person_states_user_idx on public.person_states (user_id) where user_id is not null;

create table public.parties (
  world_id text not null, id text not null,
  name text, acronym text, number int, ideology jsonb, entry_culture text, reputation double precision, cash double precision,
  discipline double precision, color text, description text, gov_alignment double precision, president_id text,
  territory jsonb, seats jsonb, members double precision, integrity double precision, federation text, federation_name text,
  is_fictional boolean, status text,
  primary key (world_id, id)
);

create table public.factions (
  world_id text not null, id text not null,
  party_id text, name text, ideology jsonb, strength double precision, leader_id text,
  primary key (world_id, id)
);

create table public.memberships (
  world_id text not null, id text not null,
  person_id text, party_id text, role text, joined_on date, left_on date, status text,
  primary key (world_id, id)
);
create index memberships_person_idx on public.memberships (world_id, person_id);

create table public.affiliation_requests (
  world_id text not null, id text not null,
  person_id text, party_id text, kind text, created_on date, decide_on date, status text, breakdown jsonb, reason text,
  primary key (world_id, id)
);
create index affreq_person_idx on public.affiliation_requests (world_id, person_id);

create table public.relationships (
  world_id text not null, id text not null,
  a_id text, b_id text, score double precision, interactions int, last_on date,
  primary key (world_id, id)
);
create index relationships_a_idx on public.relationships (world_id, a_id);

create table public.elections (
  world_id text not null, id text not null,
  year int, kind text, first_round date, runoff date, calendar jsonb, status text, summary jsonb,
  primary key (world_id, id)
);

create table public.races (
  world_id text not null, id text not null,
  election_id text, office_code text, geo text, seats int, electorate double precision, status text, results jsonb, latest_poll jsonb,
  primary key (world_id, id)
);
create index races_election_idx on public.races (world_id, election_id);

create table public.candidacies (
  world_id text not null, id text not null,
  election_id text, race_id text, person_id text, party_id text, office_code text, geo text, status text, is_player boolean,
  ballot_number int, campaign jsonb, votes double precision, vote_share double precision, note text,
  primary key (world_id, id)
);
create index candidacies_election_idx on public.candidacies (world_id, election_id);
create index candidacies_person_idx on public.candidacies (world_id, person_id);

create table public.mandates (
  world_id text not null, id text not null,
  person_id text, office_code text, geo text, start_on date, end_on date, status text, election_id text, approval double precision,
  primary key (world_id, id)
);
create index mandates_status_idx on public.mandates (world_id, status);
create index mandates_person_idx on public.mandates (world_id, person_id);

create table public.bills (
  world_id text not null, id text not null,
  chamber text, title text, summary text, axis text, direction double precision, author_party_id text, author_person_id text,
  gov_position double precision, vote_on date, status text, votes jsonb, player_votes jsonb, fiscal_effect double precision,
  primary key (world_id, id)
);
create index bills_status_idx on public.bills (world_id, status);

create table public.policies (
  world_id text not null, id text not null,
  owner_person_id text, office_code text, geo text, kind text, title text, started_on date, completes_on date, status text,
  cost double precision, delays int, effects jsonb,
  primary key (world_id, id)
);

create table public.illicit_acts (
  world_id text not null, id text not null,
  person_id text, kind text, created_on date, amount double precision, value_relative double precision, participants int,
  witnesses int, paper_trail double precision, recurrence int, exposure double precision, accomplice_loyalty double precision,
  partners text[], party_id text, description text, discovered boolean, discovered_on date,
  primary key (world_id, id)
);
create index illicit_person_idx on public.illicit_acts (world_id, person_id);

create table public.investigations (
  world_id text not null, id text not null,
  person_id text, stage text, opened_on date, next_step_on date, evidence double precision, defense double precision,
  evidences jsonb, outcome text, authority text, opened_by text, act_ids text[],
  primary key (world_id, id)
);
create index investigations_person_idx on public.investigations (world_id, person_id);

create table public.rumors (
  world_id text not null, id text not null,
  target_id text, source_id text, topic text, created_on date, reach double precision, credibility double precision, bots int, status text,
  primary key (world_id, id)
);

create table public.debates (
  world_id text not null, id text not null,
  race_id text, outlet text, scheduled_on date, status text, participants text[], results jsonb, player_choices jsonb,
  primary key (world_id, id)
);

create table public.voter_segments (
  world_id text not null, id text not null,
  uf text, segment text, weight double precision, ideology jsonb, turnout double precision, econ_sensitivity double precision, mood double precision,
  primary key (world_id, id)
);

create table public.economy_snapshots (
  world_id text not null, id text not null,
  month text, gdp_growth double precision, gdp_level double precision, inflation_12m double precision, inflation_month double precision,
  unemployment double precision, selic double precision, debt_gdp double precision, primary_balance double precision,
  confidence double precision, fx double precision, external_demand double precision, fiscal_impulse double precision,
  output_gap double precision, productivity double precision, supply_shock double precision, expectations double precision,
  primary key (world_id, id)
);
create index economy_month_idx on public.economy_snapshots (world_id, month);

create table public.world_events (
  world_id text not null, id text not null,
  tick int, type text, game_date date, actors text[], geography text, payload jsonb, seed text,
  created_at timestamptz not null default now(),
  primary key (world_id, id)
);
create index world_events_type_idx on public.world_events (world_id, type, tick desc);
create index world_events_actors_idx on public.world_events using gin (actors);

create table public.news_articles (
  world_id text not null, id text not null,
  event_id text, tick int, game_date date, outlet text, category text, headline text, body text, geography text,
  person_ids text[], importance int, visibility text, user_id uuid, factual boolean, source_id text,
  created_at timestamptz not null default now(),
  primary key (world_id, id)
);
create index news_feed_idx on public.news_articles (world_id, tick desc);
create index news_user_idx on public.news_articles (user_id) where user_id is not null;
create index news_persons_idx on public.news_articles using gin (person_ids);

create table public.notifications (
  world_id text not null, id text not null,
  user_id uuid, person_id text, tick int, game_date date, title text, body text, link text, read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (world_id, id)
);
create index notifications_user_idx on public.notifications (user_id, read_at);

create table public.finance_transactions (
  world_id text not null, id text not null,
  person_id text, candidacy_id text, kind text, amount double precision, declared boolean, game_date date, description text,
  primary key (world_id, id)
);
create index finance_person_idx on public.finance_transactions (world_id, person_id);

create table public.polls (
  world_id text not null, id text not null,
  race_id text, institute text, game_date date, sample int, margin double precision, results jsonb, undecided double precision, private_for text,
  primary key (world_id, id)
);
create index polls_race_idx on public.polls (world_id, race_id, game_date desc);
