-- Fundo eleitoral dos partidos presididos por jogador: a cota do FEFC na
-- eleição e quanto a presidência já repassou a cada candidatura.
alter table public.parties add column if not exists campaign_fund jsonb;
