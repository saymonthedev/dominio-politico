import type { Metadata } from "next";
import { Footer } from "@/components/SiteChrome";
import { Brand } from "@/components/Logo";
import { getSession, myCharacters } from "@/lib/game";
import { START_POINTS } from "@/lib/startpoints";
import { fmtDate } from "@/lib/format";
import { yearOfWorld } from "@/lib/sim";

export const metadata: Metadata = { title: "Seus mundos" };

export default async function Page() {
  const { sb } = await getSession();
  const chars = await myCharacters();
  const details = await Promise.all(
    chars.map(async (c) => {
      const [{ data: p }, { data: w }] = await Promise.all([
        sb.from("persons").select("name, stage, uf, status").eq("world_id", c.world_id).eq("id", c.person_id).maybeSingle(),
        sb.from("worlds").select("game_date").eq("id", c.world_id).maybeSingle(),
      ]);
      return { ...c, year: yearOfWorld(c.world_id), person: p, date: w?.game_date as string | undefined };
    }),
  );
  const active = details.filter((d) => d.person?.status === "ACTIVE");
  const taken = new Set(active.map((d) => d.year));
  return (
    <>
      <header className="masthead">
        <div className="container inner">
          <Brand />
          <span className="spacer" />
          <a className="link" href="/conta">Minha conta</a>
          <form action="/sair" method="post">
            <button className="btn on-dark small">Sair</button>
          </form>
        </div>
      </header>
      <main className="container">
        <h1>Seus mundos</h1>
        {active.length ? (
          <div className="grid grid-3">
            {active.map((d) => (
              <a key={d.world_id} className="startpoint" href={`/jogo/${d.year}`}>
                <span className="label">Mundo pós-{d.year}</span>
                <span className="year" style={{ fontSize: "1.4rem" }}>{d.person?.name}</span>
                <span className="who">
                  {d.person?.uf} · hoje no mundo: <b className="mono">{fmtDate(d.date)}</b>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <div className="empty">Você ainda não tem personagem. Escolha um ponto de partida abaixo.</div>
        )}
        <div className="rule-title">
          <h2>Começar uma nova história</h2>
          <span className="muted">Um personagem por mundo</span>
        </div>
        <div className="timeline">
          {START_POINTS.map((s) => (
            <a key={s.year} className="startpoint" href={taken.has(s.year) ? `/jogo/${s.year}` : `/jogo/novo?ano=${s.year}`} aria-disabled={taken.has(s.year)}>
              <span className="year">{s.year}</span>
              <span>
                <b>{s.winner}</b> eleito(a)
              </span>
              <span className="who">Em exercício: {s.incumbent}</span>
              {taken.has(s.year) && <span className="badge gold plain">Você joga aqui</span>}
            </a>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
