/**
 * Novidades mostradas uma vez para cada jogador quando entra no jogo depois de uma publicação.
 * Para anunciar uma nova versão, troque o `id` (e os itens): quem já viu a anterior vê de novo.
 */
export const RELEASE = {
  id: "2026-11-06",
  date: "6 de novembro de 2026",
  title: "Atualização lançada",
  lede: "O jogo voltou com servidores novos e mais fortes. Esta versão é quase toda sobre deixar tudo mais rápido e estável.",
  items: [
    { icon: "zap", text: "Servidores novos e mais fortes: bem menos quedas e menos telas de \"solicitação expirou\"." },
    { icon: "database", text: "Banco de dados mais enxuto (40% menor): os mundos carregam mais rápido e o login não trava mais." },
    { icon: "ballot", text: "Campanhas e debates não travam mais quando um candidato desiste ou deixa a vida pública." },
    {
      icon: "globe",
      text: "Mundos próprios abandonados liberam vaga: com menos de 30 dias de jogo e parados há 10 dias, são apagados, sempre com aviso por e-mail antes.",
    },
    { icon: "calendar", text: "Ao criar personagem, a tela mostra em que data cada mundo compartilhado já está. Para começar do início do ano escolhido, use um mundo só seu." },
    { icon: "heart", text: "Gosta do jogo? Agora tem um botão Apoiar no topo, para contribuir com Pix se quiser. O jogo continua 100% grátis.", donation: true },
  ],
} as const;

export type Release = typeof RELEASE;
