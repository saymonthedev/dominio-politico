import { OFFICES, UF_BY_CODE, canonicalGeo, capitalId, eraRules, geoName, isMunicipality, type CandidacyRow, type ElectionRow, type PollRow, type RaceRow } from "@dp/engine";
import { Empty, GameHeader, Panel, Pill } from "@/components/game/Page";
import { Icon } from "@/components/Icon";
import { NavSelect } from "@/components/NavSelect";
import { PersonAvatar } from "@/components/PersonAvatar";
import { PartyChip } from "@/components/ui";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { daysBetween } from "@/lib/game-view";
import { getParties, getSession, partyMap, requireMe } from "@/lib/game";
import { photoOf, type Photo } from "@/lib/photos";
import { citiesFor } from "@/lib/sim";
import { Term } from "@/components/Term";

const STATUS: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "gold" | "sim" }> = {
  AGENDADA: { label: "agendada", tone: "neutral" },
  PRE_CAMPANHA: { label: "pré-campanha", tone: "sim" },
  CONVENCOES: { label: "convenções", tone: "warn" },
  CAMPANHA: { label: "campanha", tone: "gold" },
  SEGUNDO_TURNO: { label: "2º turno", tone: "gold" },
  ENCERRADA: { label: "encerrada", tone: "ok" },
};

const CAND_STATUS: Record<string, string> = {
  PRE: "pré-candidato(a)", HOMOLOGADA: "homologada", SEGUNDO_TURNO: "no 2º turno", ELEITO: "eleito(a)", NAO_ELEITO: "não eleito(a)",
  SUPLENTE: "suplente", INDEFERIDA: "indeferida", DESISTENTE: "não indicada",
};

/** Marcos do calendário eleitoral, na ordem em que acontecem. */
function milestones(e: ElectionRow, switchWindow: boolean) {
  const c = e.calendar;
  return [
    { key: "pre", label: "Pré-campanha", date: c.preCampaignStart },
    ...(switchWindow ? [{ key: "janela", label: "Janela partidária", date: c.partySwitchWindowStart, end: c.partySwitchWindowEnd }] : []),
    { key: "filiacao", label: "Prazo de filiação", date: c.filiationDeadline },
    { key: "convencoes", label: "Convenções", date: c.conventionStart, end: c.conventionEnd },
    { key: "campanha", label: "Campanha na rua", date: c.campaignStart },
    { key: "t1", label: "1º turno", date: e.first_round },
    { key: "t2", label: "2º turno", date: e.runoff },
  ].filter((m) => m.date);
}

export default async function Page({ params, searchParams }: { params: Promise<{ ano: string }>; searchParams: Promise<{ e?: string; uf?: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const sp = await searchParams;
  const uf = sp.uf ?? me.person.uf;
  const cities = await citiesFor(year);
  const geoLabel = (geo: string) => (geo === "BR" ? "Brasil" : geoName(geo, { cities }));
  const myCity = canonicalGeo(me.person.municipality);
  const [{ data: elData }, { data: world }] = await Promise.all([
    sb.from("elections").select("*").eq("world_id", me.worldId).order("year"),
    sb.from("worlds").select("game_date").eq("id", me.worldId).maybeSingle(),
  ]);
  const today: string = world?.game_date ?? `${year}-01-01`;
  const elections = (elData ?? []) as ElectionRow[];
  const current = elections.find((e) => e.status !== "AGENDADA" && e.status !== "ENCERRADA") ?? elections.find((e) => e.status === "AGENDADA");
  const selected = elections.find((e) => e.id === sp.e) ?? current ?? [...elections].reverse().find((e) => e.status === "ENCERRADA") ?? elections[0];
  const pm = partyMap(await getParties(me.worldId));
  let races: RaceRow[] = [];
  let cands: CandidacyRow[] = [];
  let polls: PollRow[] = [];
  if (selected) {
    // capital da UF escolhida, mais a cidade do jogador quando for dessa UF
    const geos = [...new Set(["BR", uf, capitalId(uf), ...(isMunicipality(myCity) && uf === me.person.uf ? [myCity] : [])])];
    const [r, c, p] = await Promise.all([
      sb.from("races").select("*").eq("world_id", me.worldId).eq("election_id", selected.id).in("geo", geos),
      sb.from("candidacies").select("*").eq("world_id", me.worldId).eq("election_id", selected.id).in("geo", geos),
      sb.from("polls").select("*").eq("world_id", me.worldId).in("race_id", geos.flatMap((g) => Object.keys(OFFICES).map((o) => `${selected.id}:${o}:${g}`))).order("game_date", { ascending: false }).limit(20),
    ]);
    races = ((r.data ?? []) as RaceRow[]).sort((a, b) => OFFICES[b.office_code].rank - OFFICES[a.office_code].rank);
    cands = (c.data ?? []) as CandidacyRow[];
    polls = (p.data ?? []) as PollRow[];
  }
  // fotos e nomes de quem aparece (resultados e candidaturas)
  const ids = [
    ...new Set([...races.flatMap((r) => [...(r.results.runoff?.candidates ?? []), ...(r.results.first?.candidates ?? [])].slice(0, 16).map((c) => c.person_id)), ...cands.map((c) => c.person_id)]),
  ].filter(Boolean);
  const photos = new Map<string, Photo>();
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await sb.from("persons").select("id,name,kind,external_ref").eq("world_id", me.worldId).in("id", ids);
    for (const p of data ?? []) {
      names.set(p.id, p.name);
      const ph = photoOf(p);
      if (ph) photos.set(p.id, ph);
    }
  }
  const era = selected ? eraRules(selected.year) : null;
  const marks = selected && era ? milestones(selected, era.partySwitchWindow) : [];
  const nextMark = marks.find((m) => (m.end ?? m.date) >= today);
  const factual = Boolean(selected?.summary?.factual);

  return (
    <>
      <GameHeader
        kicker="O país"
        icon="ballot"
        title="Eleições"
        lede="Calendário, regras e resultados. Eleições anteriores ao ponto de partida mostram o resultado oficial do TSE; as seguintes são disputadas dentro do jogo."
      />

      <nav className="chips mb" aria-label="Eleições">
        {elections.map((e) => (
          <a key={e.id} className={e.id === selected?.id ? "on" : ""} href={`?e=${e.id}&uf=${uf}`}>
            {e.year} · {e.kind === "GERAL" ? "gerais" : "municipais"}
            {e.id === current?.id && e.status !== "AGENDADA" ? " · agora" : ""}
          </a>
        ))}
      </nav>

      {!selected ? (
        <Panel>
          <Empty icon="ballot" title="Nenhuma eleição no calendário" />
        </Panel>
      ) : (
        <>
          <Panel className="mb" tone="dark">
            <div className="ehero">
              <div>
                <div className="ehero__tags">
                  <Pill tone={STATUS[selected.status]?.tone}>{STATUS[selected.status]?.label ?? selected.status}</Pill>
                  {factual ? <Pill tone="ok">resultado oficial · TSE</Pill> : <Pill tone="sim">simulação</Pill>}
                </div>
                <h2>
                  Eleições {selected.kind === "GERAL" ? "gerais" : "municipais"} de {selected.year}
                </h2>
                <p>
                  {selected.kind === "GERAL" ? "Presidente, governadores, senadores e deputados." : "Prefeitos(as) e vereadores(as) dos 5.570 municípios."} 1º turno em{" "}
                  <b>{fmtDate(selected.first_round)}</b>.
                </p>
              </div>
              {nextMark && selected.status !== "ENCERRADA" && (
                <div className="ehero__count">
                  <b>{Math.max(0, daysBetween(today, nextMark.date))}</b>
                  <span>{daysBetween(today, nextMark.date) <= 0 ? `dia(s) · ${nextMark.label} em curso` : `dias para ${nextMark.label.toLowerCase()}`}</span>
                </div>
              )}
            </div>
            <ol className="ecal">
              {marks.map((m) => {
                const done = (m.end ?? m.date) < today;
                const now = m.date <= today && (m.end ?? m.date) >= today;
                return (
                  <li key={m.key} className={done ? "is-done" : now ? "is-now" : m === nextMark ? "is-next" : ""}>
                    <i />
                    <b>{m.label}</b>
                    <span className="mono">
                      {fmtDate(m.date)}
                      {m.end ? ` → ${fmtDate(m.end)}` : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Panel>

          <div className="ggrid ggrid--main">
            <div className="gstack">
              <div className="efilter">
                <NavSelect
                  label="Estado"
                  value={uf}
                  options={Object.values(UF_BY_CODE).map((u) => ({ value: u.code, label: u.name }))}
                  hrefFor={Object.fromEntries(Object.values(UF_BY_CODE).map((u) => [u.code, `?e=${selected.id}&uf=${u.code}`]))}
                />
                <p className="muted small">
                  Mostrando a disputa nacional, a do estado e a da capital{isMunicipality(myCity) && uf === me.person.uf ? `, além de ${geoLabel(myCity)}` : ""}. Outras cidades estão no{" "}
                  <a href={`/jogo/${year}/mapa`}>mapa</a>.
                </p>
              </div>

              {!races.length && (
                <Panel>
                  <Empty icon="clock" title="As disputas ainda não foram abertas">
                    Elas abrem com a pré-campanha, em {fmtDate(selected.calendar.preCampaignStart)}.
                  </Empty>
                </Panel>
              )}

              {races.map((race) => {
                const rule = OFFICES[race.office_code];
                const rc = cands.filter((c) => c.race_id === race.id);
                const round = race.results.runoff ?? race.results.first;
                const poll = polls.find((p) => p.race_id === race.id);
                const top = round?.candidates.slice(0, 8) ?? [];
                const max = Math.max(1, ...top.map((c) => c.share));
                const seats = race.results.first?.parties?.filter((p) => p.seats > 0) ?? [];
                const totalSeats = seats.reduce((s, p) => s + p.seats, 0);
                const mine = rc.some((c) => c.is_player);
                return (
                  <Panel
                    key={race.id}
                    title={
                      <>
                        {rule.name} <span className="muted">· {geoLabel(race.geo)}</span>
                      </>
                    }
                    icon={race.geo === "BR" ? "flag" : isMunicipality(race.geo) ? "home" : "map"}
                    aside={
                      <span className="muted small mono">
                        {race.seats} vaga{race.seats > 1 ? "s" : ""} · {fmtNum(race.electorate)} eleitores {mine && <Pill tone="gold">sua disputa</Pill>}
                      </span>
                    }
                  >
                    {top.length > 0 && (
                      <>
                        {race.results.runoff && <p className="muted small" style={{ marginTop: 0 }}>Resultado do 2º turno</p>}
                        <div className="vbars">
                          {top.map((c) => {
                            const party = pm[c.party_id];
                            const won = race.results.elected?.includes(c.person_id);
                            return (
                              <div key={c.candidacy_id} className={`vbar${won ? " is-won" : ""}`} style={{ ["--c" as string]: party?.color ?? "var(--apagado)" }}>
                                <PersonAvatar name={c.name} color={party?.color} photo={photos.get(c.person_id)} size={34} />
                                <div className="vbar__body">
                                  <div className="vbar__top">
                                    <span>
                                      {c.person_id ? <a href={`/jogo/${year}/pessoa/${c.person_id}`}>{c.name}</a> : c.name} <PartyChip party={party} />
                                      {won && <Pill tone="ok">eleito(a)</Pill>}
                                    </span>
                                    <b className="mono">{fmtPct(c.share, 2)}</b>
                                  </div>
                                  <div className="vbar__track">
                                    <span style={{ width: `${(c.share / max) * 100}%` }} />
                                  </div>
                                  <small className="mono">{fmtNum(c.votes)} votos</small>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {seats.length > 0 && (
                      <div className={top.length ? "mt" : ""}>
                        <div className="seatbar" aria-label="Cadeiras por partido">
                          {seats.map((p) => (
                            <span key={p.party_id} style={{ flex: p.seats, background: pm[p.party_id]?.color ?? "var(--apagado)" }} title={`${pm[p.party_id]?.acronym ?? "?"}: ${p.seats}`} />
                          ))}
                        </div>
                        <div className="seatlist">
                          {seats.map((p) => (
                            <span key={p.party_id}>
                              <PartyChip party={pm[p.party_id]} /> <b className="mono">{p.seats}</b>
                              <small className="mono">{fmtPct((p.seats / totalSeats) * 100, 0)}</small>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {!round && rc.length > 0 && (
                      <>
                        <div className="vbars">
                          {rc
                            .map((c) => ({ c, pct: poll?.results.find((r) => r.id === c.id)?.pct }))
                            .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
                            .map(({ c, pct }) => {
                              const party = pm[c.party_id];
                              return (
                                <div key={c.id} className={`vbar${c.is_player ? " is-me" : ""}`} style={{ ["--c" as string]: party?.color ?? "var(--apagado)" }}>
                                  <PersonAvatar name={names.get(c.person_id) ?? "?"} color={party?.color} photo={photos.get(c.person_id)} size={34} />
                                  <div className="vbar__body">
                                    <div className="vbar__top">
                                      <span>
                                        <a href={`/jogo/${year}/pessoa/${c.person_id}`}>{names.get(c.person_id) ?? "—"}</a> <PartyChip party={party} />
                                        {c.is_player && <Pill tone="gold">você</Pill>}
                                      </span>
                                      <b className="mono">{pct !== undefined ? fmtPct(pct) : CAND_STATUS[c.status] ?? c.status.toLowerCase()}</b>
                                    </div>
                                    {pct !== undefined && (
                                      <div className="vbar__track">
                                        <span style={{ width: `${Math.min(100, pct * 2)}%` }} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                        {poll ? (
                          <p className="muted small mt">
                            <Icon name="chart" size={13} /> {poll.institute}, {fmtDate(poll.game_date)} · {fmtNum(poll.sample)} entrevistas · margem ±{fmtPct(poll.margin)} · indecisos {poll.undecided}%
                          </p>
                        ) : (
                          <p className="muted small mt">Ainda sem pesquisa divulgada para esta disputa.</p>
                        )}
                      </>
                    )}

                    {!round && !rc.length && (
                      <p className="muted small" style={{ marginTop: 0 }}>
                        As candidaturas saem das convenções, de {fmtDate(selected.calendar.conventionStart)} a {fmtDate(selected.calendar.conventionEnd)}.
                      </p>
                    )}
                  </Panel>
                );
              })}
            </div>

            <div className="gstack">
              {era && (
                <Panel title="Regras desta eleição" icon="shield">
                  <ul className="rules">
                    <li>
                      <b>Filiação</b>
                      <span>até {era.filiationMonths} meses antes do 1º turno ({fmtDate(selected.calendar.filiationDeadline)}).</span>
                    </li>
                    <li>
                      <b>Domicílio eleitoral</b>
                      <span>{era.domicileMonths} meses na circunscrição.</span>
                    </li>
                    <li>
                      <b>
                        <Term k={era.fichaLimpa ? "Ficha Limpa" : "Inelegibilidade"} />
                      </b>
                      <span>{era.fichaLimpa ? "condenação por órgão colegiado deixa 8 anos inelegível." : "3 anos após condenação definitiva (antes da Ficha Limpa)."}</span>
                    </li>
                    {era.partySwitchWindow && (
                      <li>
                        <b>
                          <Term k="Janela partidária" />
                        </b>
                        <span>
                          troca de partido sem perder mandato de {fmtDate(selected.calendar.partySwitchWindowStart)} a {fmtDate(selected.calendar.partySwitchWindowEnd)}.
                        </span>
                      </li>
                    )}
                    {era.notes.map((n) => (
                      <li key={n}>
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
              <Panel title="Como disputar" icon="flag" tone="gold">
                <p className="small" style={{ marginTop: 0 }}>
                  Para entrar numa disputa você precisa estar filiado(a) até o prazo, lançar a pré-candidatura e ser escolhido(a) na <Term k="Convenção partidária">convenção</Term> do seu partido.
                </p>
                <a className="ui-btn ui-btn--gold ui-btn--sm" href={`/jogo/${year}/campanha`}>
                  <span>Ir para a campanha</span> <Icon name="arrow" size={14} />
                </a>
              </Panel>
            </div>
          </div>
        </>
      )}
    </>
  );
}
