"use server";
import { getSession } from "@/lib/game";
import { createPix, paywallOn, syncPayment, type PaymentCheck, type PixCharge } from "@/lib/payments";
import { isPlan, type Plan } from "@/lib/price";
import { reportError } from "@/lib/report-error";

/** Gera o Pix da assinatura (mensal ou anual) para a conta que está jogando. */
export async function startPix(plan: Plan = "MENSAL"): Promise<{ ok: true; charge: PixCharge } | { ok: false; message: string }> {
  const { user } = await getSession();
  if (!user?.email) return { ok: false, message: "Entre na sua conta para assinar." };
  if (!paywallOn()) return { ok: false, message: "As assinaturas ainda não abriram." };
  try {
    if (!isPlan(plan)) return { ok: false, message: "Escolha o plano." };
    return { ok: true, charge: await createPix({ id: user.id, email: user.email }, plan) };
  } catch (e) {
    await reportError("pagamento", "gerar pix", e);
    return { ok: false, message: "Não deu para gerar o Pix agora. Tente de novo em instantes." };
  }
}

/** Confere o Pix (a tela pergunta de poucos em poucos segundos): pago, libera os dias do plano na hora. */
export async function checkPix(id: string): Promise<PaymentCheck> {
  const { user } = await getSession();
  if (!user) return { status: "error", paidUntil: null };
  try {
    return await syncPayment(id, user.id);
  } catch (e) {
    await reportError("pagamento", `conferir ${id}`, e);
    return { status: "error", paidUntil: null };
  }
}
