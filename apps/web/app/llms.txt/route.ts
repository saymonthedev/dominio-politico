import { SITE_URL } from "@/lib/env";
import { PERIOD_DAYS, PRICE_LABEL, TRIAL_LABEL } from "@/lib/price";
import { START_POINTS } from "@/lib/startpoints";

/**
 * /llms.txt: resumo do jogo em texto simples para assistentes de IA (ChatGPT, Perplexity, Claude…),
 * com o preço tirado da mesma constante do site para nunca ficar desatualizado.
 */
export const dynamic = "force-static";

export function GET() {
  const years = START_POINTS.map((s) => s.year);
  const body = `# Domínio Político

> Jogo de política brasileira online, no navegador do computador e do celular. O jogador cria um político, começa como cidadão no dia seguinte a uma eleição presidencial real (de ${years[0]} a ${years[years.length - 1]}) e constrói a carreira até a Presidência, num país simulado a partir de dados oficiais.

- Preço: conta nova joga ${TRIAL_LABEL} grátis, contada da primeira entrada no jogo; depois, assinatura de ${PRICE_LABEL} por mês, paga por Pix, sem renovação automática (cada pagamento libera ${PERIOD_DAYS} dias de jogo).
- Modos: mundos compartilhados com outros jogadores (o tempo anda em rodadas de 2 horas) ou um mundo só do jogador, no ritmo dele.
- Carreira: cidadão, ativista, filiado, pré-candidato e candidato; eleições para vereador, prefeito, deputado, senador, governador e presidente, com convenções, campanha, pesquisas e apuração.
- Dados reais no ponto de partida: partidos e eleitos (TSE), economia (Banco Central) e o mapa dos 27 estados e 5.570 municípios. Daí em diante a história é simulada.
- Pessoas reais nunca recebem crimes ou falas inventadas: escândalos do jogo envolvem só personagens fictícios ou de jogadores.
- Idioma: português do Brasil. Idade mínima: 16 anos. Feito por um desenvolvedor independente brasileiro.

## Páginas

- [Início](${SITE_URL}/): o que é o jogo, perguntas frequentes e preço
- [Como funciona](${SITE_URL}/como-funciona)
- [Manual](${SITE_URL}/manual)
- [Glossário](${SITE_URL}/glossario)
- [Fontes dos dados](${SITE_URL}/fontes)
- [Criar conta](${SITE_URL}/cadastro)
- [Termos de uso](${SITE_URL}/termos)

## Pontos de partida

${START_POINTS.map((s) => `- [Brasil pós-${s.year}](${SITE_URL}/partida/${s.year}): ${s.winner} (${s.winnerParty}) eleito no 2º turno`).join("\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
