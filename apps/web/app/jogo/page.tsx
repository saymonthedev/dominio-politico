import type { Metadata } from "next";
import { Announce } from "@/components/Announce";
import { Icon } from "@/components/Icon";
import { AppHeader, Footer, PageHero } from "@/components/SiteChrome";
import { StartTrack } from "@/components/StartTrack";
import { ThanksCard } from "@/components/Thanks";
import { STAGE_LABEL } from "@/components/ui";
import { getSession, myCharacters, myPaidUntil } from "@/lib/game";
import { fmtDate, fmtDay, initials } from "@/lib/format";
import { modeOfWorld, worldIdFor, yearOfWorld } from "@/lib/sim";
import { START_POINTS } from "@/lib/startpoints";

export const metadata: Metadata = { title: "Seus mundos" };

export default async function Page() {
  const { sb } = await getSession();
  const [chars, paidUntil] = await Promise.all([myCharacters(), myPaidUntil()]);
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
  // carreiras encerradas (morte ou aposentadoria) ficam como legado, com o balanço
  const ended = details.filter((d) => d.person && d.person.status !== "ACTIVE").sort((a, b) => a.year - b.year);
  const taken = new Set(active.map((d) => d.year));
  // mundos compartilhados andam com todos os jogadores: a linha do tempo mostra em que data cada um está
  const { data: shared } = await sb.from("worlds").select("id, game_date").in("id", START_POINTS.map((s) => worldIdFor(s.year)));
  const sharedDates: Record<number, string> = {};
  for (const w of shared ?? []) {
    const sp = START_POINTS.find((s) => worldIdFor(s.year) === w.id);
    if (sp && w.game_date && String(w.game_date).slice(0, 7) > sp.date.slice(0, 7)) sharedDates[sp.year] = String(w.game_date);
  }
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
                    <span className="avatar" style={{ background: color, color: inkOn(d.party?.color) }}>{initials(d.person?.name ?? "?")}</span>
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

        {/* agradecimento (no lugar do antigo convite para apoiar com Pix), com até quando a assinatura vale */}
        <ThanksCard variant="wide" until={paidUntil && Date.parse(paidUntil) > Date.now() ? fmtDay(paidUntil) : null} />

        {ended.length > 0 && (
          <div className="legacy">
            <div className="section-kicker">Trajetórias encerradas</div>
            <ul>
              {ended.map((d) => (
                <li key={d.person_id}>
                  <span className="avatar" aria-hidden="true">
                    {initials(d.person?.name ?? "?")}
                  </span>
                  <span>
                    <b>{d.person?.name}</b>
                    <small>Brasil pós-{d.year}</small>
                  </span>
                  <a href={`/jogo/fim/${d.year}?p=${encodeURIComponent(d.person_id)}`}>
                    Ver o balanço <Icon name="arrow" size={14} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="section-head" style={{ marginTop: 56 }}>
          <div className="section-kicker">Nova história</div>
          <h2>Comece em outro Brasil</h2>
          <p>Um personagem por mundo. Os anos em que você já joga aparecem marcados.</p>
        </div>
        <StartTrack hrefFor={(y) => (taken.has(y) ? `/jogo/${y}` : `/jogo/novo?ano=${y}`)} taken={taken} sharedDates={sharedDates} />
      </main>
      {/* novidades da versão (uma vez) e lembrete de apoio (no máximo uma vez por dia) */}
      <Announce />
      <Footer />
    </>
  );
}

/** texto legível sobre a cor do partido: escuro em cores claras (amarelo, laranja…), branco nas escuras */
function inkOn(hex?: string | null) {
  const m = hex?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "#fff";
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#0b1f3a" : "#fff";
}
