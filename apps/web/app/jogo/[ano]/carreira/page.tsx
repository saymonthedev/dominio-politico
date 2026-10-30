import { ACHIEVEMENTS, AXES, AXIS_INFO, careerScore, ENTRY_CULTURE_LABEL, geoName, canonicalGeo, OFFICES, profession, type AffiliationRequestRow, type WorldEventRow } from "@dp/engine";
import { PartyMark } from "@/components/PartyMark";
import { ActionPanel } from "@/components/ActionPanel";
import { CareerTrack } from "@/components/game/CareerTrack";
import { Empty, GameHeader, Kpi, MeterRow, Panel, Pill } from "@/components/game/Page";
import { QuickAction } from "@/components/game/QuickAction";
import { StoryHistory } from "@/components/game/StoryHistory";
import { Icon } from "@/components/Icon";
import { PersonAvatar } from "@/components/PersonAvatar";
import { PartyChip, STAGE_LABEL } from "@/components/ui";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate, fmtMoney } from "@/lib/format";
import { careerSteps } from "@/lib/game-view";
import { getParties, getSession, partyMap, playerState, requireMe } from "@/lib/game";
import { citiesFor } from "@/lib/sim";

const EVENT_LABEL: Record<string, string> = {
  CHARACTER_CREATED: "Você entrou na vida pública",
  ACTION: "Ação",
  AFFILIATION_REQUESTED: "Pedido de filiação enviado",
  AFFILIATION_ACCEPTED: "Filiação aprovada",
  AFFILIATION_REJECTED: "Filiação recusada",
  PARTY_JOINED: "Filiação",
  PARTY_LEFT: "Desfiliação",
  TIME_ADVANCED: "Você passou o tempo",
};

const REQ_STATUS: Record<string, { label: string; tone: "ok" | "bad" | "warn" | "neutral" }> = {
  PENDENTE: { label: "aguardando", tone: "warn" },
  ACEITO: { label: "aceito", tone: "ok" },
  RECUSADO: { label: "recusado", tone: "bad" },
  EXPIRADO: { label: "expirado", tone: "neutral" },
  RETIRADO: { label: "retirado", tone: "neutral" },
};

function eventText(ev: WorldEventRow): string {
  const payload = ev.payload as { message?: string; days?: number };
  if (ev.type === "TIME_ADVANCED") return `Você passou o tempo: ${payload.days === 1 ? "1 dia" : `${payload.days ?? 0} dias`}`;
  return String(payload.message ?? EVENT_LABEL[ev.type] ?? ev.type.toLowerCase().replaceAll("_", " "));
}

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, parties, reqQ, evQ, cities] = await Promise.all([
    playerState(year),
    getParties(me.worldId),
    sb.from("affiliation_requests").select("*").eq("world_id", me.worldId).eq("person_id", me.person.id).order("created_on", { ascending: false }).limit(10),
    sb.from("world_events").select("*").eq("world_id", me.worldId).contains("actors", [me.person.id]).order("tick", { ascending: false }).limit(30),
    citiesFor(year),
  ]);
  const pm = partyMap(parties);
  const actions = actionsFor(state, me.person.id, ["BASE", "PARTIDO"]);
  const requests = (reqQ.data ?? []) as AffiliationRequestRow[];
  const events = (evQ.data ?? []) as WorldEventRow[];
  const st = me.state;
  const steps = careerSteps(state, me.person, st, year);
  const age = Number(state.world.game_date.slice(0, 4)) - me.person.birth_year;
  const score = careerScore(me.person, st);
  // mandatos exercidos e resultados das próprias candidaturas, do mais recente ao mais antigo
  const record = [
    ...[...state.t.mandates.values()]
      .filter((m) => m.person_id === me.person.id)
      .map((m) => ({ date: m.start_on, won: true, title: `${OFFICES[m.office_code].name} · ${geoName(m.geo, { cities })}`, detail: `${m.status === "FUTURO" ? "posse em" : "desde"} ${fmtDate(m.start_on)}${m.status === "ENCERRADO" ? ` até ${fmtDate(m.end_on)}` : m.status === "ATIVO" ? " · em exercício" : ""}` })),
    ...[...state.t.candidacies.values()]
      .filter((c) => c.person_id === me.person.id && ["ELEITO", "NAO_ELEITO", "SUPLENTE", "SEGUNDO_TURNO", "HOMOLOGADA", "INDEFERIDA"].includes(c.status))
      .map((c) => {
        const e = state.t.elections.get(c.election_id);
        const label = { ELEITO: "eleito(a)", NAO_ELEITO: "não eleito(a)", SUPLENTE: "suplente", SEGUNDO_TURNO: "no 2º turno", HOMOLOGADA: "em campanha", INDEFERIDA: "candidatura indeferida" }[c.status as string];
        return { date: e?.first_round ?? "", won: c.status === "ELEITO", title: `Eleição de ${e?.year ?? "?"}: ${OFFICES[c.office_code].name}`, detail: `${label}${c.votes ? ` · ${c.votes.toLocaleString("pt-BR")} votos` : ""}` };
      }),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const city = canonicalGeo(me.person.municipality);
  const place = /^\d{7}$/.test(city) ? geoName(city, { cities }) : me.person.uf;

  return (
    <>
      <GameHeader kicker="Você" icon="user" title="Minha carreira" lede="Seu personagem, suas ações e o caminho até o próximo degrau. Cada ação gasta energia; passe o tempo no Painel para recuperar." />

      <Panel className="mb">
        <div className="profile">
          <PersonAvatar name={me.person.name} color={me.party?.color} size={76} />
          <div className="profile__who">
            <h2>{me.person.name}</h2>
            <p>
              {profession(me.person.profession).label} · {age} anos · {place}
            </p>
            <div className="profile__tags">
              <Pill tone="gold">{STAGE_LABEL[me.person.stage]}</Pill>
              {me.party ? <PartyChip party={me.party} href={`/jogo/${year}/partidos/${me.party.id}`} /> : <Pill>Sem partido</Pill>}
            </div>
          </div>
          <div className="kpis profile__kpis">
            <Kpi icon="zap" label="Energia" value={`${Math.round(st.energy)}/100`} hint="+25 por dia" tone={st.energy < 20 ? "warn" : undefined} />
            <Kpi icon="coins" label="Caixa" value={fmtMoney(st.money)} hint={`renda ${fmtMoney(st.income_last_year / 12)}/mês`} />
            <Kpi icon="star" label="Reputação" value={Math.round(me.person.reputation)} />
          </div>
        </div>
        <div className="mt">
          <CareerTrack stage={me.person.stage} />
        </div>
      </Panel>

      <div className="ggrid ggrid--main">
        <div className="gstack">
          {steps.length > 0 && (
            <Panel title="Próximo degrau" icon="trending" tone="gold">
              <div className="steps3">
                {steps.map((s, i) => (
                  <div key={i} className="step3">
                    <div>
                      <b>{s.title}</b>
                      <p>{s.detail}</p>
                      {s.progress && <MeterRow label={s.progress.label} value={s.progress.value} max={s.progress.goal} goal={s.progress.goal} tone="gold" />}
                    </div>
                    <div className="step3__cta">
                      {s.action && <QuickAction year={year} action={s.action.id} params={s.action.params} label={s.action.label} tone="gold" icon="play" />}
                      {s.href && (
                        <a className="ui-btn ui-btn--ghost ui-btn--sm" href={s.href.to}>
                          <span>{s.href.label}</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="O que você pode fazer" icon="play">
            <ActionPanel year={year} actions={actions} />
          </Panel>

          <Panel title="Mandatos e eleições" icon="ballot">
            {record.length ? (
              <ul className="record">
                {record.map((r, i) => (
                  <li key={i} className={r.won ? "is-won" : ""}>
                    <b>{r.title}</b>
                    <span>{r.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="ballot" title="Nenhuma disputa ainda">
                Seus mandatos e candidaturas aparecem aqui, com o resultado de cada eleição.
              </Empty>
            )}
          </Panel>

          <div id="historia">
            <Panel title="Sua história" icon="zap">
              <StoryHistory log={st.story?.log ?? []} />
            </Panel>
          </div>

          <Panel title="Sua trajetória" icon="clock">
            {events.length ? (
              <ol className="tline">
                {events.map((ev) => (
                  <li key={ev.id}>
                    <span className="tline__date mono">{fmtDate(ev.game_date)}</span>
                    <span>{eventText(ev)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty icon="clock" title="Sua história começa agora" />
            )}
          </Panel>
        </div>

        <div className="gstack">
          <Panel title="Conquistas" icon="star" href={`/jogo/${year}/ranking`} hrefLabel={`${score} pontos · ranking`}>
            <ul className="achs">
              {ACHIEVEMENTS.map((a) => {
                const on = st.achievements?.[a.id];
                return (
                  <li key={a.id} className={on ? "is-on" : ""} title={a.text}>
                    <span className="achs__ico" aria-hidden="true">
                      <Icon name={a.icon} size={16} />
                    </span>
                    <span>
                      <b>{a.title}</b>
                      <small>{on ? `${fmtDate(on)} · +${a.points}` : a.text}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title="Indicadores" icon="chart">
            {st.story && <MeterRow label="Saúde" value={st.story.health} tone={st.story.health < 45 ? "bad" : "ok"} hint={st.story.health < 45 ? "o desgaste aumenta o risco de adoecer" : "cai com estresse, campanha e idade"} />}
            <MeterRow label="Reputação" value={me.person.reputation} tone="sim" />
            <MeterRow label="Visibilidade" value={me.person.visibility} />
            <MeterRow label={`Reconhecimento em ${me.person.uf}`} value={(st.reach[me.person.uf] ?? 0) * 100} hint="parte do eleitorado do estado que conhece você" />
            <MeterRow label="Ativismo" value={Math.min(100, st.activism)} goal={me.person.stage === "CIDADAO" ? 20 : undefined} />
            {me.party && <MeterRow label="Prestígio no partido" value={st.party_standing} goal={me.person.stage === "FILIADO" ? 45 : undefined} />}
            <MeterRow label="Capital político" value={st.political_capital} />
            <MeterRow label="Preparo para debates" value={st.debate_prep} />
            <MeterRow label="Escândalos" value={st.scandal} tone="bad" hint={st.scandal > 0 ? "quanto maior, mais difícil vencer eleições" : undefined} />
          </Panel>

          <Panel title="Pedidos e convites" icon="flag" href={`/jogo/${year}/partidos`} hrefLabel="Partidos">
            {requests.length ? (
              <div className="reqs">
                {requests.map((r) => (
                  <div key={r.id} className="req">
                    <div>
                      <b>
                        {r.kind === "CONVITE" ? "Convite do" : "Pedido ao"} <PartyChip party={pm[r.party_id]} />
                      </b>
                      <span>{r.reason ?? (r.status === "PENDENTE" ? `Resposta até ${fmtDate(r.decide_on)}` : fmtDate(r.created_on))}</span>
                    </div>
                    {r.kind === "CONVITE" && r.status === "PENDENTE" ? (
                      <div className="pend__actions">
                        <QuickAction year={year} action="responder_convite" params={{ request: r.id, decision: "ACEITAR" }} label="Aceitar" tone="gold" />
                        <QuickAction year={year} action="responder_convite" params={{ request: r.id, decision: "RECUSAR" }} label="Recusar" tone="ghost" />
                      </div>
                    ) : (
                      <Pill tone={REQ_STATUS[r.status]?.tone}>{REQ_STATUS[r.status]?.label ?? r.status}</Pill>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">{me.person.party_id ? "Nenhum pedido recente." : "Nenhum pedido ainda. Veja na página de partidos qual combina mais com você."}</p>
            )}
          </Panel>

          {me.party && (
            <Panel title="Seu partido" icon="flag" href={`/jogo/${year}/partidos/${me.party.id}`} hrefLabel="Abrir">
              <div className="myparty" style={{ ["--c" as string]: me.party.color }}>
                <PartyMark party={me.party} year={year} size={52} />
                <div>
                  <b>{me.party.name}</b>
                  <span>{ENTRY_CULTURE_LABEL[me.party.entry_culture]}</span>
                  <small className="mono">Filiado(a) desde {fmtDate(st.filiation_date)}</small>
                </div>
              </div>
            </Panel>
          )}

          <Panel title="Suas posições" icon="sliders">
            {AXES.map((ax) => (
              <div key={ax} className="axis">
                <div className="axis__top">
                  <b>{AXIS_INFO[ax].label}</b>
                  <span className="mono">{me.person.ideology[ax] > 0 ? `+${me.person.ideology[ax]}` : me.person.ideology[ax]}</span>
                </div>
                <div className="axis__bar">
                  <i />
                  <em style={{ left: `${(me.person.ideology[ax] + 100) / 2}%` }} />
                </div>
                <div className="axis__ends">
                  <span>{AXIS_INFO[ax].neg}</span>
                  <span>{AXIS_INFO[ax].pos}</span>
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}
