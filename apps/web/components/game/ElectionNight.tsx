"use client";
import { useEffect, useState } from "react";
import { Icon } from "../Icon";

/** Hora de Brasília (UTC−3) de um instante: "20h". */
const brtHour = (ms: number) => `${new Date(ms - 3 * 3_600_000).getUTCHours()}h`;

function left(ms: number): string {
  if (ms <= 0) return "agora";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  if (m >= 10) return `${m} min`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Noite da eleição (19/11): no mundo compartilhado, a rodada que termina num dia de votação vira um
 * evento. A urna fecha na virada, à mesma hora para todos, e a apuração sai junto (a página
 * atualiza sozinha). Antes disso, a contagem regressiva.
 */
export function ElectionNight({ endsAt, year, round, turning, candidate }: { endsAt: number; year: number; round: 1 | 2; turning: boolean; candidate: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    // de segundo em segundo (nos últimos minutos a contagem mostra os segundos)
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [endsAt]);
  const closed = turning || (now !== null && now >= endsAt);
  const turno = round === 2 ? "2º turno" : "1º turno";
  return (
    <section className={`enight mb${closed ? " is-closed" : ""}`} aria-labelledby="enight-title">
      <span className="enight__icon" aria-hidden="true">
        <Icon name="ballot" size={24} />
      </span>
      <div className="enight__txt">
        <span className="enight__kicker">
          <i aria-hidden="true" /> Noite da eleição · {turno} de {year}
        </span>
        {closed ? (
          <>
            <h2 id="enight-title">A urna fechou. A apuração está saindo.</h2>
            <p>O mundo está processando o dia da votação para todos. Esta página atualiza sozinha quando o resultado sair.</p>
          </>
        ) : (
          <>
            <h2 id="enight-title">A urna fecha às {brtHour(endsAt)} de Brasília.</h2>
            <p>
              Na virada desta rodada o país vota e a apuração sai na hora, igual para todos os jogadores deste mundo.
              {candidate ? " Você está na disputa: o seu resultado sai junto." : ""} Deixe esta página aberta ou volte nesse horário.
            </p>
          </>
        )}
      </div>
      {!closed && now !== null && (
        <div className="enight__clock" aria-hidden="true">
          <b className="mono">{left(endsAt - now)}</b>
          <small>para a urna fechar</small>
        </div>
      )}
    </section>
  );
}
