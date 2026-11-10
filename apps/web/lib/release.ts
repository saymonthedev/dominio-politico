/**
 * Novidades mostradas uma vez para cada jogador quando entra no jogo depois de uma publicação.
 * Para anunciar uma nova versão, troque o `id` (e os itens): quem já viu a anterior vê de novo.
 */
export const RELEASE = {
  id: "2026-11-10-visual",
  date: "10 de novembro de 2026",
  title: "Atualização lançada",
  lede: "Sugestões de vocês: seu personagem com cara própria, bens com imagem e opções mais claras. E o jogo está bem mais estável.",
  items: [
    { icon: "user", text: "Monte o visual do seu personagem em Carreira, no botão Editar visual: pele, cabelo, barba, óculos, roupa e fundo. Ele aparece no menu, no ranking e no seu perfil para os outros jogadores." },
    { icon: "home", text: "Casas, carros e motos ganharam ilustração na tela de Bens, da quitinete à mansão e da moto ao SUV de luxo." },
    { icon: "check", text: "Voluntariado, artigos, propostas e projetos de lei agora mostram o que cada lado defende (por exemplo, \"Proteção do meio ambiente\"), no lugar de \"primeiro extremo\" e \"segundo extremo\"." },
    { icon: "bolt", text: "Chega de telas que travavam até dar erro 504: os servidores novos leem uma cópia do mundo em vez de montar tudo no banco de dados." },
    { icon: "heart", text: "Gosta do jogo? O botão Apoiar no topo continua lá, para contribuir com Pix se quiser. O jogo segue 100% grátis.", donation: true },
  ],
} as const;

export type Release = typeof RELEASE;
