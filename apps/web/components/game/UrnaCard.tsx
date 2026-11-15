"use client";
import { useEffect, useState } from "react";
import type { Urna as UrnaData } from "@dp/engine";
import { Icon } from "../Icon";
import { Urna, urnaVotes, type UrnaVote } from "./Urna";

const DAY = 86_400_000;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEK = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** Semana da votação no Painel: a urna simbólica aberta para o voto do jogador. */
export function UrnaCard({ urna, today }: { urna: UrnaData; today: string }) {
  const [open, setOpen] = useState(false);
  const [voted, setVoted] = useState<UrnaVote[] | null>(null);
  useEffect(() => setVoted(urnaVotes(urna.key)), [urna.key]);
  const d = at(urna.date);
  const left = Math.round((d.getTime() - at(today).getTime()) / DAY);
  const when = `${WEEK[d.getUTCDay()]}, ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
  const lead = left <= 0 ? `O ${urna.round}º turno é hoje` : left === 1 ? `O ${urna.round}º turno é amanhã, ${when}` : `O ${urna.round}º turno é em ${left} dias, ${when}`;
  return (
    <section className="areplay areplay--urna" aria-labelledby="urna-card-title">
      <span className="areplay__icon" aria-hidden="true">
        <Icon name="ballot" size={22} />
      </span>
      <div className="areplay__txt">
        <small>
          Eleições de {urna.year} · {urna.place}
        </small>
        <b id="urna-card-title">
          {voted
            ? `Você já votou na urna (${voted.length} ${voted.length === 1 ? "cargo" : "cargos"}). Seus votos aparecem marcados na apuração.`
            : `${lead}. A urna está aberta: vote em cada cargo, inclusive em você. O voto é simbólico e não muda o resultado.`}
        </b>
      </div>
      <button type="button" className={`ui-btn ui-btn--sm ${voted ? "areplay__ghost" : "ui-btn--gold"}`} onClick={() => setOpen(true)}>
        <Icon name="ballot" size={14} /> <span>{voted ? "Votar de novo" : "Votar na urna"}</span>
      </button>
      {open && (
        <Urna
          urna={urna}
          onClose={(done) => {
            setOpen(false);
            if (done) setVoted(urnaVotes(urna.key));
          }}
        />
      )}
    </section>
  );
}
