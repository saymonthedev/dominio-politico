import { OFFICES, geoName, type BillRow, type MandateRow, type PolicyRow } from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { Empty, GameHeader, Kpi, MeterRow, Panel, Pill } from "@/components/game/Page";
import { QuickAction } from "@/components/game/QuickAction";
import { PersonAvatar } from "@/components/PersonAvatar";
import { PartyChip } from "@/components/ui";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate, fmtPct } from "@/lib/format";
import { daysBetween } from "@/lib/game-view";
import { getParties, getSession, partyMap, playerState, requireMe } from "@/lib/game";
import { photoOf } from "@/lib/photos";
import { citiesFor } from "@/lib/sim";

const MANDATE: Record<string, { label: string; tone: "ok" | "gold" | "neutral" }> = {
  ATIVO: { label: "mandato em curso", tone: "ok" },
  FUTURO: { label: "posse marcada", tone: "gold" },
  ENCERRADO: { label: "encerrado", tone: "neutral" },
};

const POLICY: Record<string, { label: string; tone: "ok" | "bad" | "warn" | "neutral" }> = {
  EM_ANDAMENTO: { label: "em andamento", tone: "warn" },
  CONCLUIDA: { label: "concluída", tone: "ok" },
  ATRASADA: { label: "atrasada", tone: "bad" },
  CANCELADA: { label: "cancelada", tone: "neutral" },
};

const VOTE_LABEL = { SIM: "sim", NAO: "não", ABSTENCAO: "abstenção" } as const;

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const cities = await citiesFor(year);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, parties, bQ, mQ, pQ] = await Promise.all([
    playerState(year),
    getParties(me.worldId),
    sb.from("bills").select("*").eq("world_id", me.worldId).order("vote_on", { ascending: false }).limit(20),
    sb.from("mandates").select("*").eq("world_id", me.worldId).eq("person_id", me.person.id).order("start_on", { ascending: false }),
    sb.from("policies").select("*").eq("world_id", me.worldId).eq("owner_person_id", me.person.id).order("started_on", { ascending: false }),
  ]);
  const today = state.world.game_date;
  const gov = state.world.gov;
  const pm = partyMap(parties);
  const bills = (bQ.data ?? []) as BillRow[];
  const open = bills.filter((b) => b.status === "TRAMITANDO").sort((a, b) => a.vote_on.localeCompare(b.vote_on));
  const done = bills.filter((b) => b.status !== "TRAMITANDO");
  const mandates = (mQ.data ?? []) as MandateRow[];
  const policies = (pQ.data ?? []) as PolicyRow[];
  const actions = actionsFor(state, me.person.id, ["MANDATO"]);
  const canVote = actions.some((a) => a.id === "votar_projeto" && !a.reason);
  const base = parties.filter((p) => gov.base_party_ids.includes(p.id));
  const baseSeats = base.reduce((s, p) => s + (p.seats.camara ?? 0), 0);
  const bench = [...parties].filter((p) => (p.seats.camara ?? 0) > 0).sort((a, b) => (b.seats.camara ?? 0) - (a.seats.camara ?? 0));
  const pres = gov.president_id ? state.t.persons.get(gov.president_id) : undefined;
  const presParty = pres?.party_id ? pm[pres.party_id] : undefined;
  const fiscal = gov.fiscal_stance > 0.1 ? "expansionista" : gov.fiscal_stance < -0.1 ? "contracionista" : "neutra";
  const active = mandates.find((m) => m.status === "ATIVO") ?? mandates.find((m) => m.status === "FUTURO");

  return (
    <>
      <GameHeader kicker="O país" icon="landmark" title="Governo e Congresso" lede="Quem governa, a força da base na Câmara e o que está em votação. Com mandato, é aqui que você vota, propõe e fiscaliza." />

      <div className="kpis mb">
        <Kpi icon="star" label="Aprovação do governo" value={fmtPct(gov.approval, 0)} tone={gov.approval < 35 ? "warn" : undefined} />
        <Kpi icon="users" label="Base na Câmara" value={`${baseSeats} / 513`} hint={baseSeats >= 257 ? "maioria simples" : "sem maioria"} tone={baseSeats >= 257 ? "up" : "down"} />
        <Kpi icon="coins" label="Postura fiscal" value={fiscal} />
        <Kpi icon="ballot" label="Projetos em pauta" value={open.length} />
      </div>

      <div className="ggrid ggrid--main">
        <div className="gstack">
          {active ? (
            <Panel tone="dark">
              <div className="ehero">
                <div>
                  <div className="ehero__tags">
                    <Pill tone={MANDATE[active.status].tone}>{MANDATE[active.status].label}</Pill>
                  </div>
                  <h2>
                    {OFFICES[active.office_code].name} · {geoName(active.geo, { cities })}
                  </h2>
                  <p className="mono">
                    {fmtDate(active.start_on)} → {fmtDate(active.end_on)}
                  </p>
                </div>
                <div className="ehero__count">
                  {active.status === "FUTURO" ? (
                    <>
                      <b>{daysBetween(today, active.start_on)}</b>
                      <span>dias para a posse</span>
                    </>
                  ) : (
                    <>
                      <b>{daysBetween(today, active.end_on)}</b>
                      <span>dias de mandato pela frente</span>
                    </>
                  )}
                </div>
              </div>
            </Panel>
          ) : (
            <Panel>
              <Empty icon="landmark" title="Você ainda não tem mandato">
                Ações de governo e de plenário liberam depois da posse. Até lá, acompanhe a pauta e a correlação de forças.
              </Empty>
            </Panel>
          )}

          {actions.length > 0 && active && (
            <Panel title="Ações de mandato" icon="play">
              <ActionPanel year={year} actions={actions} />
            </Panel>
          )}

          <Panel title="Em votação" icon="ballot" aside={<span className="muted small">Câmara dos Deputados</span>}>
            {open.length ? (
              <div className="bills">
                {open.map((b) => {
                  const myVote = b.player_votes[me.person.id];
                  const author = b.author_party_id ? pm[b.author_party_id] : undefined;
                  return (
                    <article key={b.id} className="bill">
                      <div className="bill__head">
                        <b>{b.title}</b>
                        <span className="mono">vota em {fmtDate(b.vote_on)}</span>
                      </div>
                      <p>{b.summary}</p>
                      <div className="bill__foot">
                        <span className="pcard__tags">
                          {author && <PartyChip party={author} />}
                          <Pill tone={b.gov_position > 0 ? "ok" : b.gov_position < 0 ? "bad" : "neutral"}>
                            governo {b.gov_position > 0 ? "a favor" : b.gov_position < 0 ? "contra" : "liberou"}
                          </Pill>
                          {myVote && <Pill tone="gold">seu voto: {VOTE_LABEL[myVote]}</Pill>}
                        </span>
                        {canVote && (
                          <span className="pend__actions">
                            <QuickAction year={year} action="votar_projeto" params={{ bill: b.id, vote: "SIM" }} label="Sim" tone={myVote === "SIM" ? "gold" : "ghost"} />
                            <QuickAction year={year} action="votar_projeto" params={{ bill: b.id, vote: "NAO" }} label="Não" tone={myVote === "NAO" ? "gold" : "ghost"} />
                            <QuickAction year={year} action="votar_projeto" params={{ bill: b.id, vote: "ABSTENCAO" }} label="Abster" tone={myVote === "ABSTENCAO" ? "gold" : "ghost"} />
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty icon="ballot" title="Nenhum projeto em pauta agora">
                Novos projetos entram na pauta com o passar das semanas.
              </Empty>
            )}
          </Panel>

          {done.length > 0 && (
            <Panel title="Votações recentes" icon="clock">
              <div className="bills">
                {done.map((b) => {
                  const total = b.votes.yes + b.votes.no + b.votes.abstain || 1;
                  return (
                    <article key={b.id} className="bill bill--done">
                      <div className="bill__head">
                        <b>{b.title}</b>
                        <Pill tone={b.status === "APROVADO" ? "ok" : "bad"}>{b.status === "APROVADO" ? "aprovado" : "rejeitado"}</Pill>
                      </div>
                      <div className="vote-split" aria-label={`${b.votes.yes} sim, ${b.votes.no} não, ${b.votes.abstain} abstenções`}>
                        <span className="y" style={{ flex: b.votes.yes / total }} />
                        <span className="n" style={{ flex: b.votes.no / total }} />
                        <span className="a" style={{ flex: b.votes.abstain / total }} />
                      </div>
                      <small className="mono muted">
                        {b.votes.yes} sim · {b.votes.no} não · {b.votes.abstain} abst. · {fmtDate(b.vote_on)}
                      </small>
                    </article>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>

        <div className="gstack">
          {pres && (
            <Panel title="Presidência" icon="flag">
              <a className="presbox" href={`/jogo/${year}/pessoa/${pres.id}`} style={{ textDecoration: "none" }}>
                <PersonAvatar name={pres.name} color={presParty?.color} photo={photoOf(pres)} size={52} />
                <div>
                  <b style={{ color: "var(--tinta)" }}>{pres.name}</b>
                  <span>{presParty ? `${presParty.acronym} · ` : ""}aprovação de {fmtPct(gov.approval, 0)}</span>
                </div>
              </a>
              <MeterRow label="Aprovação" value={gov.approval} tone={gov.approval >= 40 ? "ok" : "bad"} goal={50} />
            </Panel>
          )}

          <Panel title="Base do governo" icon="users">
            <div className="seatbar" aria-label="Base e demais bancadas">
              {bench.map((p) => (
                <span
                  key={p.id}
                  style={{ flex: p.seats.camara ?? 0, background: gov.base_party_ids.includes(p.id) ? p.color : "var(--rebaixada)" }}
                  title={`${p.acronym}: ${p.seats.camara}`}
                />
              ))}
            </div>
            <p className="muted small">
              {baseSeats} de 513 deputados ({fmtPct((baseSeats / 513) * 100, 0)}). Maioria simples: 257; emenda constitucional: 308.
            </p>
            <div className="pcard__tags">
              {base.map((p) => (
                <PartyChip key={p.id} party={p} href={`/jogo/${year}/partidos/${p.id}`} />
              ))}
            </div>
          </Panel>

          {policies.length > 0 && (
            <Panel title="Suas políticas" icon="briefcase">
              <ul className="agenda">
                {policies.map((p) => (
                  <li key={p.id} className="req">
                    <div>
                      <b>{p.title}</b>
                      <span className="mono">
                        {fmtDate(p.started_on)} → {fmtDate(p.completes_on)}
                      </span>
                    </div>
                    <Pill tone={POLICY[p.status]?.tone}>{POLICY[p.status]?.label ?? p.status}</Pill>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Bancadas" icon="landmark">
            <div className="benches">
              {bench.map((p) => (
                <a key={p.id} href={`/jogo/${year}/partidos/${p.id}`} className="bench" style={{ ["--c" as string]: p.color }}>
                  <span className="bench__name">{p.acronym}</span>
                  <i>
                    <em style={{ width: `${((p.seats.camara ?? 0) / (bench[0]?.seats.camara || 1)) * 100}%` }} />
                  </i>
                  <b className="mono">{p.seats.camara}</b>
                  <small className="mono">{p.seats.senado ?? 0} sen.</small>
                </a>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
