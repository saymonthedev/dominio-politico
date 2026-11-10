/**
 * Novidades mostradas uma vez para cada jogador quando entra no jogo depois de uma publicação.
 * Para anunciar uma nova versão, troque o `id` (e os itens): quem já viu a anterior vê de novo.
 */
export const RELEASE = {
  id: "2026-11-10-relogio",
  date: "10 de novembro de 2026",
  title: "Atualização lançada",
  lede: "Novo relógio nos mundos compartilhados: o tempo anda sozinho, no mesmo ritmo para todo mundo, e quem fica fora não perde a vez.",
  items: [
    { icon: "clock", text: "Nos mundos compartilhados o tempo agora anda sozinho: 7 dias de jogo a cada 2 horas, nas horas pares de Brasília (0h, 2h, 4h…). Ninguém avança na mão. O Painel mostra a hora do próximo avanço." },
    { icon: "zap", text: "Os acontecimentos continuam chegando a quem jogou nos últimos dias, e as decisões esperam a sua resposta: nada vence enquanto você está fora." },
    { icon: "user", text: "No mundo só seu (e no fictício) nada muda: você passa o tempo quando quiser, de 1 dia a 1 mês." },
    { icon: "phone", text: "Também saiu hoje: o Celular (menu Você), com mensagens entre jogadores, rede social, notícias e galeria. E ainda a aba Família, doações entre jogadores e o mural de apoiadores." },
    { icon: "heart", text: "Gosta do jogo? O botão Apoiar no topo continua lá, para contribuir com Pix se quiser. O jogo segue 100% grátis.", donation: true },
  ],
} as const;

export type Release = typeof RELEASE;
