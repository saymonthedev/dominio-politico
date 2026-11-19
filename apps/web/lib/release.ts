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
  id: "2026-11-19-estabilidade",
  date: "19 de novembro de 2026",
  title: "Atualização lançada",
  lede: "Pedimos desculpas pela lentidão e pelas quedas de ontem e de hoje cedo. Achamos a causa e mudamos o jeito de carregar o mundo.",
  items: [
    { icon: "zap", text: "Cada servidor novo lia o mundo inteiro do banco de dados, e no pico de jogadores o banco engasgou: as telas travavam no Continuar e o login demorava. Agora o mundo vem de uma cópia guardada fora do banco, só o que mudou é lido, e só um servidor por vez monta cada mundo." },
    { icon: "lock", text: "Conferir o seu login não depende mais de esperar o servidor de login a cada acesso." },
    { icon: "check", text: "Nenhuma decisão que segura o tempo fica mais sem saída: sem energia ou dinheiro para as opções, a opção padrão fica liberada. Na largada da campanha, a coordenação sai do caixa da campanha e há uma largada sem custo." },
    { icon: "calendar", text: "Em alguns mundos, dias do calendário eleitoral eram pulados na janela de troca de partido (como a pesquisa de março). Corrigido." },
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
