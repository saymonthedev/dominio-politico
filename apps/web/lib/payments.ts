import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { simSecret, SITE_URL, SUPABASE_KEY, SUPABASE_URL } from "./env";

/**
 * Assinatura mensal: R$ 3 por 30 dias de jogo, por Pix pelo Mercado Pago. Só no servidor.
 *
 * A cobrança só liga com a chave do Mercado Pago na Vercel (MP_ACCESS_TOKEN): sem ela o jogo segue
 * aberto, para ninguém ficar trancado sem ter como pagar. PAYWALL=off desliga mesmo com a chave.
 * Quem libera o acesso é sempre a conferência do pagamento na API do Mercado Pago (com a nossa
 * chave): o aviso automático só diz "olhe este pagamento", então um aviso falso não libera nada.
 */

export const PRICE = 3;
export const PERIOD_DAYS = 30;
/** O Pix gerado vale por 1 hora (o Mercado Pago pede pelo menos 30 minutos). */
const PIX_MINUTES = 60;
const API = "https://api.mercadopago.com";

export const paywallOn = (): boolean => !!process.env.MP_ACCESS_TOKEN && process.env.PAYWALL !== "off";

/** Contas que jogam sem pagar (as do painel de administração). */
export const isExempt = (userId: string): boolean =>
  (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(userId);

export interface PixCharge {
  id: string;
  /** Pix copia e cola */
  code: string;
  /** QR Code em PNG (base64) */
  qr: string;
  expiresAt: string;
}

interface MpPayment {
  id: number;
  status: string;
  transaction_amount: number;
  currency_id: string;
  external_reference: string | null;
  date_of_expiration?: string | null;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
}

async function mp<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok || !body) throw new Error(`Mercado Pago ${res.status}: ${body?.message ?? "sem resposta"}`);
  return body;
}

/** Data no formato que o Mercado Pago pede, no horário de Brasília (2026-11-13T15:04:05.000-03:00). */
function mpDate(ms: number): string {
  return `${new Date(ms - 3 * 3_600_000).toISOString().slice(0, 23)}-03:00`;
}

/** Gera um Pix de R$ 3 para a conta (o id da conta vai junto, para a conferência saber de quem é). */
export async function createPix(user: { id: string; email: string }): Promise<PixCharge> {
  const expires = Date.now() + PIX_MINUTES * 60_000;
  const p = await mp<MpPayment>("/v1/payments", {
    method: "POST",
    headers: { "X-Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      transaction_amount: PRICE,
      description: `Domínio Político: assinatura de ${PERIOD_DAYS} dias`,
      payment_method_id: "pix",
      payer: { email: user.email },
      external_reference: user.id,
      notification_url: `${SITE_URL}/api/pagamento/aviso`,
      date_of_expiration: mpDate(expires),
    }),
  });
  const data = p.point_of_interaction?.transaction_data;
  if (!data?.qr_code || !data.qr_code_base64) throw new Error(`Mercado Pago: Pix ${p.id} sem QR Code (${p.status})`);
  return { id: String(p.id), code: data.qr_code, qr: data.qr_code_base64, expiresAt: p.date_of_expiration ?? new Date(expires).toISOString() };
}

export interface PaymentCheck {
  status: string;
  /** até quando a assinatura da conta vale depois desta conferência */
  paidUntil: string | null;
}

/**
 * Confere um pagamento no Mercado Pago e registra (idempotente): aprovado soma 30 dias à conta dele;
 * devolvido ou contestado tira. `userId`: a tela só pode conferir pagamentos da própria conta.
 */
export async function syncPayment(id: string, userId?: string): Promise<PaymentCheck> {
  if (!/^\d{1,20}$/.test(id)) throw new Error("Pagamento inválido.");
  const p = await mp<MpPayment>(`/v1/payments/${id}`);
  const owner = p.external_reference ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(owner)) return { status: "unknown", paidUntil: null };
  if (userId && owner !== userId) throw new Error("Este pagamento é de outra conta.");
  // esperando o Pix: nada a gravar ainda (a tela confere de poucos em poucos segundos)
  if (p.status === "pending" || p.status === "in_process") return { status: p.status, paidUntil: null };
  // valor ou moeda diferentes (não deveria acontecer): registra, mas não libera
  const ok = p.currency_id === "BRL" && p.transaction_amount >= PRICE;
  const status = ok ? p.status : `invalid:${p.status}`;
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("pay_register", { p_secret: simSecret(), p_payment: String(p.id), p_user: owner, p_amount: p.transaction_amount, p_status: status });
  if (error) throw new Error(`pay_register: ${error.message}`);
  return { status: p.status, paidUntil: (data as string | null) ?? null };
}

/**
 * Assinatura do aviso do Mercado Pago (x-signature: "ts=...,v1=..."), com a chave secreta dos
 * webhooks (MP_WEBHOOK_SECRET). Sem a chave ou sem a assinatura, vale a conferência na API.
 */
export function validNotice(headers: Headers, dataId: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  const sig = headers.get("x-signature");
  if (!secret || !sig) return true;
  const parts = Object.fromEntries(sig.split(",").map((kv) => kv.trim().split("=", 2) as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${headers.get("x-request-id") ?? ""};ts:${parts.ts};`;
  const want = createHmac("sha256", secret).update(manifest).digest();
  const got = Buffer.from(parts.v1, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}
