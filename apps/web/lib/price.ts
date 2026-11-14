/**
 * Preço da assinatura, sem dependências (serve no servidor, nas páginas públicas e no navegador).
 * Desde 14/11/2026: R$ 3,50 por 30 dias. De 13 a 14/11 era R$ 3; quem pagou mantém os dias que comprou
 * e paga o valor novo só no próximo pagamento (não há cobrança automática).
 */
export const PRICE = 3.5;
export const PERIOD_DAYS = 30;
/** "R$ 3,50" */
export const PRICE_LABEL = `R$ ${PRICE.toFixed(2).replace(".", ",")}`;
