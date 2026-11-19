-- Gênero do personagem (sugestão da jogadora Emyle Victorya, 18/11): quem joga escolhe ser mulher ou
-- homem (ou não dizer) e o jogo passa a escrever "eleita", "vereadora", "cidadã". Personagens fictícios
-- seguem o primeiro nome; pessoas reais ficam sem (o jogo não deduz nada sobre elas).
--
-- Coluna nova sem valor padrão: só muda o catálogo, sem reescrever a tabela. A regra vale para as
-- linhas novas e alteradas (not valid: não varre as linhas que já existem, todas nulas).
set local lock_timeout = '5s';
alter table public.persons add column if not exists gender text;
alter table public.persons drop constraint if exists persons_gender_check;
alter table public.persons add constraint persons_gender_check check (gender in ('F', 'M')) not valid;
