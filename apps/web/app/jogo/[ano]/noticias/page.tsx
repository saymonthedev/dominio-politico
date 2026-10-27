import type { NewsRow } from "@dp/engine";
import { NewsItem } from "@/components/ui";
import { getSession, requireMe } from "@/lib/game";

const CATS: Array<[string, string]> = [
  ["", "Tudo"], ["politica", "Política"], ["eleicoes", "Eleições"], ["pesquisas", "Pesquisas"], ["economia", "Economia"], ["governo", "Governo"],
  ["congresso", "Congresso"], ["partidos", "Partidos"], ["investigacao", "Investigação"], ["redes", "Redes"], ["carreira", "Sua carreira"],
];

export default async function Page({ params, searchParams }: { params: Promise<{ ano: string }>; searchParams: Promise<{ cat?: string; p?: string }> }) {
  const year = Number((await params).ano);
  const { cat = "", p = "0" } = await searchParams;
  const page = Math.max(0, Number(p) || 0);
  const me = await requireMe(year);
  const { sb } = await getSession();
  let q = sb.from("news_articles").select("*").eq("world_id", me.worldId).order("tick", { ascending: false }).range(page * 30, page * 30 + 29);
  if (cat) q = q.eq("category", cat);
  const { data } = await q;
  const news = (data ?? []) as NewsRow[];
  return (
    <>
      <h1>Notícias</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        {CATS.map(([k, label]) => (
          <a key={k} className={`btn small ${cat === k ? "" : "ghost"}`} href={`/jogo/${year}/noticias${k ? `?cat=${k}` : ""}`}>
            {label}
          </a>
        ))}
      </div>
      <div className="card">
        {news.length ? news.map((n) => <NewsItem key={n.id} n={n} />) : <div className="empty">Nenhuma notícia nesta seção.</div>}
      </div>
      <div className="row between mt">
        {page > 0 ? <a href={`?cat=${cat}&p=${page - 1}`}>← Mais recentes</a> : <span />}
        {news.length === 30 && <a href={`?cat=${cat}&p=${page + 1}`}>Mais antigas →</a>}
      </div>
    </>
  );
}
