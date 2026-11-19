import { cookies } from "next/headers";
import { addDays, electionNight, genderizeEvent, genderOf, missionsView, pendingOf, roundDue, roundView, stageTitle, startView, type EconomyRow, type NewsRow, type PartyRow, type StartStepId } from "@dp/engine";
import { CareerTrack } from "@/components/game/CareerTrack";
import { NewsList } from "@/components/game/NewsList";
import { Empty, GameHeader, Kpi, MeterRow, Panel, Pill } from "@/components/game/Page";
import { QuickAction } from "@/components/game/QuickAction";
import { Onboarding, type OnboardingStep } from "@/components/game/Onboarding";
import { actionsFor } from "@/lib/actions-view";
import { ApuracaoReplay } from "@/components/game/ApuracaoReplay";
import { UrnaCard } from "@/components/game/UrnaCard";
import { TimeMachine, type RoundInfo } from "@/components/game/TimeMachine";
import { StoryInbox } from "@/components/game/StoryCenter";
import { Icon } from "@/components/Icon";
import { PersonAvatar } from "@/components/PersonAvatar";
import { fmtDate, fmtDec, fmtMoney, fmtPct } from "@/lib/format";
import { agenda, careerSteps, pending, type Step } from "@/lib/game-view";
import { getSession, playerState, requireMe } from "@/lib/game";
import { photoOf } from "@/lib/photos";
import { worldClock } from "@/lib/sim";
import { openUrnaView } from "@/lib/urna";
import { Term } from "@/components/Term";

function delta(now: number, prev: number | undefined, digits = 2, invert = false) {
  if (prev === undefined) return { hint: undefined, tone: undefined };
  const d = now - prev;
  if (Math.abs(d) < 10 ** -digits / 2) return { hint: "estável", tone: undefined };
  const good = invert ? d < 0 : d > 0;
  return { hint: `${d > 0 ? "▲" : "▼"} ${fmtDec(Math.abs(d), digits)} p.p.`, tone: good ? ("up" as const) : ("down" as const) };
}

const daysSince = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

export default async function Painel({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, clockNow, newsQ, ecoQ] = await Promise.all([
    playerState(year),
    worldClock(me.worldId, me.person.id),
    sb.from("news_articles").select("*").eq("world_id", me.worldId).neq("outlet", "Rede social").order("tick", { ascending: false }).order("importance", { ascending: false }).limit(14),
    sb.from("economy_snapshots").select("*").eq("world_id", me.worldId).order("month", { ascending: false }).limit(2),
  ]);
  // o estado em cache pode estar alguns segundos atrás: o personagem vem do banco
  const meNow = state.t.persons.get(me.person.id) ?? me.person;
  const st = me.state;
  // mundo compartilhado: rodadas de 2 horas; dentro delas o jogador vive os próprios dias (pode estar à frente do mundo)
  const now = Date.now();
  const rv = clockNow.shared ? roundView(state, now) : null;
  const own = me.state.story?.personal;
  const ahead = !!rv && !!own && own.tick > state.world.tick;
  const myDate = ahead ? own!.date : state.world.game_date;
  const myTick = ahead ? own!.tick : state.world.tick;
  const round: RoundInfo | null = clockNow.shared
    ? {
        endsAt: rv?.endsAt ?? 0,
        night: rv?.night ?? false,
        worldDate: state.world.game_date,
        capDate: rv?.capDate ?? state.world.game_date,
        untilDate: rv?.untilDate ?? state.world.game_date,
        milestone: rv?.milestone?.label ?? null,
        // a rodada terminou e o mundo ainda está andando os dias dela (ou o mundo ainda está entrando nas rodadas)
        turning: !rv || roundDue(state.world, now),
        others: clockNow.others,
      }
    : null;
  const steps = careerSteps(state, me.person, st, year);
  const todo = pending(state, meNow, st);
  const cal = agenda(state, me.person, 7, myDate);
  const news = (newsQ.data ?? []) as NewsRow[];
  const [eco, prev] = (ecoQ.data ?? []) as EconomyRow[];
  const pres = state.world.gov.president_id ? state.t.persons.get(state.world.gov.president_id) : undefined;
  const presParty = pres?.party_id ? state.t.parties.get(pres.party_id) : undefined;
  const parties = [...state.t.parties.values()].filter((p) => (p.seats.camara ?? 0) > 0).sort((a, b) => (b.seats.camara ?? 0) - (a.seats.camara ?? 0));
  const top = parties.slice(0, 8);
  const others = parties.slice(8).reduce((s, p) => s + (p.seats.camara ?? 0), 0);
  const firstName = me.person.name.split(" ")[0];
  const pendCount = todo.invites.length + todo.offers.length + todo.investigations + todo.partyRequests.length;
  // com as travas de agora (dinheiro e energia mudam depois que o acontecimento chega)
  const g = genderOf(meNow);
  const storyPending = pendingOf(state, meNow, me.state).map((ev) => genderizeEvent(ev, g));
  // missões da semana do jogador (no dia dele, nas rodadas do mundo compartilhado)
  const missions = missionsView(meNow, st, myDate);

  // missões de início (primeiros passos com recompensa): o motor diz o que já foi cumprido e paga na ação
  const tutorialOff = (await cookies()).get(`dp_tutorial_${year}`)?.value === "off";
  const base = `/jogo/${year}`;
  const startMap = new Map(startView(me.person, me.state, myTick).map((x) => [x.id, x]));
  const startOf = (id: StartStepId) => ({ done: startMap.get(id)?.done ?? false, reward: startMap.get(id)?.reward });
  // pré-candidatura: só no período de pré-campanha da próxima eleição (e com partido)
  const nextVote = [...state.t.elections.values()].filter((e) => e.status !== "ENCERRADA").sort((a, b) => a.year - b.year)[0];
  const preOpen = !!nextVote && (nextVote.status === "PRE_CAMPANHA" || nextVote.status === "CONVENCOES") && myDate < nextVote.calendar.conventionEnd;
  const preText = !nextVote
    ? "Na pré-campanha, peça ao partido para disputar um cargo. A convenção decide entre você e os outros nomes."
    : preOpen
      ? me.person.party_id
        ? `A pré-campanha da eleição de ${nextVote.year} está aberta até ${fmtDate(nextVote.calendar.conventionEnd)}: peça ao partido para disputar um cargo. A convenção decide entre você e os outros nomes.`
        : `A pré-campanha da eleição de ${nextVote.year} está aberta, mas só quem é filiado pode se lançar. Entre num partido antes.`
      : `A pré-campanha da eleição de ${nextVote.year} abre em ${fmtDate(nextVote.calendar.preCampaignStart)}. Até lá, ganhe espaço no partido: na convenção vence quem tem mais apoio.`;
  const onboarding: OnboardingStep[] = [
    {
      id: "energia",
      title: "Gaste energia numa ação",
      term: "Energia",
      text: "Cada ação da carreira custa energia, que volta 25 pontos por dia de jogo. Comece por um evento comunitário.",
      href: `${base}/carreira`,
      cta: "Escolher uma ação",
      ...startOf("energia"),
    },
    {
      id: "reuniao",
      title: "Vá a uma reunião aberta de partido",
      text: "É o jeito mais rápido de sair do anonimato: você conhece as lideranças locais e passa a ser notado(a) pelos partidos. Está nas ações da Carreira.",
      href: `${base}/carreira`,
      cta: "Ir à reunião",
      ...startOf("reuniao"),
    },
    {
      id: "partido",
      title: "Entre num partido",
      text: "Sem partido não há candidatura. Compare afinidade e chance de aprovação de cada legenda, peça filiação e passe o tempo: o partido responde em alguns dias.",
      href: `${base}/partidos`,
      cta: "Comparar partidos",
      ...startOf("partido"),
    },
    {
      id: "tempo",
      title: "Passe o tempo",
      text: round
        ? "Neste mundo o tempo anda em rodadas de 2 horas. Em cada rodada você vive os seus dias aqui no Painel, no seu ritmo, até 2 meses de jogo (1 semana nas rodadas da madrugada). Quando as 2 horas acabam, o mundo anda para todos e os dias que você não viveu ficam para trás."
        : "Neste mundo só seu, o tempo para enquanto você não joga. Avance dias aqui no Painel e veja o que aconteceu no Brasil.",
      href: `${base}#tempo`,
      cta: "Ir para o relógio",
      ...startOf("tempo"),
    },
    {
      id: "acontecimento",
      title: "Responda a um acontecimento",
      term: "Acontecimento",
      text: "Com o passar do tempo, a vida acontece: convites, crises, propostas. Eles aparecem no ícone de raio do topo e no relógio do Painel. Escolha como reagir; cada escolha tem consequências.",
      href: `${base}#tempo`,
      cta: "Ir para o relógio",
      ...startOf("acontecimento"),
    },
    {
      id: "mes",
      title: "Acompanhe o fechamento do mês",
      term: "Fechamento do mês",
      text: "No dia 1 o jogo fecha suas contas: salário, impostos, custo de vida e rendimentos. O extrato fica em Finanças.",
      href: `${base}/financas`,
      cta: "Abrir Finanças",
      ...startOf("mes"),
    },
    {
      id: "pre",
      title: "Lance a pré-candidatura",
      term: "Pré-candidatura",
      text: preText,
      href: `${base}/carreira`,
      cta: preOpen && me.person.party_id ? "Lançar pré-candidatura" : "Ver a carreira",
      ...startOf("pre"),
    },
  ];

  // votação nas últimas semanas: o resultado fica no Painel, com a apuração para ver (ou rever)
  const today = state.world.game_date;
  const lastVote = [...state.t.elections.values()]
    .flatMap((e) => [{ e, d: e.first_round }, { e, d: e.runoff }])
    .filter(({ d }) => d <= today && daysSince(d, today) <= 45)
    .sort((a, b) => b.d.localeCompare(a.d))[0];
  const replay = lastVote ? electionNight(state, me.person.id, addDays(lastVote.d, -1), lastVote.d) : [];
  // semana da votação: a urna simbólica abre para o voto do jogador (sugestão do Rian Andrade)
  const urna = openUrnaView(state, me.person.id, myDate);

  // o que cai hoje já começou: o próximo marco é o seguinte
  const nextMark = (() => {
    const n = cal.find((x) => x.days >= 1);
    return n ? { label: n.title, date: n.date } : null;
  })();
  const todayMarks = cal.filter((x) => x.days === 0).map((x) => x.title);
  // época de eleição: ações que dá para agendar nos dias que vão passar
  const schedulable = actionsFor(state, me.person.id, ["PARTIDO", "CAMPANHA"]).filter(
    (a) => !a.reason && (a.id === "pre_candidatura" || a.category === "CAMPANHA") && a.params.every((p) => p.optional || (p.options?.length ?? 0) > 0),
  );

  return (
    <>
      <GameHeader kicker="Painel" icon="home" title={`Olá, ${firstName}`} lede={`${stageTitle(me.person.stage, g)}${me.party ? ` do ${me.party.acronym}` : ""}, ${Number(myDate.slice(0, 4)) - me.person.birth_year} anos. Veja o que fazer agora, passe o tempo e acompanhe o país.`}>
        <a className="ui-btn ui-btn--gold" href={`/jogo/${year}/carreira`}>
          <Icon name="play" size={16} /> <span>Agir na carreira</span>
        </a>
      </GameHeader>

      {!tutorialOff && <Onboarding year={year} steps={onboarding} />}

      {urna && <UrnaCard urna={urna} today={myDate} />}
      {replay.length > 0 && lastVote && <ApuracaoReplay list={replay} year={lastVote.e.year} />}

      <div id="tempo" className="mb">
        <TimeMachine year={year} date={myDate} energy={me.state.energy} next={nextMark} today={todayMarks} pending={storyPending} agenda={schedulable} round={round} />
      </div>

      <div className="ggrid ggrid--main">
        <div className="gstack">
          <Panel title="Seu momento" icon="star" tone="dark">
            <CareerTrack stage={me.person.stage} dark />
            <div className="steps2">
              {steps.map((s, i) => (
                <StepCard key={i} step={s} year={year} first={i === 0} />
              ))}
            </div>
          </Panel>

          <Panel className="pn-news" title="Manchetes" icon="newspaper" href={`/jogo/${year}/noticias`} hrefLabel="Todas as notícias">
            {news.length ? <NewsList news={news.slice(0, 8)} compact lead /> : <Empty icon="newspaper" title="O noticiário ainda está sendo impresso" />}
          </Panel>
        </div>

        <div className="gstack">
          <Panel className={storyPending.length ? undefined : "is-empty-m"} title={<Term k="Acontecimento">Acontecimentos</Term>} icon="zap" tone={storyPending.some((e) => e.blocking) ? "gold" : undefined} aside={storyPending.length ? <Pill tone="gold">{storyPending.length}</Pill> : undefined} href={`/jogo/${year}/carreira#historia`} hrefLabel="Histórico">
            <StoryInbox year={year} events={storyPending} today={myDate} />
          </Panel>

          <Panel title="Missões da semana" icon="flag" aside={missions.all ? <Pill tone="ok">semana completa</Pill> : <span className="muted small">{missions.items.filter((x) => x.done).length} de {missions.items.length}</span>}>
            <ul className="missions">
              {missions.items.map((x) => (
                <li key={x.id} className={x.done ? "is-done" : undefined}>
                  <div>
                    <b>{x.label}</b>
                    <small>
                      {x.done ? "Cumprida" : `${x.count} de ${x.goal}`} · +{x.reward.energy} de energia{x.reward.capital ? `, +${x.reward.capital} de capital político` : ""}
                    </small>
                  </div>
                  <i aria-hidden="true">
                    <em style={{ width: `${Math.round((x.count / x.goal) * 100)}%` }} />
                  </i>
                </li>
              ))}
            </ul>
            <p className="muted small" style={{ margin: "8px 0 0" }}>Cumprindo as três, você ganha +1 de reputação. As missões trocam a cada semana do jogo.</p>
          </Panel>

          <Panel className={pendCount ? undefined : "is-empty-m"} title="Pendências" icon="inbox" tone={pendCount ? "gold" : undefined} aside={pendCount ? <Pill tone="gold">{pendCount}</Pill> : undefined}>
            {todo.invites.map((inv) => (
              <div key={inv.id} className="pend">
                <div className="pend__text">
                  <b>
                    Convite do <PartyDot party={inv.party} />
                  </b>
                  <span>{inv.reason ?? "Convite de filiação"} · vale {inv.days} dias</span>
                </div>
                <div className="pend__actions">
                  <QuickAction year={year} action="responder_convite" params={{ request: inv.id, decision: "ACEITAR" }} label="Aceitar" tone="gold" icon="check" />
                  <QuickAction year={year} action="responder_convite" params={{ request: inv.id, decision: "RECUSAR" }} label="Recusar" tone="ghost" />
                </div>
              </div>
            ))}
            {todo.requests.map((r) => (
              <div key={r.id} className="pend">
                <div className="pend__text">
                  <b>
                    Pedido de filiação ao <PartyDot party={r.party} />
                  </b>
                  <span>Resposta até {fmtDate(r.until)} ({r.days} dias)</span>
                </div>
              </div>
            ))}
            {todo.offers.map((o) => (
              <div key={o.id} className="pend pend--bad">
                <div className="pend__text">
                  <b>
                    {o.kind} de {fmtMoney(o.amount)}
                  </b>
                  <span>Oferecido por {o.from}. Aceitar, recusar ou denunciar?</span>
                </div>
                <a className="ui-btn ui-btn--danger ui-btn--sm" href={`/jogo/${year}/esquemas`}>
                  <span>Decidir</span>
                </a>
              </div>
            ))}
            {todo.investigations > 0 && (
              <div className="pend pend--bad">
                <div className="pend__text">
                  <b>{todo.investigations === 1 ? "Uma investigação contra você" : `${todo.investigations} investigações contra você`}</b>
                  <span>Contrate defesa e acompanhe as provas.</span>
                </div>
                <a className="ui-btn ui-btn--ghost ui-btn--sm" href={`/jogo/${year}/investigacoes`}>
                  <span>Ver</span>
                </a>
              </div>
            )}
            {todo.partyRequests.map((r) => (
              <div key={r.id} className="pend">
                <div className="pend__text">
                  <b>{r.name} quer entrar no seu partido</b>
                  <span>
                    {r.role} · responda até {fmtDate(r.until)}
                  </span>
                </div>
                <div className="pend__actions">
                  <QuickAction year={year} action="decidir_filiacao" params={{ request: r.id, decision: "ACEITAR" }} label="Aprovar" tone="gold" icon="check" />
                  <QuickAction year={year} action="decidir_filiacao" params={{ request: r.id, decision: "RECUSAR" }} label="Recusar" tone="ghost" />
                </div>
              </div>
            ))}
            {todo.founding && (
              <div className="pend">
                <div className="pend__text">
                  <b>Fundação do {todo.founding.acronym}: {Math.round(todo.founding.pct * 100)}% dos apoios</b>
                  <span>{todo.founding.days} dias até o fim do prazo de coleta</span>
                </div>
                <a className="ui-btn ui-btn--ghost ui-btn--sm" href={`/jogo/${year}/meu-partido`}>
                  <span>Acompanhar</span>
                </a>
              </div>
            )}
            {!todo.invites.length && !todo.requests.length && !todo.offers.length && !todo.investigations && !todo.partyRequests.length && !todo.founding && <p className="muted small">Nada esperando por você agora.</p>}
          </Panel>

          <Panel title="Agenda" icon="calendar" href={`/jogo/${year}/eleicoes`} hrefLabel="Calendário">
            {cal.length ? (
              <ul className="agenda">
                {cal.map((a, i) => (
                  <li key={i} className={`agenda__item agenda__item--${a.tone}`}>
                    <span className="agenda__days">
                      <b>{a.days === 0 ? "hoje" : a.days}</b>
                      {a.days > 0 && <small>{a.days === 1 ? "dia" : "dias"}</small>}
                    </span>
                    <div>
                      <b>{a.term ? <Term k={a.term}>{a.title}</Term> : a.title}</b>
                      <span>
                        {fmtDate(a.date)} · {a.detail}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Sem datas marcadas.</p>
            )}
          </Panel>

          <Panel title="Brasil hoje" icon="landmark" href={`/jogo/${year}/economia`} hrefLabel="Economia">
            {pres && (
              <div className="presbox">
                <PersonAvatar name={pres.name} color={presParty?.color} photo={photoOf(pres)} size={44} />
                <div>
                  <small>Presidência</small>
                  <b>
                    <a href={`/jogo/${year}/pessoa/${pres.id}`}>{pres.name}</a>
                  </b>
                  <span>{presParty?.acronym ?? ""}</span>
                </div>
              </div>
            )}
            <MeterRow label="Aprovação do governo" value={state.world.gov.approval} tone={state.world.gov.approval >= 50 ? "ok" : state.world.gov.approval < 35 ? "bad" : undefined} />
            {eco && (
              <div className="kpis mt">
                <Kpi label="Selic" value={fmtPct(eco.selic, 2)} {...delta(eco.selic, prev?.selic, 2, true)} />
                <Kpi label="IPCA 12m" value={fmtPct(eco.inflation_12m)} {...delta(eco.inflation_12m, prev?.inflation_12m, 1, true)} />
                <Kpi label="Desemprego" value={fmtPct(eco.unemployment)} {...delta(eco.unemployment, prev?.unemployment, 1, true)} />
                <Kpi label="PIB (ritmo)" value={fmtPct(eco.gdp_growth)} {...delta(eco.gdp_growth, prev?.gdp_growth, 1)} />
              </div>
            )}
          </Panel>

          <Panel title="Câmara dos Deputados" icon="users" href={`/jogo/${year}/partidos`} hrefLabel="Partidos">
            <div className="seatbar" aria-label="Composição da Câmara">
              {top.map((p) => (
                <span key={p.id} style={{ flex: p.seats.camara, background: p.color }} title={`${p.acronym}: ${p.seats.camara}`} />
              ))}
              {others > 0 && <span style={{ flex: others, background: "var(--linha)" }} title={`Outros: ${others}`} />}
            </div>
            <div className="seatlegend">
              {top.map((p) => (
                <a key={p.id} href={`/jogo/${year}/partidos/${p.id}`}>
                  <i className="dot" style={{ background: p.color }} />
                  {p.acronym} <b className="mono">{p.seats.camara}</b>
                </a>
              ))}
              {others > 0 && (
                <span>
                  <i className="dot" style={{ background: "var(--linha)" }} />
                  outros <b className="mono">{others}</b>
                </span>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function PartyDot({ party }: { party: PartyRow }) {
  return (
    <span className="pdot">
      <i className="dot" style={{ background: party.color }} />
      {party.acronym}
    </span>
  );
}

function StepCard({ step, year, first }: { step: Step; year: number; first: boolean }) {
  return (
    <div className={`step2${first ? " step2--main" : ""}`}>
      <div className="step2__text">
        <b>{step.title}</b>
        <p>{step.detail}</p>
        {step.progress && (
          <div className="step2__progress">
            <MeterRow label={step.progress.label} value={step.progress.value} max={step.progress.goal} goal={step.progress.goal} tone="gold" />
          </div>
        )}
      </div>
      <div className="step2__cta">
        {step.action && <QuickAction year={year} action={step.action.id} params={step.action.params} label={step.action.label} tone={first ? "gold" : "on-dark"} icon="play" />}
        {step.href && (
          <a className={`ui-btn ui-btn--sm ${first && !step.action ? "ui-btn--gold" : "ui-btn--on-dark"}`} href={step.href.to}>
            <span>{step.href.label}</span> <Icon name="arrow" size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
