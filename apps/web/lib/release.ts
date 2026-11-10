/**
 * Novidades mostradas uma vez para cada jogador quando entra no jogo depois de uma publicação.
 * Para anunciar uma nova versão, troque o `id` (e os itens): quem já viu a anterior vê de novo.
 */
export const RELEASE = {
  id: "2026-11-10-familia",
  date: "10 de novembro de 2026",
  title: "Atualização lançada",
  lede: "Mais sugestões de vocês no jogo: família, doações entre jogadores e o mural de apoiadores.",
  items: [
    { icon: "users", text: "Nova aba Família: pais, cônjuge e filhos, com a proximidade de cada um. Programa a dois, passeio com os filhos, visita aos pais, casar e ter filhos. A ausência pesa: no limite, o casamento acaba." },
    { icon: "coins", text: "Em período eleitoral, dá para doar para a campanha de outro jogador (em Carreira), dentro do limite da lei: até 10% da sua renda do ano." },
    { icon: "heart", text: "Mural de apoiadores: quem doou aparece na tela de Campanha de quem recebeu e no Ranking do mundo." },
    { icon: "user", text: "Também saiu hoje: monte o visual do seu personagem em Carreira, e veja as ilustrações de casas, carros e motos em Bens." },
    { icon: "heart", text: "Gosta do jogo? O botão Apoiar no topo continua lá, para contribuir com Pix se quiser. O jogo segue 100% grátis.", donation: true },
  ],
} as const;

export type Release = typeof RELEASE;
