import type { NewsRow } from "@dp/engine";
import { fmtDate } from "@/lib/format";
import { OutletBadge, OutletLogo } from "./Outlet";
import { Pill } from "./Page";

const CAT: Record<string, string> = {
  politica: "Política", eleicoes: "Eleições", pesquisas: "Pesquisas", economia: "Economia", governo: "Governo", congresso: "Congresso",
  partidos: "Partidos", investigacao: "Investigação", redes: "Redes", carreira: "Sua carreira",
};

/** Selos que importam; "simulação" é o padrão e fica na legenda do rodapé. */
function Flags({ n }: { n: NewsRow }) {
  return (
    <>
      {n.factual && <Pill tone="ok">Fato real</Pill>}
      {n.visibility === "PRIVATE" && <Pill tone="gold">Só para você</Pill>}
    </>
  );
}

/** Lista de notícias com a marca do veículo, data, editoria e a marcação de fato real. */
export function NewsList({ news, compact, lead }: { news: NewsRow[]; compact?: boolean; lead?: boolean }) {
  const [top, ...rest] = news;
  const showLead = lead && top;
  const list = showLead ? rest : news;
  return (
    <div className={`nlist${compact ? " nlist--compact" : ""}`}>
      {showLead && (
        <article className={`nlead${top.category === "investigacao" ? " is-hot" : ""}`}>
          <div className="nlead__top">
            <OutletLogo name={top.outlet} />
            <span className="nlead__meta">
              {CAT[top.category] && <span className={`ncat ncat--${top.category}`}>{CAT[top.category]}</span>}
              <span className="mono">{fmtDate(top.game_date)}</span>
            </span>
          </div>
          <h3>{top.headline}</h3>
          <p>{top.body}</p>
          <div className="nlead__flags">
            <Flags n={top} />
          </div>
        </article>
      )}
      {list.length > 0 && (
        <ul className="nrows">
          {list.map((n) => (
            <li key={n.id} className={`nrow${n.category === "investigacao" ? " is-hot" : ""}`}>
              <OutletBadge name={n.outlet} size={30} />
              <div className="nrow__main">
                <h3>{n.headline}</h3>
                {!compact && <p>{n.body}</p>}
                <span className="nrow__meta">
                  <b>{n.outlet}</b>
                  <span aria-hidden="true">·</span>
                  <span className="mono">{fmtDate(n.game_date)}</span>
                  {CAT[n.category] && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className={`ncat ncat--${n.category}`}>{CAT[n.category]}</span>
                    </>
                  )}
                  <Flags n={n} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {news.some((n) => !n.factual) && <p className="nlist__legend">Veículos e notícias sem o selo “fato real” são simulação do jogo.</p>}
    </div>
  );
}

export const NEWS_CATEGORIES = CAT;
