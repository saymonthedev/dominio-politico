import { NextResponse, type NextRequest } from "next/server";
import { paywallOn, syncPayment, validNotice } from "@/lib/payments";
import { reportError } from "@/lib/report-error";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Aviso automático do Mercado Pago (notification_url de cada Pix e/ou webhook do painel): confere o
 * pagamento na API e libera os 30 dias. O aviso só aponta o pagamento; quem decide é a conferência.
 * Erro aqui devolve 500 para o Mercado Pago tentar de novo.
 */
export async function POST(request: NextRequest) {
  if (!paywallOn()) return NextResponse.json({ ok: true });
  const url = request.nextUrl;
  const body = (await request.json().catch(() => null)) as { type?: string; topic?: string; data?: { id?: string | number } } | null;
  const type = body?.type ?? body?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const urlId = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "";
  const id = String(body?.data?.id ?? urlId);
  if (type !== "payment" || !/^\d{1,20}$/.test(id)) return NextResponse.json({ ok: true });
  if (!validNotice(request.headers, urlId || id)) return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  try {
    await syncPayment(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // pagamento que não existe para a nossa chave (o "Simular notificação" do painel usa um id de
    // mentira): nada a fazer, e responder erro faria o Mercado Pago tentar de novo por dias
    if (e instanceof Error && /Mercado Pago 404/.test(e.message)) return NextResponse.json({ ok: true, ignored: true });
    await reportError("pagamento", `aviso ${id}`, e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
