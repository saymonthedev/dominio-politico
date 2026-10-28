"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceTime } from "@/app/jogo/actions";
import { resolveLink } from "@/lib/links";
import type { FastForwardResult } from "@/lib/sim";
import { Button } from "./forms";
import { Icon } from "./Icon";
import { useToast } from "./game/Toaster";

const OPTIONS: Array<[number, string, string]> = [
  [1, "1 dia", "+1d"],
  [7, "1 semana", "+7d"],
  [15, "15 dias", "+15d"],
  [30, "1 mês", "+30d"],
];
const STAGE: Record<string, string> = {
  CIDADAO: "Cidadão(ã)", ATIVISTA: "Ativista", APROXIMACAO: "Aproximação partidária", FILIADO: "Filiado(a)", QUADRO: "Quadro partidário",
  PRE_CANDIDATO: "Pré-candidato(a)", CANDIDATO: "Candidato(a)", MANDATO: "Em mandato",
};
const fmt = (d?: string) => (d ? d.split("-").reverse().join("/") : "");
const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

/** Avança o mundo 1, 7, 15 ou 30 dias e mostra o que aconteceu no período. */
export function AdvanceTime({ year }: { year: number }) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<number | null>(null);
  const [result, setResult] = useState<FastForwardResult | null>(null);
  const router = useRouter();
  const toast = useToast();

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
      } else toast({ tone: "err", title: "Não foi possível avançar", body: r.message });
      setWhich(null);
    });
  };

  return (
    <>
      <div className="adv" role="group" aria-label="Avançar o tempo">
        <span className="adv__label">
          <Icon name="clock" size={16} /> Avançar
        </span>
        {OPTIONS.map(([d, long, short]) => (
          <button key={d} type="button" className={`adv__btn${d === 30 ? " adv__btn--strong" : ""}`} onClick={() => go(d)} disabled={pending} title={`Avançar ${long}`}>
            {pending && which === d ? <span className="ui-spinner" aria-hidden="true" /> : null}
            <span className="adv__long">{long}</span>
            <span className="adv__short">{short}</span>
          </button>
        ))}
      </div>
      {result && <PeriodSummary result={result} year={year} onClose={() => setResult(null)} />}
    </>
  );
}

function Delta({ label, a, b, money }: { label: string; a: number; b: number; money?: boolean }) {
  const d = b - a;
  return (
    <div className="sum-delta">
      <span>{label}</span>
      <b>{money ? brl(b) : Math.round(b)}</b>
      <small className={d > 0 ? "up" : d < 0 ? "down" : ""}>{d === 0 ? "sem mudança" : `${d > 0 ? "+" : ""}${money ? brl(d) : Math.round(d)}`}</small>
    </div>
  );
}

function PeriodSummary({ result, year, onClose }: { result: FastForwardResult; year: number; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const { before, after } = result;
  return (
    <div className="ui-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ui-dialog sum" role="dialog" aria-modal="true" aria-labelledby="sum-title">
        <div className="sum__head">
          <div>
            <div className="label">Resumo do período</div>
            <h2 id="sum-title">
              {fmt(result.from)} <Icon name="arrow" size={18} /> {fmt(result.to)}
            </h2>
            <p>{result.days === 1 ? "1 dia se passou." : `${result.days} dias se passaram.`}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={20} />
          </button>
        </div>

        {before && after && (
          <div className="sum__deltas">
            <Delta label="Energia" a={before.energy} b={after.energy} />
            <Delta label="Caixa" a={before.money} b={after.money} money />
            <Delta label="Reputação" a={before.reputation} b={after.reputation} />
          </div>
        )}
        {before && after && (before.stage !== after.stage || before.party !== after.party) && (
          <div className="sum__change">
            <Icon name="star" size={18} />
            <span>
              {before.stage !== after.stage && (
                <>
                  Nova etapa: <b>{STAGE[after.stage] ?? after.stage}</b>.{" "}
                </>
              )}
              {before.party !== after.party && <>{after.party ? <>Agora você é do <b>{after.party}</b>.</> : "Você está sem partido."}</>}
            </span>
          </div>
        )}

        <div className="sum__cols">
          <section>
            <h3>
              <Icon name="bell" size={16} /> Para você
            </h3>
            {result.notifications?.length ? (
              result.notifications.slice(0, 8).map((n, i) => {
                const href = resolveLink(n.link, year);
                return (
                  <div key={i} className="sum__item">
                    <b>{href ? <a href={href}>{n.title}</a> : n.title}</b>
                    <p>{n.body}</p>
                  </div>
                );
              })
            ) : (
              <p className="muted">Nada novo para você no período.</p>
            )}
          </section>
          <section>
            <h3>
              <Icon name="newspaper" size={16} /> No país
            </h3>
            {result.headlines?.length ? (
              result.headlines.slice(0, 8).map((h, i) => (
                <div key={i} className="sum__item">
                  <small className="mono">{fmt(h.date)}</small>
                  <p>{h.headline}</p>
                </div>
              ))
            ) : (
              <p className="muted">Dias tranquilos: nenhuma manchete relevante.</p>
            )}
          </section>
        </div>
        <div className="ui-dialog__actions">
          <a className="ui-btn ui-btn--ghost" href={`/jogo/${year}/noticias`}>
            Ver todas as notícias
          </a>
          <Button tone="gold" onClick={onClose}>
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
