import {
  ENTRY_CULTURE_LABEL,
  foundingCost,
  formationGoals,
  formationProgress,
  OFFICES,
  partyFoundedBy,
  partyInFormationBy,
  performanceClause,
  signatureCost,
  spectrumLabel,
  UF_BY_CODE,
  UF_CODES,
  Ctx,
  type PartyRow,
} from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { Empty, GameHeader, Kpi, MeterRow, Panel, Pill } from "@/components/game/Page";
import { QuickAction } from "@/components/game/QuickAction";
import { Icon } from "@/components/Icon";
import { PartyMark } from "@/components/PartyMark";
import { PersonAvatar } from "@/components/PersonAvatar";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { daysBetween } from "@/lib/game-view";
import { getSession, requireMe } from "@/lib/game";
import { photoOf } from "@/lib/photos";
import { cachedState } from "@/lib/sim";

const short = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10} mil`.replace(".", ",") : fmtNum(n));

const STEPS = [
  { title: "Fundação", text: "Estatuto, programa e fundadores registrados em cartório, com o pagamento dos custos iniciais." },
  { title: "Apoiamento", text: "Dois anos para reunir assinaturas de eleitores: 0,5% dos votos válidos para a Câmara, com o mínimo em pelo menos nove estados." },
  { title: "Registro no TSE", text: "A Justiça Eleitoral confere as assinaturas (parte é invalidada) e julga o pedido em alguns meses." },
  { title: "Partido ativo", text: "Você preside a legenda: políticos pedem para entrar, você aprova, recusa e convida. O fundo partidário só vem com a cláusula de desempenho." },
];

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const state = await cachedState(me.worldId);
  const ctx = new Ctx(state, "view");
  const person = me.person;
  // o partido vem direto do banco: a coleta e o registro mudam a cada ação
  const { sb } = await getSession();
  const { data: own } = await sb.from("parties").select("*").eq("world_id", me.worldId).eq("founder_id", person.id);
  const ownParties = (own ?? []) as PartyRow[];
  const forming = ownParties.find((p) => p.status === "EM_FORMACAO") ?? partyInFormationBy(ctx, person.id);
  const founded = ownParties.find((p) => p.status === "ATIVO") ?? partyFoundedBy(ctx, person.id);
  const actions = actionsFor(state, person.id, ["MEU_PARTIDO"]);
  const today = state.world.game_date;

  if (!forming && !founded) {
    const goals = formationGoals();
    return (
      <>
        <GameHeader kicker="Você" icon="star" title="Meu partido" lede="Fundar um partido é o caminho mais longo e mais caro da política. Em troca, a legenda é sua: programa, cor, número e quem entra." />
        <Panel className="mb" tone="dark">
          <ol className="pfsteps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="pfsteps__n">{i + 1}</span>
                <b>{s.title}</b>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </Panel>
        <div className="ggrid ggrid--main">
          <Panel title="Fundar um partido" icon="flag">
            <ActionPanel year={year} actions={actions.filter((a) => a.id === "fundar_partido")} />
          </Panel>
          <div className="gstack">
            <Panel title="O que vai ser exigido" icon="info">
              <div className="kpis">
                <Kpi label="Custo inicial" value={fmtMoney(foundingCost(today))} hint="estatuto, advogados, registro" />
                <Kpi label="Assinaturas" value={fmtNum(goals.goal)} hint={`em ${goals.ufs_needed} estados, no mínimo`} />
                <Kpi label="Coleta paga" value={`${fmtMoney(signatureCost(today))}/apoio`} hint="ou mutirões de voluntários" />
                <Kpi label="Reputação mínima" value="25" hint={`a sua: ${Math.round(person.reputation)}`} tone={person.reputation < 25 ? "warn" : undefined} />
              </div>
            </Panel>
            {me.party && (
              <Panel title="Seu partido hoje" icon="flag">
                <p className="small" style={{ marginTop: 0 }}>
                  Você é do <b>{me.party.acronym}</b>. Ao registrar o novo partido você sai do atual
                  {person.office_code && OFFICES[person.office_code].system === "PROPORCIONAL" ? "; com mandato proporcional, fora da janela partidária a troca custa o mandato" : ""}.
                </p>
              </Panel>
            )}
          </div>
        </div>
      </>
    );
  }

  if (forming) {
    const f = forming.formation!;
    const prog = formationProgress(f);
    const left = daysBetween(today, f.deadline);
    return (
      <>
        <GameHeader kicker="Você · partido em formação" icon="star" title={forming.name} lede={`${forming.acronym} · nº ${forming.number} · ${spectrumLabel(forming.ideology)}. ${ENTRY_CULTURE_LABEL[forming.entry_culture]}`} />
        <Panel className="mb" tone="dark">
          <div className="ehero">
            <div>
              <div className="ehero__tags">
                <Pill tone={f.stage === "REGISTRO" ? "gold" : "sim"}>{f.stage === "REGISTRO" ? "registro em análise no TSE" : "coleta de apoio"}</Pill>
                {f.rejected > 0 && <Pill tone="warn">{fmtNum(f.rejected)} assinaturas invalidadas</Pill>}
              </div>
              <h2>
                {fmtNum(f.signatures)} de {fmtNum(f.goal)} apoios
              </h2>
              <p>
                {prog.ufsOk} de {prog.ufsNeeded} estados com o mínimo exigido. Gasto até aqui: {fmtMoney(f.spent)}.
              </p>
            </div>
            <div className="ehero__count">
              {f.stage === "REGISTRO" && f.registry_on ? (
                <>
                  <b>{Math.max(0, daysBetween(today, f.registry_on))}</b>
                  <span>dias para o julgamento do registro</span>
                </>
              ) : (
                <>
                  <b>{Math.max(0, left)}</b>
                  <span>dias até o fim do prazo ({fmtDate(f.deadline)})</span>
                </>
              )}
            </div>
          </div>
          <div className="pfbar" aria-label={`${Math.round(prog.pct * 100)}% da meta`}>
            <span style={{ width: `${prog.pct * 100}%` }} />
          </div>
        </Panel>

        <div className="ggrid ggrid--main">
          <div className="gstack">
            <Panel title="Coleta" icon="file">
              <ActionPanel year={year} actions={actions.filter((a) => ["coletar_assinaturas", "mobilizar_voluntarios", "desistir_fundacao"].includes(a.id))} />
            </Panel>
          </div>
          <Panel title="Apoio por estado" icon="map" aside={<span className="muted small">mínimo de 0,1% do eleitorado</span>}>
            <div className="ufgrid">
              {UF_CODES.map((uf) => {
                const n = f.by_uf[uf] ?? 0;
                const g = f.uf_goal[uf] ?? 1;
                const ok = n >= g;
                return (
                  <div key={uf} className={`ufcell${ok ? " is-ok" : ""}`} title={`${UF_BY_CODE[uf].name}: ${fmtNum(n)} de ${fmtNum(g)}`}>
                    <b>{uf}</b>
                    <i>
                      <em style={{ width: `${Math.min(100, (n / g) * 100)}%` }} />
                    </i>
                    <small className="mono">
                      {short(n)} / {short(g)}
                    </small>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </>
    );
  }

  const party = founded!;
  const members = [...state.t.persons.values()].filter((p) => p.party_id === party.id && p.status === "ACTIVE").sort((a, b) => Number(!!b.office_code) - Number(!!a.office_code) || b.reputation - a.reputation);
  const requests = [...state.t.affiliation_requests.values()].filter((r) => r.party_id === party.id && r.status === "PENDENTE");
  const clause = performanceClause(today);
  const fundOk = (party.seats.camara ?? 0) >= clause;
  const pending = party.formation?.founder_pending && person.party_id !== party.id;
  const topUfs = Object.entries(party.territory).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <>
      <div className="phero" style={{ ["--c" as string]: party.color }}>
        <PartyMark party={party} year={year} size={84} />
        <div className="phero__text">
          <div className="ghead__kicker">Você preside · nº {party.number}</div>
          <h1>{party.name}</h1>
          <div className="pcard__tags">
            <Pill>{spectrumLabel(party.ideology)}</Pill>
            <Pill tone="gold">fundado em {party.founded_on ? fmtDate(party.founded_on) : "—"}</Pill>
            {party.fund_suspended_until && party.fund_suspended_until > today && <Pill tone="bad">fundo suspenso até {fmtDate(party.fund_suspended_until)}</Pill>}
          </div>
        </div>
        <div className="phero__actions">
          <a className="ui-btn ui-btn--ghost ui-btn--sm" href={`/jogo/${year}/partidos/${party.id}`}>
            <span>Página pública</span>
          </a>
        </div>
      </div>

      {pending && (
        <div className="hint-band hint-band--danger">
          <Icon name="alert" size={18} />
          <span>Você fundou o partido mas ainda não se filiou: com mandato proporcional, fazer isso fora da janela partidária custa o mandato.</span>
        </div>
      )}

      <div className="kpis mb">
        <Kpi icon="users" label="Filiados" value={fmtNum(party.members)} hint={`${members.length} quadros conhecidos`} />
        <Kpi icon="coins" label="Caixa do partido" value={fmtMoney(party.cash)} />
        <Kpi icon="landmark" label="Deputados federais" value={party.seats.camara ?? 0} hint={`cláusula: ${clause}`} tone={fundOk ? "up" : undefined} />
        <Kpi icon="flag" label="Fundo partidário" value={fundOk ? "recebe" : "não recebe"} hint={fundOk ? "cota mensal" : `precisa de ${clause} deputados`} tone={fundOk ? "up" : "warn"} />
      </div>

      <div className="ggrid ggrid--main">
        <div className="gstack">
          <Panel title="Pedidos de filiação" icon="mail" tone={requests.some((r) => r.kind === "PEDIDO") ? "gold" : undefined}>
            {requests.length ? (
              <div className="reqs">
                {requests.map((r) => {
                  const who = state.t.persons.get(r.person_id);
                  if (!who) return null;
                  const from = who.party_id ? state.t.parties.get(who.party_id) : undefined;
                  return (
                    <div key={r.id} className="pend">
                      <div className="pend__text rel__who">
                        <PersonAvatar name={who.name} color={from?.color} photo={photoOf(who)} size={38} />
                        <div>
                          <b>
                            <a href={`/jogo/${year}/pessoa/${who.id}`}>{who.name}</a>
                          </b>
                          <span>
                            {who.office_code ? OFFICES[who.office_code].name : who.role_label ?? (who.kind === "PLAYER" ? "jogador(a)" : "político(a)")} · {from?.acronym ?? "sem partido"} · {who.uf}
                          </span>
                          <span>{r.kind === "CONVITE" ? `Convite seu, resposta até ${fmtDate(r.decide_on)}` : `${r.reason ?? "Quer entrar no partido."} Responda até ${fmtDate(r.decide_on)}.`}</span>
                        </div>
                      </div>
                      {r.kind === "PEDIDO" ? (
                        <div className="pend__actions">
                          <QuickAction year={year} action="decidir_filiacao" params={{ request: r.id, decision: "ACEITAR" }} label="Aprovar" tone="gold" icon="check" />
                          <QuickAction year={year} action="decidir_filiacao" params={{ request: r.id, decision: "RECUSAR" }} label="Recusar" tone="ghost" />
                        </div>
                      ) : (
                        <Pill tone="sim">convite enviado</Pill>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty icon="mail" title="Nenhum pedido agora">
                Políticos procuram partidos com afinidade, presença no estado e um presidente conhecido. Convide quem você quer por perto.
              </Empty>
            )}
          </Panel>
          <Panel title="Presidência" icon="play">
            <ActionPanel year={year} actions={actions.filter((a) => ["convidar_filiacao", "filiar_meu_partido"].includes(a.id))} />
          </Panel>
        </div>

        <div className="gstack">
          <Panel title="Quadros do partido" icon="users">
            {members.length ? (
              <div className="sugs">
                {members.slice(0, 24).map((m) => (
                  <a key={m.id} className="sug rel__who" href={`/jogo/${year}/pessoa/${m.id}`}>
                    <PersonAvatar name={m.name} color={party.color} photo={photoOf(m)} size={34} />
                    <div>
                      <b>{m.name}</b>
                      <span>
                        {m.id === person.id ? "presidente" : m.office_code ? OFFICES[m.office_code].name : m.role_label ?? "filiado(a)"} · {m.uf}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                Ainda sem quadros conhecidos.
              </p>
            )}
          </Panel>
          <Panel title="Onde o partido é forte" icon="map">
            {topUfs.length ? topUfs.map(([uf, v]) => <MeterRow key={uf} label={UF_BY_CODE[uf]?.name ?? uf} value={v * 100} />) : <p className="muted small">Sem presença relevante ainda.</p>}
          </Panel>
          <PartyNote party={party} />
        </div>
      </div>
    </>
  );
}

function PartyNote({ party }: { party: PartyRow }) {
  return (
    <Panel title="Como o partido cresce" icon="info">
      <ul className="rules">
        <li>
          <b>Entrada</b>
          <span>{ENTRY_CULTURE_LABEL[party.entry_culture]}</span>
        </li>
        <li>
          <b>Fidelidade</b>
          <span>Quem tem mandato de deputado ou vereador só troca de partido sem perder o cargo na janela partidária.</span>
        </li>
        <li>
          <b>Dinheiro</b>
          <span>O caixa vem de contribuições dos filiados e, depois de cumprir a cláusula de desempenho, do fundo partidário.</span>
        </li>
      </ul>
    </Panel>
  );
}
