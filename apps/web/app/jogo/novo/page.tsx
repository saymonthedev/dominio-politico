import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AXES, AXIS_INFO, ORIGINS, PROFESSIONS, UFS } from "@dp/engine";
import { Brand } from "@/components/Logo";
import { CharacterForm } from "@/components/CharacterForm";
import { Footer } from "@/components/SiteChrome";
import { myCharacters } from "@/lib/game";
import { isStartYear, worldIdFor } from "@/lib/sim";
import { START_POINTS } from "@/lib/startpoints";

export const metadata: Metadata = { title: "Novo personagem" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const year = Number((await searchParams).ano ?? 2026);
  if (!isStartYear(year)) redirect("/jogo");
  const chars = await myCharacters();
  if (chars.some((c) => c.world_id === worldIdFor(year))) redirect(`/jogo/${year}`);
  const sp = START_POINTS.find((s) => s.year === year)!;
  return (
    <>
      <header className="masthead">
        <div className="container inner">
          <Brand href="/jogo" />
        </div>
      </header>
      <main className="container">
        <div className="label">Mundo pós-{year} · começa em {sp.date.split("-").reverse().join("/")}</div>
        <h1>Novo personagem</h1>
        <p className="muted" style={{ maxWidth: 720 }}>
          {sp.winner} ({sp.winnerParty}) acaba de vencer o 2º turno com {sp.winnerShare.toFixed(2).replace(".", ",")}% dos votos válidos contra {sp.rival}.{" "}
          {sp.incumbent !== sp.winner ? `${sp.incumbent} ainda exerce a Presidência até a posse.` : ""} Você ainda não participa formalmente da política.
        </p>
        <CharacterForm
          year={year}
          ufs={UFS.map((u) => ({ value: u.code, label: `${u.name} — ${u.capital}` }))}
          professions={PROFESSIONS.map((p) => ({ value: p.id, label: p.label }))}
          origins={ORIGINS.map((o) => ({ value: o.id, label: o.label }))}
          axes={AXES.map((a) => ({ key: a, label: AXIS_INFO[a].label, neg: AXIS_INFO[a].neg, pos: AXIS_INFO[a].pos }))}
        />
      </main>
      <Footer />
    </>
  );
}
