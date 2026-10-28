import type { NewsRow } from "@dp/engine";
import { fmtDate } from "@/lib/format";
import { Pill } from "./Page";

const CAT: Record<string, string> = {
  politica: "Política", eleicoes: "Eleições", pesquisas: "Pesquisas", economia: "Economia", governo: "Governo", congresso: "Congresso",
  partidos: "Partidos", investigacao: "Investigação", redes: "Redes", carreira: "Sua carreira",
};

/** Lista de notícias com veículo, data, editoria e a marcação de fato real ou simulação. */
export function NewsList({ news, compact, lead }: { news: NewsRow[]; compact?: boolean; lead?: boolean }) {
  return (
    <div className={`nlist${compact ? " nlist--compact" : ""}`}>
      {news.map((n, i) => (
        <article key={n.id} className={`nitem${lead && i === 0 ? " nitem--lead" : ""}${n.category === "investigacao" ? " nitem--hot" : ""}`}>
          <div className="nitem__meta">
            <span className="nitem__outlet">{n.outlet}</span>
            <span className="mono">{fmtDate(n.game_date)}</span>
            {CAT[n.category] && <Pill tone={n.category === "investigacao" ? "bad" : "neutral"}>{CAT[n.category]}</Pill>}
            {n.factual ? <Pill tone="ok">Fato real</Pill> : <Pill tone="sim">Simulação</Pill>}
            {n.visibility === "PRIVATE" && <Pill tone="gold">Só para você</Pill>}
          </div>
          <h3>{n.headline}</h3>
          {!compact || (lead && i === 0) ? <p>{n.body}</p> : null}
        </article>
      ))}
    </div>
  );
}

export const NEWS_CATEGORIES = CAT;
