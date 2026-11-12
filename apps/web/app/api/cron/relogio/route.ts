import { NextResponse, type NextRequest } from "next/server";
import { advanceSharedWorlds } from "@/lib/sim";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Virada das rodadas dos mundos compartilhados (Vercel Cron, vercel.json, de 15 em 15 minutos; as
 * rodadas viram nas horas pares de Brasília): leva cada mundo até o fim da rodada que terminou,
 * mesmo sem ninguém jogando. Quem joga também puxa o mundo ao abrir as telas. Mundos sem rodada
 * para fechar nem são abertos.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? process.env.SIM_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ticks = await advanceSharedWorlds(240_000);
  return NextResponse.json({ ok: true, ticks });
}
