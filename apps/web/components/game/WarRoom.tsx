import type { CandidacyRow, ListProjection, RivalView, SegmentStanding } from "@dp/engine";
import { Icon } from "../Icon";
import { Panel, Pill } from "./Page";

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d).replace(".", ",")}%`;
const num = (v: number) => Math.round(v).toLocaleString("pt-BR");

const COST_LABEL: Record<string, string> = {
  propaganda: "Propaganda e impulsionamento",
  pessoal: "Equipe de rua",
  equipe: "Coordenação",
  debate: "Preparo para debates",
  juridico: "Advogados",
};

const TONE_LABEL: Record<string, string> = { PROPOSITIVO: "propositivo", ATAQUE: "de confronto", DEFENSIVO: "defensivo" };
const CHANCE_TONE: Record<string, "ok" | "gold" | "warn" | "bad"> = { alta: "ok", média: "gold", baixa: "warn", remota: "bad" };

export interface WarRoomProps {
  cand: CandidacyRow;
  standings: SegmentStanding[];
  majoritarian: boolean;
  rival: (Pick<RivalView, "pct"> & { name: string; party: string | null; persona: string | null }) | null;
  projection: ListProjection | null;
  why: { up: string[]; down: string[] };
}

/**
 * Sala de guerra da campanha: onde estão os votos, o que mexeu nas pesquisas,
 * quem é o adversário, a projeção e para onde foi o dinheiro.
 */
export function WarRoom({ cand, standings, majoritarian, rival, projection, why }: WarRoomProps) {
  const c = cand.campaign;
  const focus = new Set(c.focus ?? []);
  const costs = Object.entries(c.costs ?? {}).sort((a, b) => b[1] - a[1]);
  const totalCosts = costs.reduce((s, [, v]) => s + v, 0);
  const journal = [...(c.journal ?? [])].reverse().slice(0, 8);
  return (
    <>
      <Panel title="Eleitorado da disputa" icon="users">
        <p className="muted small wr__lede">
          {majoritarian
            ? "Sua fatia estimada em cada grupo de eleitores, comparada à do adversário mais forte no grupo. Apoio conquistado com escolhas e agenda aparece em verde."
            : "Sua afinidade com cada grupo de eleitores. Na eleição proporcional, cada voto conta para você e para a legenda."}
          {c.tone ? ` Tom da campanha: ${TONE_LABEL[c.tone] ?? c.tone.toLowerCase()}.` : ""}
        </p>
        <ul className="wr__segs">
          {standings.map((s) => (
            <li key={s.segment} className={focus.has(s.segment) ? "is-focus" : ""}>
              <div className="wr__segtop">
                <span>
                  {s.label}
                  {focus.has(s.segment) && <Pill tone="gold">foco</Pill>}
                </span>
                <small className="mono">{pct(s.weight, 0)} do eleitorado</small>
              </div>
              <div className="wr__bar" aria-hidden="true">
                <em style={{ width: `${Math.min(100, s.mine * 100)}%` }} />
                {majoritarian && s.rival > 0 && <i style={{ left: `${Math.min(100, s.rival * 100)}%` }} title={s.rivalName ?? undefined} />}
              </div>
              <div className="wr__segfoot">
                <b className="mono">{pct(s.mine)}</b>
                {majoritarian && s.rivalName && (
                  <small>
                    {s.rivalName}: {pct(s.rival)}
                  </small>
                )}
                {Math.abs(s.bonus) >= 0.005 && <span className={`wr__bonus${s.bonus < 0 ? " is-neg" : ""}`}>{s.bonus > 0 ? "+" : "−"}{(Math.abs(s.bonus) * 100).toFixed(0)} de apoio conquistado</span>}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {(c.last_poll || journal.length > 0) && (
        <Panel title="O que mexeu na campanha" icon="trending">
          {c.last_poll && (
            <p className="wr__poll">
              Última pesquisa vista: <b>{c.last_poll.pct.toFixed(1).replace(".", ",")}%</b>, {c.last_poll.rank}º lugar.
              {why.up.length ? ` Ajudou: ${why.up.join(", ")}.` : ""}
              {why.down.length ? ` Pesou contra: ${why.down.join(", ")}.` : ""}
            </p>
          )}
          {journal.length > 0 ? (
            <ul className="wr__journal">
              {journal.map((j, i) => (
                <li key={i} className={j.delta >= 0 ? "up" : "down"}>
                  <Icon name={j.delta >= 0 ? "trending" : "alert"} size={13} />
                  <span>{j.cause}</span>
                  <small className="mono">{j.on.slice(8, 10)}/{j.on.slice(5, 7)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>Desde a última pesquisa, nada de relevante mexeu na sua campanha.</p>
          )}
        </Panel>
      )}

      {rival && (
        <Panel title="Adversário principal" icon="flag">
          <div className="wr__rival">
            <b>{rival.name}</b>
            <span>
              {rival.party ?? "sem partido"}
              {rival.pct !== null ? ` · ${rival.pct.toFixed(1).replace(".", ",")}% na última pesquisa` : ""}
            </span>
            {rival.persona && <p className="muted small">Estilo de campanha: {rival.persona}.</p>}
          </div>
        </Panel>
      )}

      {projection && (
        <Panel title="Projeção de votos" icon="chart">
          <div className="wr__proj">
            <div>
              <span>Faixa estimada</span>
              <b className="mono">
                {num(projection.low)} – {num(projection.high)}
              </b>
            </div>
            <div>
              <span>Cadeiras do partido</span>
              <b className="mono">{projection.partySeats}</b>
            </div>
            <div>
              <span>Último eleito da chapa</span>
              <b className="mono">~{num(projection.cutoff)}</b>
            </div>
            <div>
              <span>Sua posição na lista</span>
              <b className="mono">{projection.position}º</b>
            </div>
          </div>
          <p className="small" style={{ marginBottom: 0 }}>
            Chance de se eleger: <Pill tone={CHANCE_TONE[projection.chance]}>{projection.chance}</Pill>
          </p>
        </Panel>
      )}

      <Panel title="Prestação de contas" icon="coins">
        <div className="wr__money">
          <div>
            <span>Arrecadado</span>
            <b className="mono">{brl(c.budget)}</b>
            <small>
              fundo eleitoral {brl(c.fefc)} · doações {brl(c.donations)}
            </small>
          </div>
          <div>
            <span>Gasto</span>
            <b className="mono">{brl(c.spent)}</b>
            <small>sobram {brl(Math.max(0, c.budget - c.spent))}</small>
          </div>
          <div>
            <span>Na rua</span>
            <b className="mono">{num(c.volunteers + (c.canvassers ?? 0))}</b>
            <small>
              {num(c.volunteers)} voluntários · {num(c.canvassers ?? 0)} contratados
            </small>
          </div>
        </div>
        {costs.length > 0 && (
          <ul className="wr__costs">
            {costs.map(([k, v]) => (
              <li key={k}>
                <span>{COST_LABEL[k] ?? k}</span>
                <i>
                  <em style={{ width: `${(v / (totalCosts || 1)) * 100}%` }} />
                </i>
                <b className="mono">{brl(v)}</b>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {(c.promises?.length ?? 0) > 0 && (
        <Panel title="Promessas assinadas" icon="file">
          <ul className="wr__promises">
            {c.promises!.map((p) => (
              <li key={p.id}>
                <Icon name={p.kept ? "check" : "file"} size={14} />
                <span>{p.title}</span>
              </li>
            ))}
          </ul>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Se você vencer, cada promessa volta como cobrança no mandato.
          </p>
        </Panel>
      )}
    </>
  );
}
