import { NextResponse, type NextRequest } from "next/server";
import { START_YEARS } from "@dp/engine";
import { advanceWorld, worldExists, worldIdFor } from "@/lib/sim";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Relógio do mundo: Vercel Cron uma vez por dia (vercel.json), para o mundo não ficar para trás sem jogadores. */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? process.env.SIM_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const out: Record<string, number | string> = {};
  for (const y of START_YEARS) {
    try {
      if (!(await worldExists(worldIdFor(y)))) continue;
      // tarefa diária: vai processando em blocos até alcançar o relógio ou acabar o tempo
      const started = Date.now();
      let total = 0;
      for (;;) {
        const t = await advanceWorld(y, 45);
        total += t;
        if (t < 45 || Date.now() - started > 40_000) break;
      }
      out[y] = total;
    } catch (e) {
      out[y] = e instanceof Error ? e.message : "erro";
    }
  }
  return NextResponse.json({ ok: true, ticks: out });
}
