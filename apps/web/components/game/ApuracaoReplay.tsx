"use client";
import { useEffect, useState } from "react";
import type { Apuracao as ApuracaoData } from "@dp/engine";
import { Icon } from "../Icon";
import { Apuracao } from "./Apuracao";

const fmt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const OUT: Record<string, string> = { ELEITO: "eleito(a)", SEGUNDO_TURNO: "no 2º turno", SUPLENTE: "suplente", NAO_ELEITO: "não eleito(a)" };

/**
 * Resultado da última votação no Painel, com a apuração para ver (ou rever). Logo depois da noite da
 * eleição (mundo compartilhado), "ao vivo": a apuração abre sozinha uma vez em cada navegador.
 */
export function ApuracaoReplay({ list, year, live = false }: { list: ApuracaoData[]; year: number; live?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!live) return;
    const key = `dp_apuracao_${year}_${list[0]?.round ?? 1}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return;
    }
    setOpen(true);
  }, [live, year, list]);
  const mine = list.find((a) => a.mine);
  const you = mine?.you;
  const office = mine?.title.split(" · ")[0];
  const good = you?.outcome === "ELEITO" || you?.outcome === "SEGUNDO_TURNO";
  return (
    <section className={`areplay${good ? " is-good" : ""}`} aria-labelledby="areplay-title">
      <span className="areplay__icon" aria-hidden="true">
        <Icon name="ballot" size={22} />
      </span>
      <div className="areplay__txt">
        <small>
          {live && (
            <span className="areplay__live">
              <i aria-hidden="true" /> Ao vivo
            </span>
          )}
          Eleições de {year} · {list[0].round === 2 ? "2º turno" : "1º turno"}
        </small>
        <b id="areplay-title">
          {you ? `Você ficou ${OUT[you.outcome]} para ${office?.toLowerCase()}, com ${fmt(you.votes)} votos.` : `Saiu o resultado: ${list.map((a) => a.title.split(" · ")[0]).join(", ")}.`}
        </b>
      </div>
      <button type="button" className="ui-btn ui-btn--gold ui-btn--sm" onClick={() => setOpen(true)}>
        <Icon name="play" size={14} /> <span>{live ? "Assistir à apuração" : "Ver a apuração"}</span>
      </button>
      {open && <Apuracao list={list} onClose={() => setOpen(false)} />}
    </section>
  );
}
