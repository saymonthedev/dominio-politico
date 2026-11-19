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
  id: "2026-11-19-genero",
  date: "19 de novembro de 2026",
  title: "Atualização lançada",
  lede: "O jogo agora fala do seu personagem do jeito certo, e o calendário eleitoral voltou a andar completo em todos os mundos.",
  items: [
    { icon: "user", text: "Diga se o seu personagem é mulher ou homem (ou prefira não dizer) ao criar o personagem, ou em Carreira, no botão de editar o visual. Para as personagens mulheres, o jogo escreve eleita, vereadora, deputada e cidadã." },
    { icon: "calendar", text: "Em alguns mundos, dias do calendário eleitoral eram pulados na janela de troca de partido (como a pesquisa de março). Corrigido." },
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
