-- Conquistas da carreira dos jogadores: id da conquista → data de jogo em que aconteceu.
alter table public.person_states add column if not exists achievements jsonb not null default '{}'::jsonb;
