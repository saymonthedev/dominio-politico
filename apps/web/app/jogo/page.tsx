import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { AppHeader, Footer, PageHero } from "@/components/SiteChrome";
import { StartTrack } from "@/components/StartTrack";
import { STAGE_LABEL } from "@/components/ui";
import { getSession, myCharacters } from "@/lib/game";
import { fmtDate, initials } from "@/lib/format";
import { modeOfWorld, yearOfWorld } from "@/lib/sim";

export const metadata: Metadata = { title: "Seus mundos" };

export default async function Page() {
  const { sb } = await getSession();
  const chars = await myCharacters();
  const details = await Promise.all(
    chars.map(async (c) => {
      const [{ data: p }, { data: w }] = await Promise.all([
        sb.from("persons").select("name, stage, uf, status, party_id, role_label").eq("world_id", c.world_id).eq("id", c.person_id).maybeSingle(),
        sb.from("worlds").select("game_date").eq("id", c.world_id).maybeSingle(),
      ]);
      let party: { acronym: string; color: string } | null = null;
      if (p?.party_id) {
        const { data } = await sb.from("parties").select("acronym, color").eq("world_id", c.world_id).eq("id", p.party_id).maybeSingle();
        party = data;
      }
      return { ...c, year: yearOfWorld(c.world_id), person: p, party, date: w?.game_date as string | undefined };
    }),
  );
  const active = details.filter((d) => d.person?.status === "ACTIVE").sort((a, b) => a.year - b.year);
  const taken = new Set(active.map((d) => d.year));
  return (
    <>
      <AppHeader />
      <PageHero
        kicker="Sua carreira"
        title="Seus mundos"
        lede={
          active.length
            ? "Cada mundo segue o próprio calendário. Escolha onde continuar ou comece uma nova história em outro ano."
            : "Você ainda não entrou na política. Escolha abaixo o Brasil em que sua história começa."
        }
      />
      <main className="container page-body">
        {active.length > 0 ? (
          <div className="worlds">
            {active.map((d) => {
              const color = d.party?.color ?? "var(--planalto-2)";
              return (
                <a key={d.world_id} className="world-card" href={`/jogo/${d.year}`} style={{ ["--accent" as string]: color }}>
                  <div className="world-card__top">
                    <span className="world-card__year">
                      Brasil pós-{d.year}
                      {modeOfWorld(d.world_id) !== "SHARED" && <small className="world-card__mode">{modeOfWorld(d.world_id) === "FICTIONAL" ? "fictício · só seu" : "só seu"}</small>}
                    </span>
                    <span className="world-card__date">
                      <Icon name="calendar" size={14} /> {fmtDate(d.date)}
                    </span>
                  </div>
                  <div className="world-card__who">
                    <span className="avatar" style={{ background: color }}>{initials(d.person?.name ?? "?")}</span>
                    <div>
                      <b>{d.person?.name}</b>
                      <span>{d.person?.role_label ?? STAGE_LABEL[d.person?.stage ?? ""] ?? d.person?.stage}</span>
                    </div>
                  </div>
                  <div className="world-card__tags">
                    <span className="tag">
                      <Icon name="pin" size={13} /> {d.person?.uf}
                    </span>
                    <span className="tag">{d.party ? d.party.acronym : "Sem partido"}</span>
                  </div>
                  <span className="world-card__go">
                    Continuar <Icon name="arrow" size={16} />
                  </span>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span className="ico">
              <Icon name="flag" size={26} />
            </span>
            <b>Nenhum personagem ainda</b>
            <p>Escolha um ponto de partida abaixo. Você pode ter um personagem em cada mundo.</p>
          </div>
        )}

        <div className="section-head" style={{ marginTop: 56 }}>
          <div className="section-kicker">Nova história</div>
          <h2>Comece em outro Brasil</h2>
          <p>Um personagem por mundo. Os anos em que você já joga aparecem marcados.</p>
        </div>
        <StartTrack hrefFor={(y) => (taken.has(y) ? `/jogo/${y}` : `/jogo/novo?ano=${y}`)} taken={taken} />
      </main>
      <Footer />
    </>
  );
}
