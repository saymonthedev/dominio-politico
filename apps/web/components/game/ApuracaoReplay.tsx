"use client";
import { useState } from "react";
import type { Apuracao as ApuracaoData } from "@dp/engine";
import { Icon } from "../Icon";
import { Apuracao } from "./Apuracao";

const fmt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const OUT: Record<string, string> = { ELEITO: "eleito(a)", SEGUNDO_TURNO: "no 2º turno", SUPLENTE: "suplente", NAO_ELEITO: "não eleito(a)" };

/** Resultado da última votação no Painel, com a apuração para ver (ou rever). */
export function ApuracaoReplay({ list, year }: { list: ApuracaoData[]; year: number }) {
  const [open, setOpen] = useState(false);
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
        <small>Eleições de {year} · {list[0].round === 2 ? "2º turno" : "1º turno"}</small>
        <b id="areplay-title">
          {you ? `Você ficou ${OUT[you.outcome]} para ${office?.toLowerCase()}, com ${fmt(you.votes)} votos.` : `Saiu o resultado: ${list.map((a) => a.title.split(" · ")[0]).join(", ")}.`}
        </b>
      </div>
      <button type="button" className="ui-btn ui-btn--gold ui-btn--sm" onClick={() => setOpen(true)}>
        <Icon name="play" size={14} /> <span>Ver a apuração</span>
      </button>
      {open && <Apuracao list={list} onClose={() => setOpen(false)} />}
    </section>
  );
}
