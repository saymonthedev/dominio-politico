/**
 * Novidades mostradas uma vez para cada jogador quando entra no jogo depois de uma publicação.
 * Para anunciar uma nova versão, troque o `id` (e os itens): quem já viu a anterior vê de novo.
 */
export const RELEASE = {
  id: "2026-11-07",
  date: "7 de novembro de 2026",
  title: "Atualização lançada",
  lede: "Correções pedidas por vocês e um banco de dados mais leve para o jogo seguir rápido.",
  items: [
    { icon: "check", text: "Quem encerrou a carreira num mundo só seu e começou outro personagem no compartilhado agora entra no personagem novo, sem voltar para o balanço antigo." },
    { icon: "calendar", text: "Ao criar personagem, a tela mostra em que data cada mundo compartilhado já está. Para começar do início do ano escolhido, use um mundo só seu." },
    { icon: "info", text: "Quem já tem um mundo só seu vê o motivo certo quando não dá para criar outro, com o caminho para apagar o atual em Minha conta." },
    { icon: "database", text: "O histórico antigo de personagens fictícios que já saíram de cena é apagado sozinho, e o banco é compactado toda madrugada." },
    { icon: "heart", text: "Gosta do jogo? O botão Apoiar no topo continua lá, para contribuir com Pix se quiser. O jogo segue 100% grátis.", donation: true },
  ],
} as const;

export type Release = typeof RELEASE;
