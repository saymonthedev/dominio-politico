import { NextResponse, type NextRequest } from "next/server";
import { advanceSharedWorlds } from "@/lib/sim";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Relógio dos mundos compartilhados (Vercel Cron, vercel.json, de 15 em 15 minutos): leva cada
 * mundo até a hora do relógio, mesmo sem ninguém jogando. Quem joga também puxa o mundo até o
 * relógio ao abrir as telas; aqui é só a garantia.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? process.env.SIM_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ticks = await advanceSharedWorlds(40_000);
  return NextResponse.json({ ok: true, ticks });
}
