/**
 * Novidades mostradas uma vez para cada jogador quando entra no jogo depois de uma publicação.
 * Para anunciar uma nova versão, troque o `id` (e os itens): quem já viu a anterior vê de novo.
 */
export const RELEASE = {
  id: "2026-11-12-rodadas",
  date: "12 de novembro de 2026",
  title: "Atualização lançada",
  lede: "Mundos compartilhados em rodadas de 2 horas: o tempo real é o mesmo para todos, mas cada um vive os próprios dias.",
  items: [
    { icon: "clock", text: "Cada rodada dura 2 horas e vira nas horas pares de Brasília. Nela você vive os seus dias no seu ritmo, no Painel: até 2 meses de jogo de dia, 1 semana nas rodadas da madrugada (0h, 2h e 4h)." },
    { icon: "zap", text: "Quando as 2 horas acabam, o mundo anda para todos até o fim da rodada. Quem não viveu os dias fica sem eles: se você só jogou janeiro, fevereiro passa sem você." },
    { icon: "calendar", text: "Perto de um marco do calendário eleitoral (prazo de filiação, convenções, campanha, turnos) a rodada para na véspera, e na campanha cada rodada tem até 15 dias." },
    { icon: "user", text: "No mundo só seu (e no fictício) nada muda: você passa o tempo quando quiser, de 1 dia a 1 mês." },
    { icon: "heart", text: "Gosta do jogo? O botão Apoiar no topo continua lá, para contribuir com Pix se quiser. O jogo segue 100% grátis.", donation: true },
  ],
} as const;

export type Release = typeof RELEASE;
