/**
 * Preço da assinatura, sem dependências (serve no servidor, nas páginas públicas e no navegador).
 * Desde 14/11/2026: R$ 3,50 por 30 dias. De 13 a 14/11 era R$ 3; quem pagou mantém os dias que comprou
 * e paga o valor novo só no próximo pagamento (não há cobrança automática).
 */
export const PRICE = 3.5;
export const PERIOD_DAYS = 30;
/** "R$ 3,50" */
export const PRICE_LABEL = `R$ ${PRICE.toFixed(2).replace(".", ",")}`;
/** Teste grátis de conta nova (o banco usa o mesmo valor em trial_start, migração 0032). */
export const TRIAL_MINUTES = 60;
export const TRIAL_LABEL = "1 hora";

/** Plano anual (19/11/2026): R$ 29,90 por 365 dias, por Pix, também sem renovação automática. */
export const ANNUAL_PRICE = 29.9;
export const ANNUAL_DAYS = 365;
/** "R$ 29,90" */
export const ANNUAL_LABEL = `R$ ${ANNUAL_PRICE.toFixed(2).replace(".", ",")}`;

export type Plan = "MENSAL" | "ANUAL";
export const PLANS: Record<Plan, { price: number; days: number; label: string; name: string }> = {
  MENSAL: { price: PRICE, days: PERIOD_DAYS, label: PRICE_LABEL, name: "mensal" },
  ANUAL: { price: ANNUAL_PRICE, days: ANNUAL_DAYS, label: ANNUAL_LABEL, name: "anual" },
};
export const isPlan = (v: unknown): v is Plan => v === "MENSAL" || v === "ANUAL";
