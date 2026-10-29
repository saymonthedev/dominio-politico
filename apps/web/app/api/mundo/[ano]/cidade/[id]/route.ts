import { NextResponse } from "next/server";
import { getSession, myWorldId } from "@/lib/game";
import { cityDetail } from "@/lib/city-view";
import { cachedState, isStartYear, worldExists } from "@/lib/sim";

export const dynamic = "force-dynamic";

/** Detalhes de uma cidade no mundo (painel do mapa). */
export async function GET(_req: Request, { params }: { params: Promise<{ ano: string; id: string }> }) {
  const { ano, id } = await params;
  const year = Number(ano);
  const { user } = await getSession();
  if (!user) return NextResponse.json({ error: "Entre para ver o mapa." }, { status: 401 });
  const worldId = isStartYear(year) ? await myWorldId(year) : "";
  if (!worldId || !/^\d{7}$/.test(id) || !(await worldExists(worldId))) return NextResponse.json({ error: "Cidade não encontrada." }, { status: 404 });
  const state = await cachedState(worldId);
  const detail = cityDetail(state, year, id);
  if (!detail) return NextResponse.json({ error: "Cidade não encontrada." }, { status: 404 });
  return NextResponse.json(detail, { headers: { "Cache-Control": "private, max-age=20" } });
}
