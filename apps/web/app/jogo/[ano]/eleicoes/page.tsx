import { OFFICES, UF_BY_CODE, eraRules, municipalityId, type CandidacyRow, type ElectionRow, type PollRow, type RaceRow } from "@dp/engine";
import { NavSelect } from "@/components/NavSelect";
import { PartyChip } from "@/components/ui";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { getParties, getSession, partyMap, requireMe } from "@/lib/game";

const STATUS: Record<string, string> = {
  AGENDADA: "Agendada", PRE_CAMPANHA: "Pré-campanha", CONVENCOES: "Convenções", CAMPANHA: "Campanha", SEGUNDO_TURNO: "2º turno", ENCERRADA: "Encerrada",
};

function geoLabel(geo: string) {
  if (geo === "BR") return "Brasil";
  if (geo.endsWith("-CAP")) return UF_BY_CODE[geo.slice(0, 2)]?.capital ?? geo;
  return UF_BY_CODE[geo]?.name ?? geo;
}

export default async function Page({ params, searchParams }: { params: Promise<{ ano: string }>; searchParams: Promise<{ e?: string; uf?: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const sp = await searchParams;
  const uf = sp.uf ?? me.person.uf;
  const { data: elData } = await sb.from("elections").select("*").eq("world_id", me.worldId).order("year");
  const elections = (elData ?? []) as ElectionRow[];
  const current = elections.find((e) => e.status !== "AGENDADA" && e.status !== "ENCERRADA");
  const selected = elections.find((e) => e.id === sp.e) ?? current ?? [...elections].reverse().find((e) => e.status === "ENCERRADA") ?? elections[0];
  const pm = partyMap(await getParties(me.worldId));
  let races: RaceRow[] = [];
  let cands: CandidacyRow[] = [];
  let polls: PollRow[] = [];
  if (selected) {
    const geos = ["BR", uf, municipalityId(uf)];
    const [r, c, p] = await Promise.all([
      sb.from("races").select("*").eq("world_id", me.worldId).eq("election_id", selected.id).in("geo", geos),
      sb.from("candidacies").select("*").eq("world_id", me.worldId).eq("election_id", selected.id).in("geo", geos),
      sb.from("polls").select("*").eq("world_id", me.worldId).in("race_id", geos.flatMap((g) => Object.keys(OFFICES).map((o) => `${selected.id}:${o}:${g}`))).order("game_date", { ascending: false }).limit(20),
    ]);
    races = ((r.data ?? []) as RaceRow[]).sort((a, b) => OFFICES[b.office_code].rank - OFFICES[a.office_code].rank);
    cands = (c.data ?? []) as CandidacyRow[];
    polls = (p.data ?? []) as PollRow[];
  }
  const names = new Map<string, string>();
  if (cands.length) {
    const { data } = await sb.from("persons").select("id,name").eq("world_id", me.worldId).in("id", cands.map((c) => c.person_id));
    for (const p of data ?? []) names.set(p.id, p.name);
  }
  const era = selected ? eraRules(selected.year) : null;
  return (
    <>
      <h1>Eleições</h1>
      <div className="row" style={{ marginBottom: 14 }}>
        {elections.map((e) => (
          <a key={e.id} className={`btn small ${e.id === selected?.id ? "" : "ghost"}`} href={`?e=${e.id}&uf=${uf}`}>
            {e.year} · {STATUS[e.status]}
            {e.summary?.factual ? " · real" : ""}
          </a>
        ))}
      </div>
      {selected && (
        <div className="layout-main">
          <section>
            <div className="row between">
              <h2 style={{ margin: 0 }}>Eleições {selected.kind === "GERAL" ? "gerais" : "municipais"} de {selected.year}</h2>
              {selected.summary?.factual ? <span className="badge real">Resultado oficial (TSE)</span> : <span className="badge sim">Simulação</span>}
            </div>
            <div className="mt" style={{ maxWidth: 320 }}>
              <NavSelect
                label="Estado"
                value={uf}
                options={Object.values(UF_BY_CODE).map((u) => ({ value: u.code, label: u.name }))}
                hrefFor={Object.fromEntries(Object.values(UF_BY_CODE).map((u) => [u.code, `?e=${selected.id}&uf=${u.code}`]))}
              />
            </div>
            {!races.length && <div className="empty mt">As disputas são abertas no início do ano eleitoral ({fmtDate(selected.calendar.preCampaignStart)}).</div>}
            {races.map((race) => {
              const rule = OFFICES[race.office_code];
              const rc = cands.filter((c) => c.race_id === race.id);
              const round = race.results.runoff ?? race.results.first;
              const poll = polls.find((p) => p.race_id === race.id);
              return (
                <div key={race.id} className="card mt">
                  <div className="row between">
                    <h3 style={{ margin: 0 }}>{rule.name} · {geoLabel(race.geo)}</h3>
                    <span className="label">{race.seats} vaga(s) · {fmtNum(race.electorate)} eleitores</span>
                  </div>
                  {round && round.candidates.length > 0 && (
                    <table className="mt">
                      <thead><tr><th>Candidato(a)</th><th>Partido</th><th className="num">Votos</th><th className="num">% válidos</th></tr></thead>
                      <tbody>
                        {round.candidates.slice(0, 8).map((c) => (
                          <tr key={c.candidacy_id}>
                            <td>{c.person_id ? <a href={`/jogo/${year}/pessoa/${c.person_id}`}>{c.name}</a> : c.name} {race.results.elected?.includes(c.person_id) && <span className="badge real plain">eleito(a)</span>}</td>
                            <td><PartyChip party={pm[c.party_id]} /></td>
                            <td className="num mono">{fmtNum(c.votes)}</td>
                            <td className="num mono">{fmtPct(c.share, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {race.results.first?.parties && (
                    <table className="mt">
                      <thead><tr><th>Partido</th><th className="num">Votos</th><th className="num">%</th><th className="num">Cadeiras</th></tr></thead>
                      <tbody>
                        {race.results.first.parties.filter((p) => p.seats > 0).map((p) => (
                          <tr key={p.party_id}><td><PartyChip party={pm[p.party_id]} /></td><td className="num mono">{fmtNum(p.votes)}</td><td className="num mono">{fmtPct(p.share)}</td><td className="num mono">{p.seats}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {!round && rc.length > 0 && (
                    <div className="mt">
                      {rc.map((c) => (
                        <div key={c.id} className="row between" style={{ padding: "4px 0", borderBottom: "1px solid var(--linha)" }}>
                          <span>
                            <a href={`/jogo/${year}/pessoa/${c.person_id}`}>{names.get(c.person_id) ?? "—"}</a> <PartyChip party={pm[c.party_id]} /> {c.is_player && <span className="badge gold plain">jogador</span>}
                          </span>
                          <span className="mono">{poll?.results.find((r) => r.id === c.id)?.pct !== undefined ? fmtPct(poll.results.find((r) => r.id === c.id)!.pct) : c.status.toLowerCase()}</span>
                        </div>
                      ))}
                      {poll && <p className="muted mt" style={{ fontSize: ".78rem" }}>{poll.institute}, {fmtDate(poll.game_date)} · {poll.sample} entrevistas · margem ±{fmtPct(poll.margin)} · indecisos {poll.undecided}%</p>}
                    </div>
                  )}
                  {!round && !rc.length && <p className="muted mt">Candidaturas definidas nas convenções ({fmtDate(selected.calendar.conventionStart)} a {fmtDate(selected.calendar.conventionEnd)}).</p>}
                </div>
              );
            })}
          </section>
          <aside className="stack">
            <div className="card">
              <div className="label">Calendário</div>
              <dl className="kv mt">
                <dt>Pré-campanha</dt><dd className="mono">{fmtDate(selected.calendar.preCampaignStart)}</dd>
                <dt>Prazo de filiação</dt><dd className="mono">{fmtDate(selected.calendar.filiationDeadline)}</dd>
                {era?.partySwitchWindow && (<><dt>Janela partidária</dt><dd className="mono">{fmtDate(selected.calendar.partySwitchWindowStart)} → {fmtDate(selected.calendar.partySwitchWindowEnd)}</dd></>)}
                <dt>Convenções</dt><dd className="mono">{fmtDate(selected.calendar.conventionStart)} → {fmtDate(selected.calendar.conventionEnd)}</dd>
                <dt>Campanha</dt><dd className="mono">{fmtDate(selected.calendar.campaignStart)}</dd>
                <dt>1º turno</dt><dd className="mono">{fmtDate(selected.first_round)}</dd>
                <dt>2º turno</dt><dd className="mono">{fmtDate(selected.runoff)}</dd>
              </dl>
            </div>
            {era && (
              <div className="card">
                <div className="label">Regras desta eleição</div>
                <ul style={{ paddingLeft: 18, fontSize: ".86rem" }}>
                  <li>Filiação: {era.filiationMonths} meses antes; domicílio: {era.domicileMonths} meses.</li>
                  <li>{era.fichaLimpa ? "Ficha Limpa em vigor: condenação colegiada = 8 anos inelegível." : "Antes da Ficha Limpa: inelegibilidade de 3 anos após trânsito em julgado."}</li>
                  {era.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
