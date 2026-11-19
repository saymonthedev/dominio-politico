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
  id: "2026-11-19-convite",
  date: "19 de novembro de 2026",
  title: "Atualização lançada",
  lede: "Chame os amigos e ganhe dias de jogo, mostre a sua carreira nas redes e assine por um ano com desconto.",
  items: [
    { icon: "gift", text: "Convide amigos: em Minha conta estão o seu link (é só tocar em Copiar), o botão do WhatsApp e o cartão pronto para o story. A cada amigo que criar a conta pelo link e assinar, você ganha 7 dias de jogo." },
    { icon: "share", text: "Compartilhe a sua carreira: na Carreira (e no Governo, quem tem mandato), o botão Compartilhar faz um cartão do seu personagem para o story e o WhatsApp, já com o seu link de convite." },
    { icon: "coins", text: "Plano anual: 365 dias de jogo por R$ 29,90, por Pix, sem renovação automática. O mensal continua igual." },
    { icon: "flag", text: "Missões da semana no Painel: três metas por semana do jogo, com energia e capital político na hora; cumprindo as três, +1 de reputação." },
    { icon: "star", text: "Missões de início no Painel: os primeiros passos agora rendem energia e capital político e levam até a sua primeira pré-candidatura." },
    { icon: "zap", text: "Criar rápido: personagem novo em um toque, com nome sugerido; é só escolher o estado. O formulário completo continua lá." },
    { icon: "heart", text: "Obrigado por jogar e por espalhar o Domínio Político!" },
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
