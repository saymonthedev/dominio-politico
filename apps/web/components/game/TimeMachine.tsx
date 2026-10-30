"use client";
import { InviteActions } from "./InviteActions";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DayDigest, StoryDelta, StoryEvent } from "@dp/engine";
import { advanceDays, careerEndSummary } from "@/app/jogo/actions";
import { inviteIdOf, resolveLink } from "@/lib/links";
import type { CareerEndView, CountrySnapshot, DecideResult, FastForwardResult, StepAdvanceResult } from "@/lib/sim";
import { useModal } from "../a11y";
import { Button } from "../forms";
import { Term } from "../Term";
import { Icon } from "../Icon";
import { DeltaChips } from "./ActionFx";
import { CareerEndModal } from "./CareerEnd";
import { EventModal } from "./EventModal";
import { NEWS_CATEGORIES } from "./NewsList";
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

/** Plano de um botão de avanço segundo o relógio compartilhado. */
export interface OptionPlan {
  ok: boolean;
  days: number;
  /** marco em cuja véspera o avanço para */
  stop?: string;
  message?: string;
}

export interface SharedClock {
  /** outros jogadores ativos nas últimas 72 h */
  others: number;
  /** dias ainda disponíveis nesta hora */
  remaining: number | null;
  perHour: number;
  recent: Array<{ name: string | null; days: number; at: string; mine: boolean }>;
  plans: Record<number, OptionPlan>;
}

export interface TimeMachineProps {
  year: number;
  date: string;
  energy: number;
  /** próximo compromisso da agenda, para orientar o salto */
  next?: { label: string; date: string } | null;
  /** presente quando há outros jogadores ativos no mundo */
  clock?: SharedClock | null;
  /** acontecimentos esperando resposta */
  pending?: StoryEvent[];
}

/** Decisão tomada no meio do avanço (vai para o resumo). */
interface Decided {
  title: string;
  choice?: string;
  outcome?: string;
  deltas?: StoryDelta[];
}

type Phase = "idle" | "loading" | "playing" | "deciding" | "paused" | "summary" | "ended";

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
};

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

/** O lugar único para passar o tempo: os dias passam um a um, com pausa nas decisões. */
export function TimeMachine({ year, date, energy, next, clock, pending = [] }: TimeMachineProps) {
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

  const go = (days: number) => {
    pause(false);
    setFast(false);
    setDiary([]);
    setShown(0);
    setChunks([]);
    setDecided([]);
    setRequested(days);
    void fetchChunk(days);
  };

  /** Depois de mostrar um pedaço: decisão, fim da carreira, próximo pedaço ou resumo. */
  const afterChunk = () => {
    const r = last.current;
    if (!r) return finish();
    if (r.stop === "fim") return showEnd();
    // decisões que seguram o tempo e qualquer escolha nova: aparecem na hora
    const block = r.pending?.find((e) => e.blocking) ?? (r.stopOn ? r.pending?.find((e) => e.id === r.stopOn) : undefined);
    if (block) {
      setDecision(block);
      setPhase("deciding");
      return;
    }
    const rem = r.remaining ?? 0;
    if (rem > 0 && r.stop === "limite") {
      if (paused.current) setPhase("paused");
      else void fetchChunk(rem);
      return;
    }
    finish();
  };

  // revela um dia por vez: dia tranquilo passa rápido; dia com acontecimento, devagar
  useEffect(() => {
    if (phase !== "playing") return;
    if (shown < diary.length) {
      const d = diary[shown];
      const busy = d.events.length + d.pending.length;
      const delay = fast ? 70 : busy ? 950 : d.headline ? 420 : 260;
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
    const rem = last.current?.remaining ?? 0;
    if (rem > 0 && !paused.current) void fetchChunk(rem);
    else if (rem > 0) setPhase("paused");
    else finish();
  };

  const reset = () => {
    pause(false);
    setPhase("idle");
    setDiary([]);
    setShown(0);
    setChunks([]);
    setDecided([]);
    router.refresh();
  };

  const remaining = last.current?.remaining ?? 0;
  const report = phase === "summary" ? mergeChunks(chunks) : null;
  const opportunities = (last.current?.pending ?? []).filter((e) => !e.blocking).length;

  return (
    <section className={`tm${live ? " is-live" : ""}`} aria-labelledby="tm-title">
      <div className="tm__now">
        <span className="tm__kicker">
          <Icon name="clock" size={14} /> {live ? "Vivendo os dias" : "Passar o tempo"}
        </span>
        <h2 id="tm-title" aria-live={live ? "polite" : undefined}>
          <small>{WEEKDAY[cur.getUTCDay()].replace(/^./, (c) => c.toUpperCase())}</small>
          <span key={current} className={live ? "tm__date-tick" : undefined}>
            {cur.getUTCDate()} de {MONTHS_LONG[cur.getUTCMonth()]} de {cur.getUTCFullYear()}
          </span>
        </h2>
        {live ? (
          <p>
            {phase === "loading" ? "O país está andando…" : phase === "deciding" ? "O tempo parou: há uma decisão esperando você." : phase === "paused" ? `Pausado. Faltam ${remaining} dia(s).` : `${shown} de ${requested} dia(s)`}
          </p>
        ) : (
          <p>
            {next && toNext !== null && toNext >= 0 ? (
              <>
                Próximo marco: <b>{next.label}</b> em {toNext === 0 ? "hoje" : `${toNext} dia${toNext > 1 ? "s" : ""}`}.{" "}
              </>
            ) : null}
            Os dias passam um a um: dias tranquilos correm sozinhos e as decisões importantes param o relógio. Energia: {Math.round(energy)}/100 (recupera 25 por dia).
          </p>
        )}
      </div>

      {!live && waiting ? (
        <div className="tm__wait" role="note">
          <Icon name="alert" size={18} />
          <span>
            <b>O tempo está parado.</b> Antes de seguir, responda: {waiting.title}.
          </span>
          <Button tone="gold" size="sm" onClick={() => setOpenWaiting(waiting)}>
            Decidir agora
          </Button>
        </div>
      ) : !live ? (
        <div className="tm__opts" role="group" aria-label="Escolha quanto tempo passar">
          {OPTIONS.map((o) => {
            const plan = clock?.plans[o.days];
            const blocked = plan ? !plan.ok : false;
            const days = plan?.ok ? plan.days : o.days;
            return (
              <button
                key={o.days}
                type="button"
                className={`tm__opt${o.days === 7 ? " tm__opt--main" : ""}${blocked ? " is-blocked" : ""}`}
                onClick={() => go(plan?.ok ? plan.days : o.days)}
                disabled={blocked}
                title={blocked ? plan?.message : undefined}
                aria-describedby={clock ? "tm-shared" : undefined}
              >
                <b>{o.label}</b>
                <span>{blocked ? "indisponível agora" : `até ${short(addDays(date, days))}`}</span>
                <small>{plan?.ok && plan.stop ? `para na véspera do ${plan.stop}` : plan?.ok && plan.days < o.days ? `só ${plan.days} dia${plan.days > 1 ? "s" : ""} nesta hora` : o.hint}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="tm__live">
          <div className="tm__bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (shown / Math.max(1, requested)) * 100)}%` }} />
          </div>
          <ol className="diary" ref={listRef} aria-label="Diário dos dias">
            {diary.slice(0, shown).map((d) => (
              <DayRow key={d.date} d={d} />
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
                <Button tone="gold" size="sm" icon="play" onClick={() => (pause(false), void fetchChunk(remaining))}>
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

      {clock && !live && (
        <div className="tm__shared" id="tm-shared">
          <p>
            <Icon name="users" size={15} />
            <span>
              <b>
                <Term k="Relógio compartilhado" />
              </b>{" "}
              com {clock.others === 1 ? "outro jogador ativo" : `${clock.others} outros jogadores ativos`}: até {clock.perHour} dias por hora, somando
              todos, e o avanço para na véspera de prazos e eleições.{" "}
              {clock.remaining !== null && (clock.remaining > 0 ? `Restam ${clock.remaining} dias nesta hora.` : "A cota desta hora acabou.")}
            </span>
          </p>
          {Object.values(clock.plans).find((p) => !p.ok)?.message && <p className="tm__block">{Object.values(clock.plans).find((p) => !p.ok)?.message}</p>}
          {clock.recent.length > 0 && (
            <ul className="tm__log" aria-label="Últimos avanços do relógio">
              {clock.recent.slice(0, 3).map((r, i) => (
                <li key={i}>
                  <b>{r.mine ? "Você" : r.name ?? "Um jogador"}</b> avançou {r.days === 1 ? "1 dia" : `${r.days} dias`} <span className="muted">· {ago(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {decision && phase === "deciding" && (
        <EventModal
          year={year}
          event={decision}
          today={current}
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
          <div key={ind.key} className="pr-ind">
            <span>{ind.label}</span>
            <b className="mono">{ind.fmt(b)}</b>
            <small className={flat ? "" : good ? "up" : "down"}>
              {flat ? "estável" : `${d > 0 ? "▲" : "▼"} ${ind.key === "approval" ? Math.round(Math.abs(d)) : num(Math.abs(d), 2)}${ind.unit ? ` ${ind.unit}` : ""}`}
            </small>
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

  return (
    <div className="ui-overlay pr-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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

          {(decided.length > 0 || happened.length > 0) && (
            <section className="pr-story">
              <h3>
                <Icon name="zap" size={15} /> Sua história no período
              </h3>
              <ul className="pr-story__list">
                {decided.map((d, i) => (
                  <li key={`d${i}`} className="pr-story__item is-decided">
                    <b>{d.title}</b>
                    {d.choice && (
                      <span className="pr-story__choice">
                        <Icon name="check" size={12} /> {d.choice}
                      </span>
                    )}
                    {d.outcome && <p>{d.outcome}</p>}
                    {d.deltas && d.deltas.length > 0 && <DeltaChips deltas={d.deltas} />}
                  </li>
                ))}
                {happened.slice(0, 10).map((e) => (
                  <li key={e.id} className="pr-story__item">
                    <span className="mono pr-date">{shortIso(e.date)}</span> <b>{e.title}</b>
                    {e.auto && e.choiceLabel && <span className="pr-story__choice is-auto">sem resposta: {e.choiceLabel}</span>}
                    <p>{e.outcome}</p>
                  </li>
                ))}
              </ul>
              <p className="muted small" style={{ margin: 0 }}>
                {quiet > 0 ? `${quiet} dia(s) de rotina, sem nada de especial. ` : ""}
                {opportunities > 0 ? `${opportunities} oportunidade(s) esperando resposta no ícone de acontecimentos, no topo.` : ""}
              </p>
            </section>
          )}

          {result.country && <CountryRow before={result.country.before} after={result.country.after} />}

          <div className="pr__cols">
            <section className="pr__news">
              <h3>
                <Icon name="newspaper" size={15} /> Manchetes do período
              </h3>
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
                  <ul className="pr-list">
                    {rest.slice(0, 9).map((h, i) => (
                      <li key={i}>
                        <span className="mono pr-date">{shortIso(h.date)}</span>
                        <span>
                          {h.headline}
                          {NEWS_CATEGORIES[h.category] && <small> · {NEWS_CATEGORIES[h.category]}</small>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {more + Math.max(0, rest.length - 9) > 0 && (
                    <a className="pr-more" href={`/jogo/${year}/noticias`}>
                      + {more + Math.max(0, rest.length - 9)} notícias no período <Icon name="arrow" size={13} />
                    </a>
                  )}
                </>
              ) : (
                <p className="muted small">Dias tranquilos: nenhuma manchete relevante.</p>
              )}
            </section>

            <section className="pr__you">
              <h3>
                <Icon name="user" size={15} /> Com você
              </h3>
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
              {notes.length ? (
                <ul className="pr-notes">
                  {notes.slice(0, 6).map((n, i) => {
                    const invite = inviteIdOf(n.link);
                    const href = resolveLink(n.link, year);
                    return (
                      <li key={i}>
                        <b>{href && !invite ? <a href={href}>{n.title}</a> : n.title}</b>
                        <p>{n.body}</p>
                        {invite && <InviteActions year={year} invite={invite} className="pr-actions" />}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="muted small">Nenhum aviso novo. Use a energia em ações na sua carreira.</p>
              )}
            </section>
          </div>
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
