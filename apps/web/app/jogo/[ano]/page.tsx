import type { EconomyRow, ElectionRow, NewsRow, NotificationRow, PersonRow } from "@dp/engine";
import { NewsItem, PartyChip, STAGE_LABEL, Stat } from "@/components/ui";
import { fmtDate, fmtDec, fmtPct } from "@/lib/format";
import { getParties, getSession, getWorld, partyMap, requireMe } from "@/lib/game";

const NEXT_STEP: Record<string, string> = {
  CIDADAO: "Participe de eventos comunitários e de voluntariado para virar ativista.",
  ATIVISTA: "Vá a reuniões abertas de partidos e converse com lideranças.",
  APROXIMACAO: "Peça filiação ao partido com que você tem mais afinidade e relacionamento.",
  FILIADO: "Faça trabalho de base para ganhar prestígio interno e virar quadro.",
  QUADRO: "No ano eleitoral, lance sua pré-candidatura antes das convenções.",
  PRE_CANDIDATO: "Ganhe a convenção: prestígio, reputação e apoio de uma ala.",
  CANDIDATO: "Campanha na rua: comícios, propostas, debates e arrecadação.",
  MANDATO: "Vote, legisle, destine emendas — e prepare o próximo degrau.",
};

export default async function Painel({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const world = await getWorld(year);
  const [newsQ, ecoQ, electionsQ, notifQ, parties] = await Promise.all([
    sb.from("news_articles").select("*").eq("world_id", me.worldId).order("tick", { ascending: false }).order("importance", { ascending: false }).limit(24),
    sb.from("economy_snapshots").select("*").eq("world_id", me.worldId).order("month", { ascending: false }).limit(2),
    sb.from("elections").select("*").eq("world_id", me.worldId).neq("status", "ENCERRADA").order("year").limit(1),
    sb.from("notifications").select("*").eq("world_id", me.worldId).order("tick", { ascending: false }).limit(5),
    getParties(me.worldId),
  ]);
  const news = (newsQ.data ?? []) as NewsRow[];
  const [eco, ecoPrev] = (ecoQ.data ?? []) as EconomyRow[];
  const election = (electionsQ.data ?? [])[0] as ElectionRow | undefined;
  const notifs = (notifQ.data ?? []) as NotificationRow[];
  const pm = partyMap(parties);
  const presId = world?.gov.president_id;
  const { data: pres } = presId ? await sb.from("persons").select("*").eq("world_id", me.worldId).eq("id", presId).maybeSingle() : { data: null };
  const president = pres as PersonRow | null;
  const lead = [...news].sort((a, b) => b.importance - a.importance || b.tick - a.tick)[0];
  const rest = news.filter((n) => n.id !== lead?.id);
  const camara = [...parties].sort((a, b) => (b.seats.camara ?? 0) - (a.seats.camara ?? 0)).slice(0, 6);
  const daysTo = election && world ? Math.round((Date.parse(election.first_round) - Date.parse(world.game_date)) / 86_400_000) : null;

  return (
    <div className="layout-main">
      <section>
        <div className="rule-title" style={{ marginTop: 0 }}>
          <h2>Manchetes</h2>
          <a href={`/jogo/${year}/noticias`}>Todas as notícias →</a>
        </div>
        {lead ? <NewsItem n={lead} lead /> : <div className="empty">O noticiário ainda está sendo impresso.</div>}
        {rest.slice(0, 10).map((n) => (
          <NewsItem key={n.id} n={n} />
        ))}
      </section>

      <aside className="stack">
        <div className="card dark">
          <div className="label">Sua carreira</div>
          <h3 className="mt" style={{ fontSize: "1.3rem" }}>{STAGE_LABEL[me.person.stage]}</h3>
          <p style={{ color: "#d5deeb", fontSize: ".9rem" }}>{NEXT_STEP[me.person.stage]}</p>
          <a className="btn gold small" href={`/jogo/${year}/carreira`}>Agir agora</a>
          {me.person.party_id === null && (
            <p className="mt" style={{ color: "#b8c4d8", fontSize: ".8rem" }}>
              Você ainda não participa formalmente da política. <a href={`/jogo/${year}/partidos`} style={{ color: "#f4d58d" }}>Explorar partidos</a>
            </p>
          )}
        </div>

        <div className="card">
          <div className="label">Painel nacional</div>
          <div className="row between mt">
            <div>
              <div className="muted" style={{ fontSize: ".78rem" }}>Presidência</div>
              <b>{president?.name ?? "—"}</b> {president?.party_id && <PartyChip party={pm[president.party_id]} />}
            </div>
            <Stat label="Aprovação" value={fmtPct(world?.gov.approval ?? 0, 0)} />
          </div>
          {eco && (
            <div className="grid grid-4 mt" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              <Stat label="Selic" value={fmtPct(eco.selic, 2)} hint={ecoPrev ? `antes ${fmtDec(ecoPrev.selic, 2)}` : undefined} />
              <Stat label="IPCA 12m" value={fmtPct(eco.inflation_12m)} />
              <Stat label="Desemprego" value={fmtPct(eco.unemployment)} />
              <Stat label="PIB (ritmo)" value={fmtPct(eco.gdp_growth)} tone={eco.gdp_growth >= 0 ? "up" : "down"} />
            </div>
          )}
          <a className="muted" href={`/jogo/${year}/economia`} style={{ fontSize: ".82rem" }}>Ver economia →</a>
        </div>

        {election && (
          <div className="card">
            <div className="label">Próxima eleição</div>
            <h3 className="mt">Eleições {election.kind === "GERAL" ? "gerais" : "municipais"} de {election.year}</h3>
            <p className="mono" style={{ fontSize: "1.6rem", margin: 0 }}>{daysTo !== null && daysTo > 0 ? `${daysTo} dias` : "em andamento"}</p>
            <p className="muted" style={{ fontSize: ".85rem" }}>
              1º turno em {fmtDate(election.first_round)} · filiação até {fmtDate(election.calendar.filiationDeadline)}
            </p>
            <a className="muted" href={`/jogo/${year}/eleicoes`} style={{ fontSize: ".82rem" }}>Calendário e disputas →</a>
          </div>
        )}

        <div className="card">
          <div className="label">Câmara dos Deputados</div>
          <div className="stack mt">
            {camara.map((p) => (
              <div key={p.id} className="row between">
                <PartyChip party={p} href={`/jogo/${year}/partidos/${p.id}`} />
                <span className="mono">{p.seats.camara ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="label">Notificações</div>
          {notifs.length ? (
            notifs.map((n) => (
              <div key={n.id} className="mt" style={{ fontSize: ".88rem" }}>
                <b>{n.title}</b>
                <div className="muted">{n.body}</div>
              </div>
            ))
          ) : (
            <p className="muted mt">Nada por enquanto.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
