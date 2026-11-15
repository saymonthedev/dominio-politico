-- Limpeza da madrugada sem travar o jogo (plano Pro, 8 GB). Desde o plano grátis (500 MB), a tarefa
-- "compactar-banco" fazia VACUUM FULL em 14 tabelas toda madrugada para devolver espaço ao disco.
-- Isso travava cada tabela enquanto ela era reescrita (o erro "lock timeout" das 4h05) e apagava o
-- mapa de visibilidade, que deixa contagens e leituras por índice sem abrir cada linha (a contagem
-- de notícias do /admin levava 0,9 s e passou a 3 ms depois de uma limpeza comum). Agora a limpeza da
-- madrugada é a comum: não trava leituras nem gravações, deixa o espaço livre para reúso e mantém o
-- mapa em dia. O tamanho do banco fica estável, porque a poda apaga o antigo e o novo reusa o espaço.

select cron.unschedule('compactar-banco');

select cron.schedule(
  'limpar-banco',
  '5 7 * * *',
  $$vacuum (analyze) public.person_states, public.persons, public.mandates, public.investigations, public.news_articles, public.illicit_acts, public.memberships, public.world_events, public.races, public.candidacies, public.polls, public.finance_transactions, public.notifications, private.world_changes$$
);
