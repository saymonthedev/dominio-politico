import type { ListProjection } from "@dp/engine";
import { Kpi, Panel, Pill } from "./Page";

const num = (v: number) => Math.round(v).toLocaleString("pt-BR");
const dec = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const KIND = { VOCE: { label: "você", tone: "gold" }, JOGADOR: { label: "jogador(a)", tone: "sim" }, MANDATO: { label: "tenta a reeleição", tone: "neutral" } } as const;

/**
 * A chapa do partido na disputa proporcional (sugestão do jogador João Vitor): a projeção de cada
 * nome, a soma da legenda, o quociente eleitoral, quantos votos faltam para a próxima cadeira e se
 * você está puxando a chapa ou brigando pela vaga interna.
 */
export function Nominata({ p, party }: { p: ListProjection; party: string }) {
  const role =
    p.role === "PUXADOR"
      ? `Você puxa a chapa: só os seus votos valem ${Math.round((p.mid / Math.max(1, p.quotient)) * 100)}% de um quociente e ajudam a eleger colegas do ${party}.`
      : p.role === "VAGA"
        ? `Você briga por uma vaga dentro da chapa: está em ${p.position}º, e o último eleito do ${party} teria cerca de ${num(p.cutoff)} votos.`
        : p.partySeats === 0
          ? `O ${party} ainda não alcança um quociente: faltam ${num(p.toNextQuotient)} votos de legenda para a primeira cadeira.`
          : `Hoje você está longe das vagas do ${party}: ${p.position}º na lista, e o último eleito teria cerca de ${num(p.cutoff)} votos.`;
  return (
    <Panel title="Sua chapa (nominata)" icon="users" aside={<span className="muted small">projeção de hoje</span>}>
      <div className="kpis nomi__kpis">
        <Kpi label="Votos da legenda" value={num(p.partyVotes)} hint="os nomes da chapa e o voto só no partido" />
        <Kpi label="Quociente eleitoral" value={num(p.quotient)} hint="votos válidos ÷ cadeiras" />
        <Kpi label="Cadeiras projetadas" value={String(p.partySeats)} hint={`${dec(p.quotients)} quociente(s)`} />
        <Kpi label="Próximo quociente" value={num(p.toNextQuotient)} hint="votos de legenda que faltam" />
      </div>
      <p className={`nomi__role is-${p.role.toLowerCase()}`}>{role}</p>
      <ol className="nomi">
        {p.list.map((m) => (
          <li key={m.id} className={`${m.kind === "VOCE" ? "is-me " : ""}${m.in ? "is-in" : "is-out"}`}>
            <span className="nomi__pos mono">{m.rank}º</span>
            <span className="nomi__name">
              <b>{m.name}</b>
              <Pill tone={KIND[m.kind].tone}>{KIND[m.kind].label}</Pill>
            </span>
            <span className="nomi__votes mono">{num(m.votes)}</span>
            <span className="nomi__seat">{m.in ? "dentro" : "fora"}</span>
          </li>
        ))}
        {p.rest.count > 0 && (
          <li className="nomi__rest">
            <span className="nomi__pos mono">…</span>
            <span className="nomi__name">
              <b>Outros {p.rest.count} nomes da chapa</b>
            </span>
            <span className="nomi__votes mono">{num(p.rest.votes)}</span>
            <span className="nomi__seat">{p.rest.in ? `${p.rest.in} dentro` : "fora"}</span>
          </li>
        )}
      </ol>
      <p className="muted small">
        Projeção com as pesquisas e a campanha de cada um hoje. As cadeiras saem do quociente e das sobras (maiores médias), então a última pode mudar de partido. O voto só no partido conta para a legenda, mas não para nenhum nome.
      </p>
    </Panel>
  );
}
