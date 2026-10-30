"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Apuracao as ApuracaoData } from "@/lib/sim";
import { useModal } from "../a11y";
import { Button } from "../forms";
import { Icon } from "../Icon";

const ROW = 58;
const DURATION = 16_000;

const fmt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pct = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;

/** Ruído estável por candidato: cada um "chega" de um jeito (interior, capital, zona eleitoral). */
function wobble(seed: string, t: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  const a = ((h >>> 0) % 1000) / 1000;
  const b = (((h >>> 10) >>> 0) % 1000) / 1000;
  return Math.sin(t * (6 + a * 7) + b * 6.28) * 0.5 + (a - 0.5);
}

/**
 * Apuração com suspense, como na noite da eleição: as urnas vão sendo
 * contadas, as posições trocam e só no fim sai quem venceu.
 */
export function Apuracao({ data, onClose }: { data: ApuracaoData; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const done = p >= 1;
  const skip = useRef(false);
  useModal(box, true, () => done && onClose(), { lockScroll: true, initial: ".apu__skip" });

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setP(1);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / DURATION);
      // começa rápido (primeiras urnas) e desacelera no fim, como a contagem real
      if (skip.current) return setP(1);
      setP(1 - Math.pow(1 - k, 2.2));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // parcial: cada candidato oscila no começo e converge para o resultado final
  const live = useMemo(() => {
    const noise = (1 - p) * 0.35;
    const raw = data.rows.map((r) => ({ ...r, cur: r.votes * p * Math.max(0.2, 1 + noise * wobble(r.id, p * 4)) }));
    // fatia dos votos válidos já contados
    const counted = data.valid * p || 1;
    return raw.map((r) => ({ ...r, curShare: p > 0 ? (r.cur / counted) * 100 : 0 }));
  }, [p, data.rows, data.valid]);
  const order = [...live].sort((a, b) => b.cur - a.cur);
  const rank = new Map(order.map((r, i) => [r.id, i]));
  const max = Math.max(...live.map((r) => r.curShare), 1);
  const me = data.rows.find((r) => r.me);
  const winners = data.rows.filter((r) => r.outcome === "ELEITO");
  const runoff = data.rows.filter((r) => r.outcome === "SEGUNDO_TURNO");

  let verdict = "";
  if (done) {
    if (me) verdict = me.outcome === "ELEITO" ? "Você foi eleito(a)!" : me.outcome === "SEGUNDO_TURNO" ? "Você vai para o 2º turno!" : data.majoritarian ? "Não foi desta vez." : "Você não conquistou uma cadeira desta vez.";
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
            {!done && <i className="apu__live">AO VIVO</i>}
          </span>
          <h2 id="apu-title">{data.title}</h2>
          <div className="apu__progress" aria-label={`${Math.round(p * 100)}% das urnas apuradas`}>
            <span style={{ width: `${p * 100}%` }} />
          </div>
          <small className="mono">
            {(p * 100).toFixed(2).replace(".", ",")}% das urnas apuradas · {fmt(data.valid * p)} votos válidos
          </small>
        </header>

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
                    {r.name}
                    {r.me && <em>você</em>}
                    {won && <span className="apu__tag apu__tag--won">eleito</span>}
                    {second && <span className="apu__tag apu__tag--run">2º turno</span>}
                  </b>
                  <small>{r.party}</small>
                  <span className="apu__bar" aria-hidden="true">
                    <i style={{ width: `${(r.curShare / max) * 100}%` }} />
                  </span>
                </span>
                <span className="apu__num">
                  <b className="mono">{data.majoritarian ? pct(r.curShare) : fmt(r.cur)}</b>
                  <small className="mono">{data.majoritarian ? `${fmt(r.cur)} votos` : pct(r.curShare)}</small>
                </span>
              </li>
            );
          })}
        </ol>

        <footer className="apu__foot">
          {done ? (
            <>
              <p className={`apu__verdict${me?.outcome === "ELEITO" || me?.outcome === "SEGUNDO_TURNO" ? " is-good" : me ? " is-bad" : ""}`}>{verdict}</p>
              <Button tone="gold" icon="check" onClick={onClose}>
                Continuar
              </Button>
            </>
          ) : (
            <>
              <p className="apu__hint">{me ? "Sua disputa. Cada urna conta." : "Acompanhe a contagem."}</p>
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
