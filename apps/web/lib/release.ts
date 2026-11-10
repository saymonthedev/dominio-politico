/**
 * Novidades mostradas uma vez para cada jogador quando entra no jogo depois de uma publicação.
 * Para anunciar uma nova versão, troque o `id` (e os itens): quem já viu a anterior vê de novo.
 */
export const RELEASE = {
  id: "2026-11-10",
  date: "10 de novembro de 2026",
  title: "Atualização lançada",
  lede: "O jogo ficou bem mais estável: chega de telas que travavam até dar erro 504.",
  items: [
    { icon: "bolt", text: "Os mundos abrem rápido mesmo quando um servidor acabou de ligar. Ele lê uma cópia guardada do mundo em vez de montar tudo no banco de dados, que era o que travava o jogo nos horários de pico." },
    { icon: "shield", text: "Se a cópia falhar, o jogo volta a ler do banco como antes. Nada do seu personagem muda." },
    { icon: "check", text: "Quem teve a criação do mundo próprio interrompida pela lentidão consegue terminá-la: a vaga já é sua, mesmo com as vagas esgotadas." },
    { icon: "lock", text: "Continua valendo: o login não cai mais sozinho quando a sessão se renova." },
    { icon: "heart", text: "Gosta do jogo? O botão Apoiar no topo continua lá, para contribuir com Pix se quiser. O jogo segue 100% grátis.", donation: true },
  ],
} as const;

export type Release = typeof RELEASE;
