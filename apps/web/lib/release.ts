/**
 * Novidades mostradas uma vez para cada jogador quando entra no jogo depois de uma publicação.
 * Para anunciar uma nova versão, troque o `id` (e os itens): quem já viu a anterior vê de novo.
 */
export const RELEASE = {
  id: "2026-11-07-tarde",
  date: "7 de novembro de 2026",
  title: "Atualização lançada",
  lede: "Corrigimos a lentidão de hoje: as telas voltaram a abrir rápido e o login não cai mais sozinho.",
  items: [
    { icon: "bolt", text: "As telas do jogo voltaram a abrir rápido. Uma consulta lenta da atualização da madrugada sobrecarregava o banco nos horários de pico e algumas telas davam erro de tempo esgotado." },
    { icon: "lock", text: "Quem joga com várias abas, ou volta depois de um tempo parado, não é mais mandado para a tela de entrar quando o login se renova." },
    { icon: "check", text: "Continua valendo a correção de hoje cedo: personagem novo no mundo compartilhado entra direto no mundo novo, sem voltar para o balanço da carreira antiga." },
    { icon: "heart", text: "Gosta do jogo? O botão Apoiar no topo continua lá, para contribuir com Pix se quiser. O jogo segue 100% grátis.", donation: true },
  ],
} as const;

export type Release = typeof RELEASE;
