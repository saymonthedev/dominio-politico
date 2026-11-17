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
  id: "2026-11-17-condenacoes",
  date: "17 de novembro de 2026",
  title: "Atualização lançada",
  lede: "O mundo ficou menos corrupto: os personagens do jogo cometem menos crimes e se defendem na Justiça.",
  items: [
    { icon: "check", text: "Os personagens do jogo eram condenados demais: até 1 em cada 5 parlamentares por ano, e em 4 anos a bancada de um estado perdia mais da metade dos deputados. Agora são cerca de 3% por ano, e ainda há escândalos e operações da polícia." },
    { icon: "gavel", text: "Personagem que vira réu contrata advogado conforme o dinheiro que tem, como você já podia fazer. O risco das suas próprias escolhas não mudou." },
    { icon: "heart", text: "As novidades sugeridas pelos jogadores chegam com o aviso de Concluída, com o nome de quem sugeriu. Obrigado por apoiar o jogo!" },
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
