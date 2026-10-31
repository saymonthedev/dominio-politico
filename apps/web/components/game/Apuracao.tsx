"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Apuracao as ApuracaoData } from "@dp/engine";
import { useModal } from "../a11y";
import { Button } from "../forms";
import { Icon } from "../Icon";

const ROW = 58;

const fmt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pct = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;

/** Ruído estável por linha: cada um "chega" de um jeito (interior, capital, zona eleitoral). */
function wobble(seed: string, t: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  const a = ((h >>> 0) % 1000) / 1000;
  const b = (((h >>> 10) >>> 0) % 1000) / 1000;
  return Math.sin(t * (6 + a * 7) + b * 6.28) * 0.5 + (a - 0.5);
}

const YOU_LABEL: Record<string, string> = { ELEITO: "Eleito(a)", SEGUNDO_TURNO: "2º turno", SUPLENTE: "Suplente", NAO_ELEITO: "Não eleito(a)" };

/** Uma disputa sendo contada: urnas, posições trocando e, no fim, o resultado. */
function Count({ data, step, total, next, onNext, onClose }: { data: ApuracaoData; step: number; total: number; next?: string; onNext?: () => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const done = p >= 1;
  const skip = useRef(false);
  const parties = data.kind === "PARTIDOS";
  // a sua disputa demora mais (suspense); as outras, menos
  const duration = data.mine ? 14_000 : 8_000;
  useModal(box, true, () => done && (onNext ?? onClose)(), { lockScroll: true, initial: ".apu__skip" });

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setP(1);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      if (skip.current) return setP(1);
      const k = Math.min(1, (now - t0) / duration);
      // começa rápido (primeiras urnas) e desacelera no fim, como a contagem real
      setP(1 - Math.pow(1 - k, 2.2));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  // parcial: cada linha oscila no começo e converge para o resultado final
  const live = useMemo(() => {
    const noise = (1 - p) * 0.35;
    const counted = data.valid * p || 1;
    return data.rows.map((r) => {
      const cur = r.votes * p * Math.max(0.2, 1 + noise * wobble(r.id, p * 4));
      return { ...r, cur, curShare: p > 0 ? (cur / counted) * 100 : 0 };
    });
  }, [p, data.rows, data.valid]);
  const order = [...live].sort((a, b) => b.cur - a.cur);
  const rank = new Map(order.map((r, i) => [r.id, i]));
  const max = Math.max(...live.map((r) => r.curShare), 0.01);
  const shareFirst = data.majoritarian || parties;
  const winners = data.rows.filter((r) => r.outcome === "ELEITO");
  const runoff = data.rows.filter((r) => r.outcome === "SEGUNDO_TURNO");
  const you = data.you;
  const good = you?.outcome === "ELEITO" || you?.outcome === "SEGUNDO_TURNO";

  let verdict = "";
  if (done) {
    if (you) verdict = you.outcome === "ELEITO" ? "Você foi eleito(a)!" : you.outcome === "SEGUNDO_TURNO" ? "Você vai para o 2º turno!" : you.outcome === "SUPLENTE" ? "Você ficou como suplente." : "Não foi desta vez.";
    else if (parties) verdict = `${winners.length} partido(s) dividem as ${data.seats} cadeiras.`;
    else if (winners.length === 1) verdict = `${winners[0].name} (${winners[0].party}) venceu.`;
    else if (runoff.length) verdict = `Vai ter 2º turno: ${runoff.map((r) => r.name).join(" × ")}.`;
    else if (winners.length) verdict = `${winners.length} eleitos entre os mais votados.`;
  }

  return (
    <div className="ui-overlay apu-overlay">
      <div className={`apu${done ? " is-done" : ""}`} role="dialog" aria-modal="true" aria-labelledby="apu-title" ref={box}>
        <header className="apu__head">
          <span className="apu__kicker">
            <Icon name="ballot" size={14} /> Apuração · {data.round === 2 ? "2º turno" : "1º turno"}
            {total > 1 && <span className="apu__step">{step + 1} de {total}</span>}
            {!done && <i className="apu__live">AO VIVO</i>}
          </span>
          <h2 id="apu-title">
            {data.title}
            {data.mine && <em className="apu__mine">sua disputa</em>}
          </h2>
          <div className="apu__progress" aria-label={`${Math.round(p * 100)}% das urnas apuradas`}>
            <span style={{ width: `${p * 100}%` }} />
          </div>
          <small className="mono">
            {(p * 100).toFixed(2).replace(".", ",")}% das urnas apuradas · {fmt(data.valid * p)} votos válidos
            {!data.majoritarian ? ` · ${data.seats} cadeira${data.seats > 1 ? "s" : ""}` : ""}
          </small>
        </header>

        <div className="apu__body">
          {parties && <p className="apu__note">Votos de cada partido; as cadeiras vão para as legendas mais votadas.</p>}
          <ol className="apu__list" style={{ height: order.length * ROW }}>
            {live.map((r) => {
              const pos = rank.get(r.id) ?? 0;
              const won = done && r.outcome === "ELEITO";
              const second = done && r.outcome === "SEGUNDO_TURNO";
              return (
                <li
                  key={r.id}
                  className={`apu__row${r.me ? " is-me" : ""}${won ? " is-won" : ""}${second ? " is-runoff" : ""}${done && !won && !second ? " is-out" : ""}`}
                  style={{ transform: `translateY(${pos * ROW}px)`, ["--c" as string]: r.color }}
                >
                  <span className="apu__pos mono">{pos + 1}º</span>
                  <span className="apu__who">
                    <b>
                      <span className="apu__name">{parties ? r.party : r.name}</span>
                      {r.me && <em>{parties ? "seu partido" : "você"}</em>}
                      {won && <span className="apu__tag apu__tag--won">{parties ? `${r.seats} cadeira${(r.seats ?? 0) > 1 ? "s" : ""}` : "eleito"}</span>}
                      {second && <span className="apu__tag apu__tag--run">2º turno</span>}
                    </b>
                    <small>{parties ? r.name : r.party}</small>
                    <span className="apu__bar" aria-hidden="true">
                      <i style={{ width: `${(r.curShare / max) * 100}%` }} />
                    </span>
                  </span>
                  <span className="apu__num">
                    <b className="mono">{shareFirst ? pct(r.curShare) : fmt(r.cur)}</b>
                    <small className="mono">{shareFirst ? `${fmt(r.cur)} votos` : pct(r.curShare)}</small>
                  </span>
                </li>
              );
            })}
          </ol>

          {you && !data.majoritarian && (
            <div className={`apu__you${done ? (good ? " is-good" : " is-bad") : ""}`}>
              <span>
                <small>Seus votos · {you.party}</small>
                <b className="mono">{fmt(you.votes * p)}</b>
              </span>
              <span className="apu__youout">{done ? YOU_LABEL[you.outcome] : "contando…"}</span>
            </div>
          )}
        </div>

        <footer className="apu__foot">
          {done ? (
            <>
              <p className={`apu__verdict${you ? (good ? " is-good" : " is-bad") : ""}`}>{verdict}</p>
              {onNext ? (
                <Button tone="gold" icon="arrow" onClick={onNext}>
                  {next ? `Agora: ${next}` : "Próxima disputa"}
                </Button>
              ) : (
                <Button tone="gold" icon="check" onClick={onClose}>
                  Continuar
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="apu__hint">{data.mine ? "Sua disputa. Cada urna conta." : "Acompanhe a contagem."}</p>
              <button type="button" className="apu__skip" onClick={() => ((skip.current = true), setP(1))}>
                Ver o resultado final
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

/**
 * Apuração com suspense, como na noite da eleição: a sua disputa primeiro e,
 * depois, as principais do dia (Presidência, governo ou prefeitura).
 */
export function Apuracao({ list, onClose }: { list: ApuracaoData[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const data = list[i];
  if (!data) return null;
  const nextOne = list[i + 1];
  return <Count key={data.key} data={data} step={i} total={list.length} next={nextOne?.title.split(" · ")[0]} onNext={nextOne ? () => setI(i + 1) : undefined} onClose={onClose} />;
}
