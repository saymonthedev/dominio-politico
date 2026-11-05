/**
 * Novidades mostradas uma vez para cada jogador quando entra no jogo depois de uma publicação.
 * Para anunciar uma nova versão, troque o `id` (e os itens): quem já viu a anterior vê de novo.
 */
export const RELEASE = {
  id: "2026-11-05",
  date: "5 de novembro de 2026",
  title: "Atualização lançada",
  lede: "O jogo cresceu rápido e os servidores sentiram. Esta versão é quase toda sobre deixar tudo mais leve e estável.",
  items: [
    { icon: "zap", text: "Mais rápido e estável: os mundos carregam menos vezes do zero e o login não trava mais as páginas." },
    { icon: "ballot", text: "Campanhas e debates não travam mais quando um candidato desiste ou deixa a vida pública." },
    {
      icon: "globe",
      text: "Mundos próprios abandonados liberam vaga: com menos de 30 dias de jogo e parados há 10 dias, são apagados (sempre com aviso por e-mail antes).",
    },
    { icon: "newspaper", text: "Arquivo de notícias mais leve: fica o último ano de jogo e tudo o que cita você." },
    { icon: "heart", text: "Agora dá para apoiar o jogo com Pix, se você quiser. O jogo continua 100% grátis.", donation: true },
  ],
} as const;

export type Release = typeof RELEASE;
