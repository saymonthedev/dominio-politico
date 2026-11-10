/**
 * Novidades mostradas uma vez para cada jogador quando entra no jogo depois de uma publicação.
 * Para anunciar uma nova versão, troque o `id` (e os itens): quem já viu a anterior vê de novo.
 */
export const RELEASE = {
  id: "2026-11-10-celular",
  date: "10 de novembro de 2026",
  title: "Atualização lançada",
  lede: "O jogo ganhou um celular: converse com os outros jogadores, poste na rede social e acompanhe as notícias do dia.",
  items: [
    { icon: "phone", text: "Novo Celular (menu Você): Mensagens com o canal de todos os jogadores do mundo, o canal do seu partido e conversas particulares. Ainda tem Rede social (um post por dia), Notícias e a Galeria das suas conquistas." },
    { icon: "shield", text: "Respeito acima de tudo: dá para silenciar qualquer jogador, mensagem denunciada por dois jogadores some e links não passam." },
    { icon: "users", text: "Também saiu hoje: aba Família, doações para a campanha de outro jogador (até 10% da sua renda do ano) e o mural de apoiadores." },
    { icon: "user", text: "E ainda: monte o visual do seu personagem em Carreira e veja as ilustrações de casas, carros e motos em Bens." },
    { icon: "heart", text: "Gosta do jogo? O botão Apoiar no topo continua lá, para contribuir com Pix se quiser. O jogo segue 100% grátis.", donation: true },
  ],
} as const;

export type Release = typeof RELEASE;
