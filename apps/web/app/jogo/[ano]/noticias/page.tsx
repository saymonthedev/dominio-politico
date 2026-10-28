import type { NewsRow } from "@dp/engine";
import { NEWS_CATEGORIES, NewsList } from "@/components/game/NewsList";
import { Empty, GameHeader, Panel } from "@/components/game/Page";
import { Icon } from "@/components/Icon";
import { getSession, requireMe } from "@/lib/game";

const PAGE = 30;

export default async function Page({ params, searchParams }: { params: Promise<{ ano: string }>; searchParams: Promise<{ cat?: string; p?: string }> }) {
  const year = Number((await params).ano);
  const { cat = "", p = "0" } = await searchParams;
  const page = Math.max(0, Number(p) || 0);
  const me = await requireMe(year);
  const { sb } = await getSession();
  let q = sb.from("news_articles").select("*").eq("world_id", me.worldId).order("tick", { ascending: false }).order("importance", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (cat) q = q.eq("category", cat);
  const { data } = await q;
  const news = (data ?? []) as NewsRow[];
  const tabs: Array<[string, string]> = [["", "Tudo"], ...Object.entries(NEWS_CATEGORIES)];
  return (
    <>
      <GameHeader kicker="O país" icon="newspaper" title="Notícias" lede="O noticiário do mundo. Cada texto diz se é fato real, com fonte, ou simulação do jogo. Os veículos são fictícios." />
      <nav className="chips mb" aria-label="Editorias">
        {tabs.map(([k, label]) => (
          <a key={k} className={cat === k ? "on" : ""} href={`/jogo/${year}/noticias${k ? `?cat=${k}` : ""}`}>
            {label}
          </a>
        ))}
      </nav>
      <Panel>
        {news.length ? (
          <NewsList news={news} lead={page === 0} />
        ) : (
          <Empty icon="newspaper" title="Nenhuma notícia nesta editoria">
            Passe o tempo no Painel para o mundo produzir mais acontecimentos.
          </Empty>
        )}
      </Panel>
      <div className="pager">
        {page > 0 ? (
          <a className="ui-btn ui-btn--ghost ui-btn--sm" href={`?cat=${cat}&p=${page - 1}`}>
            <span>Mais recentes</span>
          </a>
        ) : (
          <span />
        )}
        {news.length === PAGE && (
          <a className="ui-btn ui-btn--ghost ui-btn--sm" href={`?cat=${cat}&p=${page + 1}`}>
            <span>Mais antigas</span> <Icon name="arrow" size={14} />
          </a>
        )}
      </div>
    </>
  );
}
