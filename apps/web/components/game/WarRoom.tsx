import type { CampaignState, CandidacyRow, ListProjection, RivalView, SegmentStanding } from "@dp/engine";
import { Icon } from "../Icon";
import { Term } from "../Term";
import { Panel, Pill } from "./Page";

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d).replace(".", ",")}%`;
const num = (v: number) => Math.round(v).toLocaleString("pt-BR");
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

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

/** Placar da disputa: pesquisa, chance, adversário (ou corte da chapa) e caixa, lado a lado. */
export function ScoreBoard({ cand, majoritarian, rival, projection }: WarRoomProps) {
  const c = cand.campaign;
  const poll = c.last_poll;
  const left = Math.max(0, c.budget - c.spent);
  return (
    <div className="sb">
      <div className="sb__tile">
        <span>Última pesquisa</span>
        {poll ? (
          <>
            <b className="mono">{poll.pct.toFixed(1).replace(".", ",")}%</b>
            <small>{poll.rank}º lugar{poll.rank > 1 ? ` · líder com ${poll.leader_pct.toFixed(1).replace(".", ",")}%` : " · liderando"}</small>
          </>
        ) : (
          <>
            <b className="sb__none">—</b>
            <small>sem pesquisa ainda</small>
          </>
        )}
      </div>
      {projection ? (
        <>
          <div className="sb__tile">
            <span>Chance de se eleger</span>
            <b>
              <Pill tone={CHANCE_TONE[projection.chance]}>{projection.chance}</Pill>
            </b>
            <small>
              {projection.position}º na lista do partido · {projection.partySeats} cadeira(s)
            </small>
          </div>
          <div className="sb__tile">
            <span>Votos projetados</span>
            <b className="mono">
              {num(projection.low)}–{num(projection.high)}
            </b>
            <small>último eleito da chapa: ~{num(projection.cutoff)}</small>
          </div>
        </>
      ) : (
        <div className="sb__tile">
          <span>Adversário principal</span>
          {rival ? (
            <>
              <b className="sb__name">{rival.name}</b>
              <small>
                {rival.party ?? "sem partido"}
                {rival.pct !== null ? ` · ${rival.pct.toFixed(1).replace(".", ",")}%` : ""}
                {rival.persona ? ` · ${rival.persona}` : ""}
              </small>
            </>
          ) : (
            <>
              <b className="sb__none">—</b>
              <small>{majoritarian ? "definido após a convenção" : "—"}</small>
            </>
          )}
        </div>
      )}
      <div className={`sb__tile${left < 20_000 && cand.status !== "PRE" ? " is-warn" : ""}`}>
        <span>Caixa da campanha</span>
        <b className="mono">{brl(left)}</b>
        <small>
          {num(c.volunteers + (c.canvassers ?? 0))} pessoas na rua
        </small>
      </div>
    </div>
  );
}

/** Onde estão os votos: cada grupo de eleitores, sua fatia e o adversário. */
export function Electorate({ cand, standings, majoritarian }: WarRoomProps) {
  const c = cand.campaign;
  const focus = new Set(c.focus ?? []);
  return (
    <Panel title="Eleitorado da disputa" icon="users" aside={c.tone ? <Pill>tom {TONE_LABEL[c.tone] ?? c.tone.toLowerCase()}</Pill> : undefined}>
      <p className="muted small wr__lede">
        {majoritarian ? "Sua fatia em cada grupo de eleitores. O traço vermelho é o adversário mais forte no grupo." : "Sua afinidade com cada grupo. Na eleição proporcional, cada voto conta para você e para a legenda."}
      </p>
      <ul className="wr__segs">
        {standings.map((s) => (
          <li key={s.segment} className={focus.has(s.segment) ? "is-focus" : ""}>
            <div className="wr__segtop">
              <span>
                {s.label}
                {focus.has(s.segment) && <Pill tone="gold">foco</Pill>}
              </span>
              <b className="mono">{pct(s.mine)}</b>
            </div>
            <div className="wr__bar" aria-hidden="true">
              <em style={{ width: `${Math.min(100, s.mine * 100)}%` }} />
              {majoritarian && s.rival > 0 && <i style={{ left: `${Math.min(100, s.rival * 100)}%` }} title={s.rivalName ?? undefined} />}
            </div>
            <div className="wr__segfoot">
              <small>{pct(s.weight, 0)} do eleitorado</small>
              {majoritarian && s.rivalName && (
                <small>
                  {s.rivalName}: {pct(s.rival)}
                </small>
              )}
              {Math.abs(s.bonus) >= 0.005 && (
                <span className={`wr__bonus${s.bonus < 0 ? " is-neg" : ""}`}>
                  {s.bonus > 0 ? "+" : "−"}
                  {(Math.abs(s.bonus) * 100).toFixed(0)} conquistado
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Ânimo da campanha: momento, boatos e o que mexeu desde a última pesquisa. */
export function Momentum({ cand, why }: WarRoomProps) {
  const c = cand.campaign;
  const journal = [...(c.journal ?? [])].reverse().slice(0, 6);
  const m = Math.max(-1, Math.min(1, c.momentum));
  return (
    <Panel title="Momento da campanha" icon="trending">
      <div className="mo">
        <div className="mo__gauge" aria-label={`Momento ${m >= 0 ? "positivo" : "negativo"}`}>
          <i style={{ left: `${(m + 1) * 50}%` }} />
        </div>
        <div className="mo__legend">
          <span>perdendo fôlego</span>
          <b className={m >= 0.05 ? "up" : m <= -0.05 ? "down" : ""}>{m >= 0.05 ? "em alta" : m <= -0.05 ? "em queda" : "estável"}</b>
          <span>ganhando força</span>
        </div>
        {c.rumor_damage > 0.5 && (
          <p className="mo__rumor">
            <Icon name="alert" size={13} /> Boatos pesando contra você ({Math.round(Math.min(100, c.rumor_damage * 5))}/100).
          </p>
        )}
      </div>
      {(why.up.length > 0 || why.down.length > 0) && (
        <div className="mo__why">
          {why.up.length > 0 && (
            <p>
              <b className="up">Ajudou:</b> {why.up.join(", ")}
            </p>
          )}
          {why.down.length > 0 && (
            <p>
              <b className="down">Pesou contra:</b> {why.down.join(", ")}
            </p>
          )}
        </div>
      )}
      {journal.length > 0 ? (
        <ul className="wr__journal">
          {journal.map((j, i) => (
            <li key={i} className={j.delta >= 0 ? "up" : "down"}>
              <Icon name={j.delta >= 0 ? "trending" : "alert"} size={13} />
              <span>{j.cause}</span>
              <small className="mono">{dm(j.on)}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small" style={{ margin: "10px 0 0" }}>Nada de relevante mexeu na campanha desde a última pesquisa.</p>
      )}
    </Panel>
  );
}

/** Dinheiro da campanha num lugar só: de onde veio, para onde foi e quanto sobra. */
export function CampaignMoney({ c, status }: { c: CampaignState; status: string }) {
  const costs = Object.entries(c.costs ?? {}).sort((a, b) => b[1] - a[1]);
  const total = costs.reduce((s, [, v]) => s + v, 0);
  const left = Math.max(0, c.budget - c.spent);
  const used = c.budget > 0 ? Math.min(100, (c.spent / c.budget) * 100) : 0;
  return (
    <Panel title="Dinheiro da campanha" icon="coins">
      <div className="cmoney">
        <div className="cmoney__top">
          <div>
            <span>Disponível</span>
            <b className={`mono${left < 20_000 && status !== "PRE" ? " is-warn" : ""}`}>{brl(left)}</b>
          </div>
          <small>
            de {brl(c.budget)} arrecadados · {brl(c.spent)} gastos
          </small>
        </div>
        <div className="cmoney__bar" aria-hidden="true">
          <em style={{ width: `${used}%` }} />
        </div>
        <dl className="cmoney__src">
          <div>
            <dt>
              <Term k="FEFC">Fundo eleitoral</Term>
            </dt>
            <dd className="mono">{brl(c.fefc)}</dd>
          </div>
          <div>
            <dt>Doações</dt>
            <dd className="mono">{brl(c.donations)}</dd>
          </div>
          <div>
            <dt>Voluntários</dt>
            <dd className="mono">{num(c.volunteers)}</dd>
          </div>
          <div>
            <dt>Contratados</dt>
            <dd className="mono">{num(c.canvassers ?? 0)}</dd>
          </div>
        </dl>
        {costs.length > 0 && (
          <ul className="wr__costs">
            {costs.map(([k, v]) => (
              <li key={k}>
                <span>{COST_LABEL[k] ?? k}</span>
                <i>
                  <em style={{ width: `${(v / (total || 1)) * 100}%` }} />
                </i>
                <b className="mono">{brl(v)}</b>
              </li>
            ))}
          </ul>
        )}
        {c.proposals.length > 0 && (
          <div className="cmoney__plat">
            <span>Plataforma</span>
            <div className="pcard__tags">
              {c.proposals.map((p, i) => (
                <Pill key={i} tone="sim">
                  {p.title}
                </Pill>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

export function Promises({ c }: { c: CampaignState }) {
  if (!c.promises?.length) return null;
  return (
    <Panel title="Promessas assinadas" icon="file">
      <ul className="wr__promises">
        {c.promises.map((p) => (
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
  );
}
