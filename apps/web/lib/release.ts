/**
 * Novidades mostradas uma vez para cada jogador quando entra no jogo depois de uma publicação.
 * Para anunciar uma nova versão, troque o `id` (e os itens): quem já viu a anterior vê de novo.
 */
export interface Release {
  id: string;
  date: string;
  title: string;
  lede: string;
  items: ReadonlyArray<{ icon: string; text: string }>;
}

/** Com a assinatura ligada (chave do Mercado Pago na Vercel). */
export const RELEASE: Release = {
  id: "2026-11-13-assinatura",
  date: "13 de novembro de 2026",
  title: "Atualização lançada",
  lede: "O Domínio Político agora é por assinatura: R$ 3 por mês, por Pix. Obrigado por apoiar o jogo!",
  items: [
    { icon: "heart", text: "É a assinatura que mantém os servidores no ar e o jogo crescendo. Cada Pix vale 30 dias de jogo, e o acesso libera sozinho assim que o pagamento cai." },
    { icon: "clock", text: "Sem renovação automática: perto de vencer, o jogo avisa no topo, e é só pagar outro Pix. Os 30 dias somam ao que ainda falta." },
    { icon: "user", text: "Seus personagens e mundos ficam guardados, mesmo se a assinatura vencer." },
    { icon: "flag", text: "Também nesta semana: mundos compartilhados em rodadas de 2 horas, com cada jogador vivendo os próprios dias no Painel." },
  ],
};

/** Enquanto a assinatura não liga: as novidades das rodadas (quem já viu não vê de novo). */
export const RELEASE_BEFORE_PAYWALL: Release = {
  id: "2026-11-12-rodadas",
  date: "12 de novembro de 2026",
  title: "Atualização lançada",
  lede: "Mundos compartilhados em rodadas de 2 horas: o tempo real é o mesmo para todos, mas cada um vive os próprios dias.",
  items: [
    { icon: "clock", text: "Cada rodada dura 2 horas e vira nas horas pares de Brasília. Nela você vive os seus dias no seu ritmo, no Painel: até 2 meses de jogo de dia, 1 semana nas rodadas da madrugada (0h, 2h e 4h)." },
    { icon: "zap", text: "Quando as 2 horas acabam, o mundo anda para todos até o fim da rodada. Quem não viveu os dias fica sem eles: se você só jogou janeiro, fevereiro passa sem você." },
    { icon: "calendar", text: "Perto de um marco do calendário eleitoral (prazo de filiação, convenções, campanha, turnos) a rodada para na véspera, e na campanha cada rodada tem até 15 dias." },
    { icon: "user", text: "No mundo só seu (e no fictício) nada muda: você passa o tempo quando quiser, de 1 dia a 1 mês." },
  ],
};
