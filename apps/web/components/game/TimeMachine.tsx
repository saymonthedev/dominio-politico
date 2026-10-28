"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceTime } from "@/app/jogo/actions";
import { inviteIdOf, resolveLink } from "@/lib/links";
import type { CountrySnapshot, FastForwardResult } from "@/lib/sim";
import { Button } from "../forms";
import { Icon } from "../Icon";
import { NEWS_CATEGORIES } from "./NewsList";
import { QuickAction } from "./QuickAction";
import { useToast } from "./Toaster";

const DAY = 86_400_000;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAY = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const STAGE: Record<string, string> = {
  CIDADAO: "Cidadão(ã)", ATIVISTA: "Ativista", APROXIMACAO: "Aproximação partidária", FILIADO: "Filiado(a)", QUADRO: "Quadro partidário",
  PRE_CANDIDATO: "Pré-candidato(a)", CANDIDATO: "Candidato(a)", MANDATO: "Em mandato",
};

const OPTIONS = [
  { days: 1, label: "1 dia", hint: "um passo de cada vez" },
  { days: 7, label: "1 semana", hint: "pesquisas e votações" },
  { days: 15, label: "15 dias", hint: "meio mês de notícias" },
  { days: 30, label: "1 mês", hint: "economia do mês fecha" },
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
}

/** O lugar único para passar o tempo: escolhe o salto e mostra o que aconteceu no Brasil. */
export function TimeMachine({ year, date, energy, next }: TimeMachineProps) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<number | null>(null);
  const [result, setResult] = useState<FastForwardResult | null>(null);
  const router = useRouter();
  const toast = useToast();
  const today = new Date(`${date}T12:00:00Z`);
  const toNext = next ? Math.round((Date.parse(`${next.date}T12:00:00Z`) - today.getTime()) / DAY) : null;

  const go = (days: number) => {
    setWhich(days);
    start(async () => {
      const form = new FormData();
      form.set("__year", String(year));
      form.set("days", String(days));
      const r = await advanceTime(null, form);
      if (r.ok) {
        setResult(r);
        router.refresh();
      } else toast({ tone: "err", title: "Não foi possível passar o tempo", body: r.message });
      setWhich(null);
    });
  };

  return (
    <section className="tm" aria-labelledby="tm-title">
      <div className="tm__now">
        <span className="tm__kicker">
          <Icon name="clock" size={14} /> Passar o tempo
        </span>
        <h2 id="tm-title">
          <small>{WEEKDAY[today.getUTCDay()].replace(/^./, (c) => c.toUpperCase())}</small>
          {today.getUTCDate()} de {["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][today.getUTCMonth()]} de{" "}
          {today.getUTCFullYear()}
        </h2>
        <p>
          {next && toNext !== null && toNext >= 0 ? (
            <>
              Próximo marco: <b>{next.label}</b> em {toNext === 0 ? "hoje" : `${toNext} dia${toNext > 1 ? "s" : ""}`}.{" "}
            </>
          ) : null}
          Sua energia ({Math.round(energy)}/100) recupera 25 por dia.
        </p>
      </div>
      <div className="tm__opts" role="group" aria-label="Escolha quanto tempo passar">
        {OPTIONS.map((o) => (
          <button key={o.days} type="button" className={`tm__opt${o.days === 30 ? " tm__opt--main" : ""}`} onClick={() => go(o.days)} disabled={pending}>
            <b>{pending && which === o.days ? <span className="ui-spinner" aria-hidden="true" /> : null}{o.label}</b>
            <span>até {short(addDays(date, o.days))}</span>
            <small>{o.hint}</small>
          </button>
        ))}
      </div>
      {pending && (
        <p className="tm__busy" role="status">
          <span className="ui-spinner" aria-hidden="true" /> O país está andando: eleições, Congresso, economia e imprensa sendo processados…
        </p>
      )}
      {result && <PeriodReport result={result} year={year} onClose={() => setResult(null)} />}
    </section>
  );
}

/* ---------- popup do período ---------- */

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

export function PeriodReport({ result, year, onClose }: { result: FastForwardResult; year: number; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  const { before, after } = result;
  const heads = result.headlines ?? [];
  const [lead, ...rest] = heads;
  const notes = result.notifications ?? [];
  const more = Math.max(0, (result.newsCount ?? heads.length) - heads.length);
  const changed = before && after && (before.stage !== after.stage || before.party !== after.party);

  return (
    <div className="ui-overlay pr-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pr" role="dialog" aria-modal="true" aria-labelledby="pr-title">
        <header className="pr__head">
          <div>
            <span className="pr__period mono">
              {longIso(result.from)} <Icon name="arrow" size={14} /> {longIso(result.to)} · {result.days === 1 ? "1 dia" : `${result.days} dias`}
            </span>
            <h2 id="pr-title">O que aconteceu no Brasil</h2>
          </div>
          <button type="button" className="pr__close" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={20} />
          </button>
        </header>

        <div className="pr__body">
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
                        {invite && (
                          <div className="pr-actions">
                            <QuickAction year={year} action="responder_convite" params={{ request: invite, decision: "ACEITAR" }} label="Aceitar filiação" tone="gold" icon="check" />
                            <QuickAction year={year} action="responder_convite" params={{ request: invite, decision: "RECUSAR" }} label="Recusar" tone="ghost" />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="muted small">Nada novo para você no período. Use a energia em ações na sua carreira.</p>
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
