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
  id: "2026-11-20-entre-eleicoes",
  date: "20 de novembro de 2026",
  title: "Atualização lançada",
  lede: "Mais o que fazer entre uma eleição e outra, e a noite da eleição como um evento para todo o mundo compartilhado.",
  items: [
    { icon: "ballot", text: "Noite da eleição ao vivo: no mundo compartilhado, quando a rodada termina no dia da votação, o Painel mostra a hora em que a urna fecha e a contagem regressiva. Na virada, a apuração sai para todo mundo ao mesmo tempo." },
    { icon: "shield", text: "Conselho Tutelar: eleição sem partido, de 4 em 4 anos. A Carreira mostra quando abrem as inscrições (de abril a julho); cada ação na comunidade até a votação ajuda. Quem vence tem 4 anos de mandato, com remuneração." },
    { icon: "briefcase", text: "Cargo de confiança: quem é filiado e não tem mandato pode trabalhar como assessor(a) da bancada do partido na Câmara Municipal, na Assembleia ou na Câmara dos Deputados. Rende salário e espaço no partido." },
    { icon: "info", text: "Para disputar uma eleição, é preciso deixar o conselho e o cargo de confiança: a pré-candidatura faz isso sozinha." },
    { icon: "star", text: "Também chegaram as missões de início, o Criar rápido e o novo Convide amigos em Minha conta." },
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
