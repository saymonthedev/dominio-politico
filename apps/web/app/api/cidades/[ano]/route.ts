import { NextResponse } from "next/server";
import { citiesFor, isStartYear } from "@/lib/sim";

/** Cidades reais de uma UF no ponto de partida (para escolher a cidade-base). */
export async function GET(req: Request, { params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const uf = new URL(req.url).searchParams.get("uf") ?? "";
  if (!isStartYear(year) || !/^[A-Z]{2}$/.test(uf)) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  const list = [...(await citiesFor(year)).values()]
    .filter((c) => c.uf === uf)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((c) => ({ value: c.id, label: c.name, hint: `${c.capital ? "Capital · " : ""}${c.electorate.toLocaleString("pt-BR")} eleitores` }));
  return NextResponse.json(list, { headers: { "Cache-Control": "public, max-age=86400, immutable" } });
}
