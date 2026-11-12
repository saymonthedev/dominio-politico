"use client";
import { InviteActions } from "./InviteActions";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Apuracao as ApuracaoData, DayDigest, StoryDelta, StoryEvent } from "@dp/engine";
import { advanceDays, careerEndSummary, quickAction } from "@/app/jogo/actions";
import { publishVitals } from "./live-vitals";
import type { ActionView } from "@/lib/actions-view";
import { inviteIdOf, resolveLink } from "@/lib/links";
import type { CareerEndView, CountrySnapshot, DecideResult, FastForwardResult, StepAdvanceResult } from "@/lib/sim";
import { useModal } from "../a11y";
import { Button } from "../forms";
import { Icon } from "../Icon";
import { DeltaChips } from "./ActionFx";
import { Apuracao } from "./Apuracao";
import { CareerEndModal } from "./CareerEnd";
import { EventModal } from "./EventModal";
import { NEWS_CATEGORIES } from "./NewsList";
import { Planner, type PlannedAction } from "./Planner";
import { dayShort, KIND, TAG } from "./story-ui";
import { useToast } from "./Toaster";

const DAY = 86_400_000;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAY = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const STAGE: Record<string, string> = {
  CIDADAO: "Cidadão(ã)", ATIVISTA: "Ativista", APROXIMACAO: "Aproximação partidária", FILIADO: "Filiado(a)", QUADRO: "Quadro partidário",
  PRE_CANDIDATO: "Pré-candidato(a)", CANDIDATO: "Candidato(a)", MANDATO: "Em mandato",
};

const OPTIONS = [
  { days: 1, label: "1 dia", hint: "um passo de cada vez" },
  { days: 7, label: "1 semana", hint: "a semana dia a dia" },
  { days: 15, label: "15 dias", hint: "meio mês de vida" },
  { days: 30, label: "1 mês", hint: "o mês inteiro, com pausas" },
];

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY);
const short = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
const shortIso = (iso?: string) => (iso ? short(new Date(`${iso}T12:00:00Z`)) : "");
const longIso = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const num = (v: number, d = 1) => v.toFixed(d).replace(".", ",");

export interface TimeMachineProps {
  year: number;
  date: string;
  energy: number;
  /** próximo compromisso da agenda, para orientar o salto */
  next?: { label: string; date: string } | null;
  /** acontecimentos esperando resposta */
  pending?: StoryEvent[];
  /** marcos do calendário que caem hoje (já começaram) */
  today?: string[];
  /** ações que dá para agendar no período (época de eleição: pré-candidatura e campanha) */
  agenda?: ActionView[];
  /** mundo compartilhado: a rodada de 2 horas em que o jogador vive os próprios dias */
  round?: RoundInfo | null;
}

/** Rodada de 2 horas do mundo compartilhado, para a tela. */
export interface RoundInfo {
  /** quando a rodada termina (hora real, ms) */
  endsAt: number;
  /** madrugada: rodada de 1 semana */
  night: boolean;
  /** dia em que o mundo está (onde a rodada começou) */
  worldDate: string;
  /** último dia que dá para viver nesta rodada */
  capDate: string;
  /** dia a que o mundo chega na virada */
  untilDate: string;
  /** marco do calendário em que a rodada termina */
  milestone: string | null;
  /** a rodada terminou e o mundo está andando os dias dela */
  turning: boolean;
  /** outros jogadores que jogaram nas últimas 72 h */
  others: number;
}

/** Hora de Brasília (UTC−3) de um instante: "16h". */
const brtHour = (ms: number) => `${new Date(ms - 3 * 3_600_000).getUTCHours()}h`;
/** Quanto falta: "1h05", "12 min". */
const untilLabel = (ms: number, now: number) => {
  const m = Math.max(0, Math.ceil((ms - now) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} min`;
};
/** Depois da virada, a tela confere o mundo novo algumas vezes (com a aba à vista). */
const MAX_POLLS = 30;

/** Decisão tomada no meio do avanço (vai para o resumo). */
interface Decided {
  title: string;
  choice?: string;
  outcome?: string;
  deltas?: StoryDelta[];
}

type Phase = "idle" | "loading" | "playing" | "counting" | "deciding" | "paused" | "summary" | "ended";

/** Junta os pedaços do avanço (entre uma decisão e outra) num resumo só. */
function mergeChunks(chunks: StepAdvanceResult[]): FastForwardResult | null {
  if (!chunks.length) return null;
  const first = chunks[0];
  const last = chunks[chunks.length - 1];
  const heads = chunks.flatMap((c) => c.headlines ?? []).sort((a, b) => b.importance - a.importance || b.date.localeCompare(a.date));
  return {
    ok: true,
    message: "",
    days: chunks.reduce((s, c) => s + (c.diary?.length ?? 0), 0),
    from: first.from,
    to: last.to,
    headlines: heads.slice(0, 16),
    newsCount: chunks.reduce((s, c) => s + (c.newsCount ?? 0), 0),
    notifications: chunks.flatMap((c) => c.notifications ?? []),
    before: first.before,
    after: last.after,
    country: first.country && last.country ? { before: first.country.before, after: last.country.after } : undefined,
    note: last.note,
  };
}

/** Passar o tempo nos mundos do próprio jogador: os dias passam um a um, com pausa nas decisões. */
const isoPlus = (iso: string, n: number) => addDays(iso, n).toISOString().slice(0, 10);
const daysFrom = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

export function TimeMachine({ year, date, energy, next, pending = [], agenda = [], today: todayMarks = [], round = null }: TimeMachineProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [diary, setDiary] = useState<DayDigest[]>([]);
  const [shown, setShown] = useState(0);
  const [chunks, setChunks] = useState<StepAdvanceResult[]>([]);
  const [decided, setDecided] = useState<Decided[]>([]);
  const [decision, setDecision] = useState<StoryEvent | null>(null);
  const [requested, setRequested] = useState(0);
  const [fast, setFast] = useState(false);
  const [ending, setEnding] = useState<CareerEndView | null>(null);
  const [openWaiting, setOpenWaiting] = useState<StoryEvent | null>(null);
  const [pauseAsked, setPauseAsked] = useState(false);
  const paused = useRef(false);
  // fim do período pedido e ações agendadas para dias dele
  const endRef = useRef(date);
  const planRef = useRef<PlannedAction[]>([]);
  const [planning, setPlanning] = useState<number | null>(null);
  // apuração do dia de votação: abre quando o diário chega nesse dia
  const [apu, setApu] = useState<ApuracaoData[] | null>(null);
  const apuSeen = useRef(new Set<string>());
  const pause = (v: boolean) => {
    paused.current = v;
    setPauseAsked(v);
  };
  const last = useRef<StepAdvanceResult | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const router = useRouter();
  const toast = useToast();
  const today = new Date(`${date}T12:00:00Z`);
  const toNext = next ? Math.round((Date.parse(`${next.date}T12:00:00Z`) - today.getTime()) / DAY) : null;
  const waiting = pending.find((e) => e.blocking) ?? null;
  const live = phase !== "idle";
  const current = live && shown > 0 ? diary[shown - 1].date : date;
  const cur = new Date(`${current}T12:00:00Z`);
  // rodada: dias que ainda dá para viver (até o último dia da rodada)
  const left = round ? Math.max(0, daysFrom(date, round.capDate)) : Infinity;
  // a hora só no navegador (o servidor e a tela não brigam pelo texto)
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    if (!round) return;
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [round]);
  // fim da rodada (ou virada em andamento): a tela busca o mundo novo sozinha
  useEffect(() => {
    if (!round || live || polls >= MAX_POLLS) return;
    let later = false;
    const refresh = () => {
      if (document.visibilityState !== "visible") {
        later = true;
        return;
      }
      setPolls((n) => n + 1);
      router.refresh();
    };
    const onVisible = () => {
      if (later && document.visibilityState === "visible") {
        later = false;
        refresh();
      }
    };
    const wait = round.turning ? 20_000 : Math.min(Math.max(5_000, round.endsAt - Date.now() + 15_000), 2 * 3_600_000);
    const t = setTimeout(refresh, wait);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.turning, round?.endsAt, live, polls]);
  // a virada terminou (mundo novo na tela): volta a contar as tentativas do zero
  useEffect(() => setPolls(0), [round?.worldDate]);

  const finish = () => {
    setPhase("summary");
    router.refresh();
  };

  const showEnd = () => {
    setPhase("ended");
    careerEndSummary(year)
      .then((s) => (s ? setEnding(s) : (window.location.href = `/jogo/fim/${year}`)))
      .catch(() => (window.location.href = `/jogo/fim/${year}`));
  };

  const fetchChunk = async (n: number) => {
    setPhase("loading");
    const r = await advanceDays(year, n);
    if (!r.ok) {
      if (r.stop === "fim") return showEnd();
      toast({ tone: "err", title: "Não foi possível passar o tempo", body: r.message });
      if (chunks.length) finish();
      else setPhase("idle");
      return;
    }
    last.current = r;
    setChunks((c) => [...c, r]);
    setDiary((d) => [...d, ...(r.diary ?? [])]);
    setPhase("playing");
  };

  /** Data em que o relógio está agora (depois do último pedaço). */
  const at = () => last.current?.to ?? date;

  /** Executa as ações agendadas para os dias já alcançados e as põe no diário. */
  const runDue = async (cur: string) => {
    const due = planRef.current.filter((a) => a.date <= cur);
    if (!due.length) return;
    planRef.current = planRef.current.filter((a) => a.date > cur);
    setPhase("loading");
    for (const a of due) {
      const r = await quickAction(year, a.id, a.params).catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : "Não deu certo." }));
      const day: DayDigest = {
        date: cur,
        weekday: WEEKDAY[new Date(`${cur}T12:00:00Z`).getUTCDay()],
        line: `Agenda: ${a.label}`,
        events: [{ id: `agenda-${a.id}-${cur}`, def: "agenda", title: a.label, outcome: r.ok ? r.message : `Não aconteceu: ${r.message}`, kind: "INFO", tags: ["CAMPANHA"] }],
        pending: [],
        headline: null,
        money: 0,
        energy: 0,
        quiet: false,
      };
      setDiary((d) => [...d, day]);
      setShown((n) => n + 1);
      setDecided((d) => [...d, { title: a.label, choice: r.ok ? "feito como agendado" : "não aconteceu", outcome: r.message }]);
    }
  };

  /** Segue o período: agenda do dia, próximo pedaço até o próximo agendamento ou o fim, ou resumo. */
  const proceed = async () => {
    const cur = at();
    await runDue(cur);
    const left = daysFrom(cur, endRef.current);
    if (left <= 0) return finish();
    if (paused.current) return setPhase("paused");
    const nextPlan = planRef.current.map((a) => a.date).filter((d) => d > cur).sort()[0];
    void fetchChunk(Math.min(left, nextPlan ? daysFrom(cur, nextPlan) : left, 31));
  };

  const go = (days: number, plan: PlannedAction[] = []) => {
    pause(false);
    setFast(false);
    setDiary([]);
    setShown(0);
    setChunks([]);
    setDecided([]);
    setRequested(days);
    last.current = null;
    endRef.current = isoPlus(date, days);
    planRef.current = plan;
    void proceed();
  };

  /** Botão de avanço: em época de eleição, pergunta antes o que fazer no período. */
  const start = (days: number) => (agenda.length ? setPlanning(days) : go(days));

  /** Depois de mostrar um pedaço: decisão, fim da carreira, próximo pedaço ou resumo. */
  const afterChunk = () => {
    const r = last.current;
    if (!r) return finish();
    // o trecho terminou de passar na tela: a barra lateral acompanha o dia em que o relógio está
    publishVitals(r.vitals);
    if (r.stop === "fim") return showEnd();
    // viveu até o último dia da rodada: o resto vem na próxima
    if (r.stop === "rodada") return finish();
    // decisões que seguram o tempo e qualquer escolha nova: aparecem na hora
    const block = r.pending?.find((e) => e.blocking) ?? (r.stopOn ? r.pending?.find((e) => e.id === r.stopOn) : undefined);
    if (block) {
      setDecision(block);
      setPhase("deciding");
      return;
    }
    void proceed();
  };

  // revela um dia por vez: dia tranquilo passa rápido; dia com acontecimento, devagar
  useEffect(() => {
    if (phase !== "playing") return;
    if (shown < diary.length) {
      const d = diary[shown];
      // dia de votação: todas as apurações daquele dia, em sequência
      const due = chunks.flatMap((c) => c.apuracoes ?? []).filter((a) => a.date <= d.date && !apuSeen.current.has(a.key));
      if (due.length) {
        for (const a of due) apuSeen.current.add(a.key);
        setApu(due);
        setPhase("counting");
        return;
      }
      const busy = d.events.length + d.pending.length;
      const delay = fast ? 30 : busy ? 620 : d.headline ? 170 : 90;
      const t = setTimeout(() => setShown((n) => n + 1), delay);
      return () => clearTimeout(t);
    }
    afterChunk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, shown, diary.length, fast]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown]);

  const onDecided = (res: DecideResult) => {
    const ev = decision;
    setDecided((d) => [...d, { title: ev?.title ?? "", choice: res.choiceLabel, outcome: res.outcome, deltas: res.deltas }]);
    setDecision(null);
    if (res.ended) return showEnd();
    const nextBlock = res.pending?.find((e) => e.blocking);
    if (nextBlock) {
      setDecision(nextBlock);
      return;
    }
    void proceed();
  };

  const reset = () => {
    // subiu de etapa no período: comemora depois do resumo
    const b = report?.before;
    const a = report?.after;
    if (b && a && b.stage !== a.stage) window.dispatchEvent(new CustomEvent("dp:milestone", { detail: { stage: { from: b.stage, to: a.stage } } }));
    pause(false);
    setPhase("idle");
    setDiary([]);
    setShown(0);
    setChunks([]);
    setDecided([]);
    router.refresh();
  };

  const remaining = Math.max(0, daysFrom(last.current?.to ?? date, endRef.current));
  const report = phase === "summary" ? mergeChunks(chunks) : null;
  const opportunities = (last.current?.pending ?? []).filter((e) => !e.blocking).length;

  return (
    <section className={`tm${live ? " is-live" : ""}`} aria-labelledby="tm-title">
      <div className="tm__now">
        <span className="tm__kicker">
          <Icon name="clock" size={14} /> {live ? "Vivendo os dias" : round ? "Seus dias na rodada" : "Passar o tempo"}
        </span>
        <h2 id="tm-title" aria-live={live ? "polite" : undefined}>
          <small>{WEEKDAY[cur.getUTCDay()].replace(/^./, (c) => c.toUpperCase())}</small>
          <span key={current} className={live ? "tm__date-tick" : undefined}>
            {cur.getUTCDate()} de {MONTHS_LONG[cur.getUTCMonth()]} de {cur.getUTCFullYear()}
          </span>
        </h2>
        {live ? (
          <p>
            {phase === "loading" ? "O país está andando…" : phase === "counting" ? "Dia de votação: a apuração está saindo." : phase === "deciding" ? "O tempo parou: há uma decisão esperando você." : phase === "paused" ? `Pausado. Faltam ${remaining} dia(s).` : `${shown} de ${requested} dia(s)`}
          </p>
        ) : (
          <p>
            {todayMarks.length > 0 && (
              <>
                Hoje: <b>{todayMarks.join("; ")}</b> (começou).{" "}
              </>
            )}
            {next && toNext !== null && toNext >= 1 ? (
              <>
                Próximo marco: <b>{next.label}</b>, {toNext === 1 ? "amanhã" : `daqui a ${toNext} dias`}.{" "}
              </>
            ) : null}
            {round?.turning ? (
              <>A rodada terminou: o mundo está andando para todos. Energia: {Math.round(energy)}/100 (recupera 25 por dia).</>
            ) : round ? (
              <>
                Rodada até as <b>{brtHour(round.endsAt)}</b> de Brasília{nowMs !== null && !round.turning ? ` (faltam ${untilLabel(round.endsAt, nowMs)})` : ""}: dá para viver até <b>{longIso(round.capDate)}</b>
                {round.milestone ? `, véspera de um marco (${round.milestone})` : ""}. Na virada, o mundo anda para todos e os dias que você não viveu ficam para trás. Energia: {Math.round(energy)}/100 (recupera 25 por dia).
              </>
            ) : (
              <>Os dias passam um a um: dias tranquilos correm sozinhos e as decisões importantes param o relógio. Energia: {Math.round(energy)}/100 (recupera 25 por dia).</>
            )}
          </p>
        )}
      </div>

      {!live && round?.turning ? (
        <div className="tm__wait" role="status">
          <span className="ui-spinner" aria-hidden="true" />
          <span>
            <b>A rodada virou.</b> O mundo está andando os dias de todos{round.untilDate > round.worldDate ? ` até ${longIso(round.untilDate)}` : ""}. A tela atualiza sozinha em instantes.
          </span>
        </div>
      ) : !live && waiting ? (
        <div className="tm__wait" role="note">
          <Icon name="alert" size={18} />
          <span>
            <b>O tempo está parado.</b> Antes de seguir, responda: {waiting.title}.
          </span>
          <Button tone="gold" size="sm" onClick={() => setOpenWaiting(waiting)}>
            Decidir agora
          </Button>
        </div>
      ) : !live && round && left <= 0 ? (
        <div className="tm__wait" role="note">
          <Icon name="check" size={18} />
          <span>
            <b>Você viveu a rodada inteira.</b> Às {brtHour(round.endsAt)} o mundo anda para todos até {longIso(round.untilDate)} e começa uma nova rodada. Enquanto isso, dá para agir na carreira no seu dia.
          </span>
        </div>
      ) : !live ? (
        <div className="tm__opts" role="group" aria-label="Escolha quanto tempo passar">
          {OPTIONS.filter((o) => o.days < left).map((o) => (
            <button key={o.days} type="button" className={`tm__opt${o.days === 7 && !round ? " tm__opt--main" : ""}`} onClick={() => start(o.days)}>
              <b>{o.label}</b>
              <span>até {short(addDays(date, o.days))}</span>
              <small>{o.hint}</small>
            </button>
          ))}
          {round && left > 0 && (
            <button type="button" className="tm__opt tm__opt--main tm__opt--round" onClick={() => start(left)}>
              <b>Até o fim da rodada</b>
              <span>até {shortIso(round.capDate)}</span>
              <small>{left === 1 ? "o último dia que falta" : `os ${left} dias que faltam, com pausas`}</small>
            </button>
          )}
          {next && toNext !== null && toNext >= 1 && toNext < left && (
            <button type="button" className="tm__opt tm__opt--marco" onClick={() => start(toNext)}>
              <b>Próximo marco</b>
              <span>até {short(addDays(date, toNext))}</span>
              <small>{next.label}</small>
            </button>
          )}
        </div>
      ) : (
        <div className="tm__live">
          <div className="tm__bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (shown / Math.max(1, requested)) * 100)}%` }} />
          </div>
          <ol className="diary" ref={listRef} aria-label="Diário dos dias">
            {diary.slice(0, shown).map((d, i) => (
              <DayRow key={`${d.date}-${i}`} d={d} />
            ))}
            {phase === "loading" && (
              <li className="diary__day is-loading">
                <span className="ui-spinner" aria-hidden="true" /> <span>{shown ? "Seguindo para o próximo dia…" : "Acordando cedo…"}</span>
              </li>
            )}
          </ol>
          <div className="tm__controls">
            {phase === "playing" || phase === "loading" ? (
              <>
                <button type="button" className="tm__ctl" onClick={() => pause(true)} disabled={pauseAsked}>
                  <Icon name="clock" size={14} /> {pauseAsked ? "Vai pausar…" : "Pausar"}
                </button>
                <button type="button" className="tm__ctl" onClick={() => setFast(true)} disabled={fast}>
                  <Icon name="zap" size={14} /> {fast ? "Acelerado" : "Acelerar"}
                </button>
              </>
            ) : phase === "paused" ? (
              <>
                <Button tone="gold" size="sm" icon="play" onClick={() => (pause(false), void proceed())}>
                  Continuar ({remaining} dia{remaining === 1 ? "" : "s"})
                </Button>
                <button type="button" className="tm__ctl" onClick={finish}>
                  Ver o resumo
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {round && !live && (
        <p className="tm__round">
          <Icon name="users" size={14} />
          <span>
            Mundo compartilhado: rodadas de 2 horas (viram nas horas pares de Brasília), {round.night ? "de 1 semana na madrugada" : "de até 2 meses de jogo de dia"}.{" "}
            {round.others > 0 ? `${round.others === 1 ? "Outro jogador jogou" : `${round.others} outros jogadores jogaram`} aqui nos últimos 3 dias.` : "Você é o único jogador ativo aqui nos últimos 3 dias."}
          </span>
        </p>
      )}

      {decision && phase === "deciding" && (
        <EventModal
          key={decision.id}
          year={year}
          event={decision}
          today={current}
          celebrate={false}
          onResolved={onDecided}
          onLater={() => {
            setDecision(null);
            pause(true);
            setPhase("paused");
          }}
        />
      )}
      {openWaiting && (
        <EventModal
          key={openWaiting.id}
          year={year}
          event={openWaiting}
          today={date}
          onLater={() => setOpenWaiting(null)}
          onResolved={() => {
            setOpenWaiting(null);
            router.refresh();
          }}
        />
      )}
      {apu && phase === "counting" && (
        <Apuracao
          list={apu}
          onClose={() => {
            setApu(null);
            setPhase("playing");
          }}
        />
      )}
      {planning !== null && (
        <Planner
          days={planning}
          start={date}
          energy={energy}
          actions={agenda}
          onCancel={() => setPlanning(null)}
          onGo={(plan) => {
            const d = planning;
            setPlanning(null);
            go(d, plan);
          }}
        />
      )}
      {report && <PeriodReport result={report} year={year} diary={diary} decided={decided} opportunities={opportunities} onClose={reset} />}
      {phase === "ended" && ending && <CareerEndModal summary={ending} year={year} />}
      {phase === "ended" && !ending && (
        <div className="ui-overlay" role="status">
          <p className="tm__ending">
            <span className="ui-spinner" aria-hidden="true" /> Preparando o balanço da sua trajetória…
          </p>
        </div>
      )}
    </section>
  );
}

/** Uma linha do diário: a data, a rotina ou o acontecimento do dia, a manchete. */
function DayRow({ d }: { d: DayDigest }) {
  const stop = d.pending.some((p) => p.blocking);
  return (
    <li className={`diary__day${d.quiet ? " is-quiet" : ""}${stop ? " is-stop" : ""}`}>
      <span className="diary__date mono">{dayShort(d.date)}</span>
      <div className="diary__main">
        <span className="diary__line">{d.line}</span>
        {d.events.map((e) => (
          <span key={e.id} className={`diary__ev diary__ev--${KIND[e.kind].tone}`}>
            <Icon name={TAG[e.tags[0]]?.icon ?? "info"} size={12} />
            <span>
              {e.title !== d.line && <b>{e.title}. </b>}
              {e.auto && e.choiceLabel ? `Sem resposta, valeu: "${e.choiceLabel}". ` : ""}
              {e.outcome}
            </span>
          </span>
        ))}
        {d.pending.map((p) => (
          <span key={p.id} className={`diary__pend diary__pend--${KIND[p.kind].tone}`}>
            <Icon name={p.blocking ? "alert" : "star"} size={12} />
            <span>
              {KIND[p.kind].label}: {p.title}
              {!p.blocking && <em> · responda quando quiser</em>}
            </span>
          </span>
        ))}
        {d.headline && (
          <small className="diary__news">
            <Icon name="newspaper" size={11} /> {d.headline.title}
          </small>
        )}
      </div>
      {d.money !== 0 && Math.abs(d.money) >= 50 && <span className={`diary__money mono ${d.money > 0 ? "up" : "down"}`}>{d.money > 0 ? "+" : "−"}{brl(Math.abs(d.money))}</span>}
    </li>
  );
}

/* ---------- resumo do período ---------- */

type Ind = { key: keyof CountrySnapshot; label: string; fmt: (v: number) => string; upIsGood: boolean; unit: string };
const INDS: Ind[] = [
  { key: "approval", label: "Aprovação do governo", fmt: (v) => `${Math.round(v)}%`, upIsGood: true, unit: "p.p." },
  { key: "selic", label: "Selic", fmt: (v) => `${num(v, 2)}%`, upIsGood: false, unit: "p.p." },
  { key: "inflation", label: "Inflação 12m", fmt: (v) => `${num(v)}%`, upIsGood: false, unit: "p.p." },
  { key: "unemployment", label: "Desemprego", fmt: (v) => `${num(v)}%`, upIsGood: false, unit: "p.p." },
  { key: "fx", label: "Dólar", fmt: (v) => `R$ ${num(v, 2)}`, upIsGood: false, unit: "" },
];

function CountryRow({ before, after }: { before: CountrySnapshot; after: CountrySnapshot }) {
  return (
    <div className="pr-country">
      {INDS.map((ind) => {
        const a = before[ind.key];
        const b = after[ind.key];
        if (b === null || b === undefined) return null;
        const d = a === null || a === undefined ? 0 : b - a;
        const flat = Math.abs(d) < (ind.key === "approval" ? 0.5 : 0.005);
        const good = ind.upIsGood ? d > 0 : d < 0;
        return (
          <div key={ind.key} className="pr-ind" title={flat ? "estável no período" : undefined}>
            <span>{ind.label}</span>
            <b className="mono">{ind.fmt(b)}</b>
            {!flat && (
              <small className={good ? "up" : "down"}>
                {`${d > 0 ? "▲" : "▼"} ${ind.key === "approval" ? Math.round(Math.abs(d)) : num(Math.abs(d), 2)}`}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Delta({ label, a, b, money }: { label: string; a: number; b: number; money?: boolean }) {
  const d = b - a;
  return (
    <div className="pr-delta">
      <span>{label}</span>
      <b className="mono">{money ? brl(b) : Math.round(b)}</b>
      <small className={d > 0 ? "up" : d < 0 ? "down" : ""}>{d === 0 ? "igual" : `${d > 0 ? "+" : "−"}${money ? brl(Math.abs(d)) : Math.round(Math.abs(d))}`}</small>
    </div>
  );
}

export function PeriodReport({
  result,
  year,
  onClose,
  diary = [],
  decided = [],
  opportunities = 0,
}: {
  result: FastForwardResult;
  year: number;
  onClose: () => void;
  diary?: DayDigest[];
  decided?: Decided[];
  opportunities?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  useModal(box, true, onClose, { lockScroll: true, initial: ".pr__foot .ui-btn--gold" });
  const { before, after } = result;
  const heads = result.headlines ?? [];
  const [lead, ...rest] = heads;
  const notes = result.notifications ?? [];
  const more = Math.max(0, (result.newsCount ?? heads.length) - heads.length);
  const changed = before && after && (before.stage !== after.stage || before.party !== after.party);
  const happened = diary.flatMap((d) => d.events.map((e) => ({ ...e, date: d.date })));
  const quiet = diary.filter((d) => d.quiet).length;

  const story = [
    ...decided.map((d, i) => (
      <li key={`d${i}`} className="pr-tl__item is-decided">
        <b>{d.title}</b>
        {d.choice && (
          <span className="pr-story__choice">
            <Icon name="check" size={12} /> {d.choice}
          </span>
        )}
        {d.outcome && <p>{d.outcome}</p>}
        {d.deltas && d.deltas.length > 0 && <DeltaChips deltas={d.deltas} />}
      </li>
    )),
    ...happened.map((e) => (
      <li key={e.id} className="pr-tl__item">
        <span className="mono pr-date">{shortIso(e.date)}</span>
        <b>{e.title}</b>
        {e.auto && e.choiceLabel && <span className="pr-story__choice is-auto">sem resposta: {e.choiceLabel}</span>}
        {e.outcome && <p>{e.outcome}</p>}
      </li>
    )),
  ];
  const noteItems = notes.map((n, i) => {
    const invite = inviteIdOf(n.link);
    const href = resolveLink(n.link, year);
    return (
      <li key={i}>
        <b>{href && !invite ? <a href={href}>{n.title}</a> : n.title}</b>
        <p>{n.body}</p>
        {invite && <InviteActions year={year} invite={invite} className="pr-actions" />}
      </li>
    );
  });
  const headItems = rest.map((h, i) => (
    <li key={i}>
      <span className="mono pr-date">{shortIso(h.date)}</span>
      <span>
        {h.headline}
        {NEWS_CATEGORIES[h.category] && <small> · {NEWS_CATEGORIES[h.category]}</small>}
      </span>
    </li>
  ));

  return (
    <div className="ui-overlay pr-overlay">
      <div className="pr" role="dialog" aria-modal="true" aria-labelledby="pr-title" ref={box}>
        <header className="pr__head">
          <div>
            <span className="pr__period mono">
              {longIso(result.from)} <Icon name="arrow" size={14} /> {longIso(result.to)} · {result.days === 1 ? "1 dia" : `${result.days} dias`}
            </span>
            <h2 id="pr-title">{diary.length ? "Como foram seus dias" : "O que aconteceu no Brasil"}</h2>
          </div>
          <button type="button" className="pr__close" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={20} />
          </button>
        </header>

        <div className="pr__body">
          {result.note && (
            <p className="pr-note" role="note">
              <Icon name="users" size={16} /> {result.note}
            </p>
          )}

          {/* 1. você: o que mudou no personagem, sempre no topo */}
          <section className="pr-sec pr-you" aria-label="Com você">
            {before && after && (
              <div className="pr-deltas">
                <Delta label="Energia" a={before.energy} b={after.energy} />
                <Delta label="Caixa" a={before.money} b={after.money} money />
                <Delta label="Reputação" a={before.reputation} b={after.reputation} />
              </div>
            )}
            {changed && (
              <div className="pr-change">
                <Icon name="star" size={16} />
                <span>
                  {before!.stage !== after!.stage && (
                    <>
                      Nova etapa: <b>{STAGE[after!.stage] ?? after!.stage}</b>.{" "}
                    </>
                  )}
                  {before!.party !== after!.party && <>{after!.party ? <>Agora você é do <b>{after!.party}</b>.</> : "Você está sem partido."}</>}
                </span>
              </div>
            )}
          </section>

          {/* 2. sua história: decisões e acontecimentos, em ordem */}
          {(decided.length > 0 || happened.length > 0) && (
            <section className="pr-sec">
              <h3>
                <Icon name="zap" size={15} /> Sua história
                <span className="pr-count">{decided.length + happened.length}</span>
              </h3>
              <ol className="pr-tl">
                {story.slice(0, 4)}
              </ol>
              {story.length > 4 && (
                <details className="pr-fold">
                  <summary>Ver mais {story.length - 4}</summary>
                  <ol className="pr-tl">{story.slice(4)}</ol>
                </details>
              )}
              {(quiet > 0 || opportunities > 0) && (
                <p className="pr-foot-note">
                  {quiet > 0 ? `${quiet} dia(s) de rotina. ` : ""}
                  {opportunities > 0 ? `${opportunities} oportunidade(s) esperando resposta em Acontecimentos, no topo.` : ""}
                </p>
              )}
            </section>
          )}

          {/* 3. avisos */}
          {notes.length > 0 && (
            <section className="pr-sec">
              <h3>
                <Icon name="bell" size={15} /> Avisos
                <span className="pr-count">{notes.length}</span>
              </h3>
              <ul className="pr-notes">{noteItems.slice(0, 3)}</ul>
              {noteItems.length > 3 && (
                <details className="pr-fold">
                  <summary>Ver mais {noteItems.length - 3}</summary>
                  <ul className="pr-notes">{noteItems.slice(3)}</ul>
                </details>
              )}
            </section>
          )}

          {/* 4. o país: indicadores numa linha e as manchetes principais (na rodada, o país anda na virada: o aviso do topo explica) */}
          {(result.country || lead || !result.note) && (
          <section className="pr-sec">
            <h3>
              <Icon name="newspaper" size={15} /> No Brasil
            </h3>
            {result.country && <CountryRow before={result.country.before} after={result.country.after} />}
            {lead ? (
              <>
                <article className="pr-lead">
                  <div className="pr-tags">
                    {NEWS_CATEGORIES[lead.category] && <span className="pill">{NEWS_CATEGORIES[lead.category]}</span>}
                    <span className={`pill ${lead.factual ? "pill--ok" : "pill--sim"}`}>{lead.factual ? "fato real" : "simulação"}</span>
                    <span className="mono pr-date">{shortIso(lead.date)}</span>
                  </div>
                  <b>{lead.headline}</b>
                  {lead.lede && <p>{lead.lede}</p>}
                </article>
                {rest.length > 0 && <ul className="pr-list">{headItems.slice(0, 3)}</ul>}
                {rest.length > 3 && (
                  <details className="pr-fold">
                    <summary>Ver mais {Math.min(rest.length, 9) - 3} manchetes</summary>
                    <ul className="pr-list">{headItems.slice(3, 9)}</ul>
                  </details>
                )}
                {more + Math.max(0, rest.length - 9) > 0 && (
                  <a className="pr-more" href={`/jogo/${year}/noticias`}>
                    Todas as {result.newsCount ?? heads.length} notícias do período <Icon name="arrow" size={13} />
                  </a>
                )}
              </>
            ) : (
              <p className="pr-foot-note">Dias tranquilos: nenhuma manchete relevante.</p>
            )}
          </section>
          )}
        </div>

        <footer className="pr__foot">
          <a className="ui-btn ui-btn--ghost" href={`/jogo/${year}/carreira`}>
            <span>Agir na carreira</span>
          </a>
          <Button tone="gold" icon="check" onClick={onClose}>
            Continuar
          </Button>
        </footer>
      </div>
    </div>
  );
}
