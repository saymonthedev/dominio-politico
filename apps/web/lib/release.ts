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
  id: "2026-11-19-plenario",
  date: "19 de novembro de 2026",
  title: "Atualização lançada",
  lede: "Plenário com painel de votação, impeachment e secretariado para quem governa.",
  items: [
    { icon: "ballot", text: "Projeto aprovado na Câmara dos Deputados agora também passa pelo Senado antes de virar lei. Cada votação mostra o painel com sim, não, abstenções e ausentes e o voto de cada bancada, em Governo e Congresso." },
    { icon: "gavel", text: "Prefeito, governador ou presidente com o governo em frangalhos pode sofrer impeachment: a Câmara Municipal, a Assembleia ou a Câmara e o Senado votam, e são precisos 2/3. Vereadores e deputados votam no painel." },
    { icon: "users", text: "Quem governa monta o secretariado (ou os ministérios): nomeia, exonera, cria e extingue pastas, e pode dar espaço a partidos aliados." },
    { icon: "heart", text: "As novidades sugeridas pelos jogadores chegam com o aviso de Concluída, com o nome de quem sugeriu. Obrigado por apoiar o jogo!" },
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
