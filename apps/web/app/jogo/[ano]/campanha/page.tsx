import { Ctx, explainShift, geoName, mainRival, OFFICES, PERSONA_LABEL, projectList, segmentStandings, type CandidacyRow, type DebateRow, type ElectionRow, type PollRow } from "@dp/engine";
import { CampaignMoney, Electorate, Momentum, Promises, ScoreBoard, type WarRoomProps } from "@/components/game/WarRoom";
import { ActionPanel } from "@/components/ActionPanel";
import { Empty, GameHeader, Kpi, MeterRow, Panel, Pill } from "@/components/game/Page";
import { Icon } from "@/components/Icon";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { daysBetween } from "@/lib/game-view";
import { getSession, playerState, requireMe } from "@/lib/game";
import { citiesFor } from "@/lib/sim";
import { Term } from "@/components/Term";

const STATUS: Record<string, { label: string; tone: "neutral" | "ok" | "bad" | "warn" | "gold" | "sim" }> = {
  PRE: { label: "pré-candidatura · aguardando convenção", tone: "warn" },
  HOMOLOGADA: { label: "candidatura homologada", tone: "ok" },
  SEGUNDO_TURNO: { label: "no 2º turno", tone: "gold" },
  ELEITO: { label: "eleito(a)", tone: "ok" },
  NAO_ELEITO: { label: "não eleito(a)", tone: "bad" },
  SUPLENTE: { label: "suplente", tone: "sim" },
  INDEFERIDA: { label: "candidatura indeferida", tone: "bad" },
  DESISTENTE: { label: "não indicada pelo partido", tone: "neutral" },
};

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const cities = await citiesFor(year);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, cQ] = await Promise.all([
    playerState(year),
    sb.from("candidacies").select("*").eq("world_id", me.worldId).eq("person_id", me.person.id).order("election_id", { ascending: false }).limit(5),
  ]);
  const today = state.world.game_date;
  const cands = (cQ.data ?? []) as CandidacyRow[];
  const current = cands[0];
  const election = current ? (state.t.elections.get(current.election_id) as ElectionRow | undefined) : undefined;
  const upcoming = [...state.t.elections.values()].filter((e) => e.status !== "ENCERRADA").sort((a, b) => a.year - b.year)[0];
  let polls: PollRow[] = [];
  let debates: DebateRow[] = [];
  if (current) {
    const [p, d] = await Promise.all([
      sb.from("polls").select("*").eq("world_id", me.worldId).eq("race_id", current.race_id).order("game_date", { ascending: false }).limit(6),
      sb.from("debates").select("*").eq("world_id", me.worldId).eq("race_id", current.race_id).order("scheduled_on"),
    ]);
    polls = (p.data ?? []) as PollRow[];
    debates = ((d.data ?? []) as DebateRow[]).filter((x) => x.participants.includes(current.id));
  }
  const allCampaign = actionsFor(state, me.person.id, ["CAMPANHA"]);
  const campaignActions = allCampaign.filter((a) => !a.id.startsWith("pre_"));
  // pré-campanha: só enquanto a convenção não decide
  const preCampaign = current?.status === "PRE" ? allCampaign.filter((a) => a.id.startsWith("pre_")) : [];
  const pre = actionsFor(state, me.person.id, ["PARTIDO"]).filter((a) => a.id === "pre_candidatura");
  const c = current?.campaign;
  const st = current ? STATUS[current.status] : undefined;
  const latest = polls[0];
  const myPct = latest?.results.find((r) => r.id === current?.id)?.pct;
  const leader = latest?.results[0];
  const decisive = election ? (current?.status === "SEGUNDO_TURNO" ? election.runoff : election.first_round) : undefined;
  // sala de guerra: calculada sobre o estado do mundo (a candidatura viva está na memória do motor)
  let war: WarRoomProps | null = null;
  const live = current ? state.t.candidacies.get(current.id) : undefined;
  if (live && ["PRE", "HOMOLOGADA", "SEGUNDO_TURNO"].includes(live.status)) {
    const rctx = new Ctx(state, "read");
    const majoritarian = OFFICES[live.office_code].system === "MAJORITARIO";
    const rv = majoritarian && live.status !== "PRE" ? mainRival(rctx, live) : null;
    war = {
      cand: live,
      standings: segmentStandings(rctx, live),
      majoritarian,
      rival: rv ? { name: rv.person.name, party: rv.party?.acronym ?? null, pct: rv.pct, persona: rv.cand.campaign.persona ? PERSONA_LABEL[rv.cand.campaign.persona] : null } : null,
      projection: majoritarian ? null : projectList(rctx, live),
      why: explainShift(live),
    };
  }

  return (
    <>
      <GameHeader kicker="Você" icon="megaphone" title="Campanha" lede="Pré-candidatura, convenção, rua e urna. Aqui ficam seus recursos, as pesquisas da sua disputa e os debates." />

      {current ? (
        <Panel className="mb" tone="dark">
          <div className="ehero">
            <div>
              <div className="ehero__tags">
                {st && <Pill tone={st.tone}>{st.label}</Pill>}
                <Pill>nº {current.ballot_number}</Pill>
              </div>
              <h2>
                {OFFICES[current.office_code].name} · {geoName(current.geo, { cities })}
              </h2>
              <p>
                {current.votes
                  ? `${fmtNum(current.votes)} votos (${fmtPct(current.vote_share, 2)}).`
                  : myPct !== undefined
                    ? `Última pesquisa: você tem ${fmtPct(myPct)}${leader && leader.id !== current.id ? `; quem lidera tem ${fmtPct(leader.pct)}` : " e lidera"}.`
                    : "Ainda sem pesquisa divulgada para a sua disputa."}
                {current.note ? ` ${current.note}` : ""}
              </p>
            </div>
            {decisive && decisive >= today && (
              <div className="ehero__count">
                <b>{daysBetween(today, decisive)}</b>
                <span>dias para {current.status === "SEGUNDO_TURNO" ? "o 2º turno" : "o 1º turno"}</span>
              </div>
            )}
          </div>
        </Panel>
      ) : (
        <Panel className="mb">
          <Empty icon="megaphone" title="Você não tem candidatura">
            <p>
              No ano eleitoral, filiado(a) dentro do prazo, lance sua pré-candidatura. A <Term k="Convenção partidária">convenção</Term> do partido decide quem disputa.
              {upcoming ? ` Próxima eleição: ${upcoming.year}, com pré-campanha a partir de ${fmtDate(upcoming.calendar.preCampaignStart)}.` : ""}
            </p>
            <a className="ui-btn ui-btn--ghost ui-btn--sm" href={`/jogo/${year}/eleicoes`}>
              <span>Ver calendário eleitoral</span> <Icon name="arrow" size={14} />
            </a>
          </Empty>
        </Panel>
      )}

      {war && <ScoreBoard {...war} />}

      <div className="ggrid ggrid--main">
        <div className="gstack">
          {pre.length > 0 && (
            <Panel title="Pré-candidatura" icon="flag" tone="gold">
              <ActionPanel year={year} actions={pre} />
            </Panel>
          )}
          {preCampaign.length > 0 && (
            <Panel title="Pré-campanha" icon="megaphone" tone="gold">
              <p className="muted small" style={{ marginTop: 0 }}>
                Até a convenção você pode se apresentar, ouvir, articular e arrecadar, sem pedir voto. Isso garante seu nome na chapa e dá vantagem quando a campanha oficial começar.
              </p>
              <ActionPanel year={year} actions={preCampaign} />
            </Panel>
          )}
          <Panel title="Ações de campanha" icon="play">
            <ActionPanel year={year} actions={campaignActions} empty="As ações de campanha liberam com a candidatura homologada e a campanha oficial aberta." />
          </Panel>
          {war && <Electorate {...war} />}
        </div>

        <div className="gstack">
          {war && <Momentum {...war} />}
          {(war?.cand.campaign ?? c) && <CampaignMoney c={(war?.cand.campaign ?? c)!} status={war?.cand.status ?? current?.status ?? ""} />}

          <Panel title="Pesquisas" icon="chart">
            {polls.length ? (
              <div className="polls">
                {polls.map((p) => (
                  <div key={p.id} className="poll">
                    <div className="poll__head">
                      <b>{p.institute}</b>
                      <span className="mono">{fmtDate(p.game_date)}</span>
                      {p.private_for && <Pill tone="gold">interna</Pill>}
                    </div>
                    {p.results.slice(0, 4).map((r) => (
                      <div key={r.id} className={`poll__row${r.id === current?.id ? " is-me" : ""}`}>
                        <span>
                          {r.name} <small>{r.party}</small>
                        </span>
                        <i>
                          <em style={{ width: `${Math.min(100, r.pct * 2)}%` }} />
                        </i>
                        <b className="mono">{fmtPct(r.pct)}</b>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                Sem pesquisas divulgadas para a sua disputa. Com a campanha aberta, você pode encomendar uma pesquisa interna.
              </p>
            )}
          </Panel>

          {debates.length > 0 && (
            <Panel title="Debates" icon="users">
              <ul className="agenda">
                {debates.map((d) => {
                  const choice = d.player_choices[current!.id];
                  return (
                    <li key={d.id} className="req">
                      <div>
                        <b>{d.outlet}</b>
                        <span className="mono">{fmtDate(d.scheduled_on)}</span>
                      </div>
                      {d.status === "REALIZADO" ? (
                        <Pill tone="ok">realizado</Pill>
                      ) : choice ? (
                        <Pill tone="sim">
                          {choice.theme} · {String(choice.stance).toLowerCase()}
                        </Pill>
                      ) : (
                        <Pill tone="warn">sem estratégia</Pill>
                      )}
                    </li>
                  );
                })}
              </ul>
              {debates.some((d) => d.status !== "REALIZADO" && !d.player_choices[current!.id]) && (
                <p className="muted small mt" style={{ marginBottom: 0 }}>
                  Defina a estratégia em “Definir estratégia para o próximo debate”, nas ações de campanha.
                </p>
              )}
            </Panel>
          )}

          {war && <Promises c={war.cand.campaign} />}

          {cands.length > 1 && (
            <Panel title="Candidaturas anteriores" icon="clock">
              <ol className="tline">
                {cands.slice(1).map((x) => (
                  <li key={x.id}>
                    <span className="tline__date mono">{x.election_id.replace(/\D/g, "").slice(0, 4) || "—"}</span>
                    <span>
                      <b>{OFFICES[x.office_code].name}</b> · {geoName(x.geo, { cities })} <Pill tone={STATUS[x.status]?.tone}>{STATUS[x.status]?.label ?? x.status}</Pill>
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
