import { profileFor } from "@dp/engine";
import { ogImage, OG_SIZE } from "@/lib/og";
import { START_POINTS } from "@/lib/startpoints";

export const alt = "Ponto de partida do Domínio Político";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return START_POINTS.map((s) => ({ ano: String(s.year) }));
}

export default async function Image({ params }: { params: Promise<{ ano: string }> }) {
  const { ano } = await params;
  const sp = START_POINTS.find((s) => String(s.year) === ano) ?? START_POINTS[START_POINTS.length - 1];
  return ogImage({
    kicker: `Ponto de partida · ${sp.date.split("-").reverse().join("/")}`,
    title: "Brasil pós-",
    accent: String(sp.year),
    lede: `Comece como cidadão no país do dia seguinte ao 2º turno: partidos, eleitos e economia daquele momento. Daí em diante, a história é sua.`,
    duel: { winner: sp.winner, winnerShare: sp.winnerShare, winnerColor: profileFor(sp.winnerParty, sp.year).color, rival: sp.rival, rivalShare: sp.rivalShare, rivalColor: profileFor(sp.rivalParty, sp.year).color },
  });
}
