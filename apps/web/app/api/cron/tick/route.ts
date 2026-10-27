import { NextResponse, type NextRequest } from "next/server";
import { START_YEARS } from "@dp/engine";
import { advanceWorld, worldExists } from "@/lib/sim";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Relógio do mundo: chamado pelo pg_cron (Supabase) ou Vercel Cron. */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? process.env.SIM_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const out: Record<string, number | string> = {};
  for (const y of START_YEARS) {
    try {
      if (!(await worldExists(y))) continue;
      out[y] = await advanceWorld(y, 30);
    } catch (e) {
      out[y] = e instanceof Error ? e.message : "erro";
    }
  }
  return NextResponse.json({ ok: true, ticks: out });
}
