import type { NewsRow, PartyRow } from "@dp/engine";
import { fmtDate } from "@/lib/format";

export function PartyChip({ party, href }: { party?: Pick<PartyRow, "acronym" | "color" | "id"> | null; href?: string }) {
  if (!party) return <span className="muted">sem partido</span>;
  const inner = (
    <>
      <i style={{ background: party.color }} />
      {party.acronym}
    </>
  );
  return href ? (
    <a className="party" href={href}>
      {inner}
    </a>
  ) : (
    <span className="party">{inner}</span>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className={`hint ${tone ? `delta ${tone}` : ""}`}>{hint}</div>}
    </div>
  );
}

export function Meter({ value, max = 100, tone }: { value: number; max?: number; tone?: "ok" | "bad" | "sim" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`meter ${tone ?? ""}`} role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function NewsItem({ n, lead }: { n: NewsRow; lead?: boolean }) {
  const breaking = n.category === "investigacao" && n.importance >= 3;
  return (
    <article className={`news ${lead ? "lead" : ""} ${breaking ? "breaking" : ""}`}>
      <div className="meta">
        <span className="outlet">{n.outlet}</span>
        <span className="mono">{fmtDate(n.game_date)}</span>
        {n.factual ? <span className="badge real">Fato real</span> : <span className="badge sim">Simulação</span>}
        {n.visibility === "PRIVATE" && <span className="badge gold plain">Sua carreira</span>}
        {n.category === "investigacao" && <span className="badge bad">Investigação</span>}
      </div>
      <h3>{n.headline}</h3>
      <p>{n.body}</p>
    </article>
  );
}

export function Sparkline({ values, color = "var(--faixa)" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${40 - ((v - min) / span) * 36 - 2}`).join(" ");
  return (
    <svg className="spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const STAGE_LABEL: Record<string, string> = {
  CIDADAO: "Cidadão(ã)",
  ATIVISTA: "Ativista",
  APROXIMACAO: "Aproximação partidária",
  FILIADO: "Filiado(a)",
  QUADRO: "Quadro partidário",
  PRE_CANDIDATO: "Pré-candidato(a)",
  CANDIDATO: "Candidato(a)",
  MANDATO: "Em mandato",
};

export const STAGES = Object.keys(STAGE_LABEL);
