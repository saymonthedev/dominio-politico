/**
 * Novidades mostradas uma vez para cada jogador quando entra no jogo depois de uma publicação.
 * Para anunciar uma nova versão, troque o `id` (e os itens): quem já viu a anterior vê de novo.
 */
export const RELEASE = {
  id: "2026-11-10-ritmo",
  date: "10 de novembro de 2026",
  title: "Atualização lançada",
  lede: "Novo ritmo nos mundos compartilhados: o tempo anda sozinho, igual para todos, mais rápido de dia e devagar de madrugada.",
  items: [
    { icon: "clock", text: "De dia, 2 meses de jogo a cada 2 horas (1 dia a cada 2 minutos). Da 0h às 7h de Brasília, enquanto quase todo mundo dorme, 1 semana a cada 2 horas. Ninguém avança na mão, e o Painel mostra o ritmo de agora." },
    { icon: "zap", text: "Os acontecimentos continuam chegando a quem jogou nos últimos dias, e as decisões esperam a sua resposta: nada vence enquanto você está fora." },
    { icon: "user", text: "No mundo só seu (e no fictício) nada muda: você passa o tempo quando quiser, de 1 dia a 1 mês." },
    { icon: "phone", text: "Também saiu hoje: o Celular (menu Você), com mensagens entre jogadores, rede social, notícias e galeria. E ainda a aba Família, doações entre jogadores e o mural de apoiadores." },
    { icon: "heart", text: "Gosta do jogo? O botão Apoiar no topo continua lá, para contribuir com Pix se quiser. O jogo segue 100% grátis.", donation: true },
  ],
} as const;

export type Release = typeof RELEASE;
