import type { Metadata } from "next";
import { Empty, GameHeader, Panel, Pill } from "@/components/game/Page";
import { SuggestionForm } from "@/components/game/SuggestionForm";
import { Icon } from "@/components/Icon";
import { fmtDay } from "@/lib/format";
import { getSession, requireMe } from "@/lib/game";
import type { MySuggestion, SuggestionPopups } from "@/lib/suggestions";

export const metadata: Metadata = { title: "Sugestões" };

const STATUS = {
  NOVA: { label: "Em análise", tone: "neutral" },
  CONCLUIDA: { label: "Entrou no jogo", tone: "ok" },
  REPROVADA: { label: "Não vai entrar", tone: "bad" },
} as const;

/** Sugestões para o jogo: mandar uma nova, acompanhar as suas e ver as que viraram atualização. */
export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [mineQ, popupsQ] = await Promise.all([
    sb.from("suggestions").select("id, title, body, images, status, admin_note, created_at, decided_at").order("created_at", { ascending: false }).limit(30),
    sb.rpc("suggestion_popups"),
  ]);
  const mine = (mineQ.data ?? []) as MySuggestion[];
  const news = ((popupsQ.data as SuggestionPopups | null)?.news ?? []).slice(0, 8);

  return (
    <>
      <GameHeader
        kicker="Bastidores"
        icon="sparkle"
        title="Sugestões"
        lede="Tem uma ideia para o jogo? Mande aqui, com fotos se quiser. Se ela entrar numa atualização, todo mundo fica sabendo que foi sua."
      />
      <div className="ggrid ggrid--main">
        <div className="gstack">
          <Panel title="Nova sugestão" icon="plus">
            <SuggestionForm year={year} defaultAuthor={me.person.name} />
          </Panel>
          <Panel title="Minhas sugestões" icon="inbox" aside={mine.length ? <Pill>{mine.length}</Pill> : undefined}>
            {mine.length ? (
              <ul className="sug-list">
                {mine.map((s) => (
                  <li key={s.id} className={`sug-item sug-item--${s.status.toLowerCase()}`}>
                    <div className="sug-item__head">
                      <b>{s.title}</b>
                      <Pill tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Pill>
                    </div>
                    <p className="sug-item__body">{s.body}</p>
                    {s.images.length > 0 && (
                      <div className="sug-thumbs">
                        {s.images.map((p, i) => (
                          <a key={p} href={`/api/sugestao-foto?p=${encodeURIComponent(p)}`} target="_blank" rel="noopener">
                            <img src={`/api/sugestao-foto?p=${encodeURIComponent(p)}`} alt={`Foto ${i + 1}`} loading="lazy" />
                          </a>
                        ))}
                      </div>
                    )}
                    {s.admin_note && (
                      <p className="sug-item__note">
                        <Icon name="chat" size={14} /> <span>{s.admin_note}</span>
                      </p>
                    )}
                    <small className="muted">
                      Enviada em {fmtDay(s.created_at)}
                      {s.decided_at ? ` · respondida em ${fmtDay(s.decided_at)}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="sparkle" title="Você ainda não mandou sugestões">
                As suas aparecem aqui, com a resposta quando ela vier.
              </Empty>
            )}
          </Panel>
        </div>
        <div className="gstack">
          <Panel title="Já entraram no jogo" icon="star">
            {news.length ? (
              <ul className="sug-news">
                {news.map((n) => (
                  <li key={n.id}>
                    <b>{n.title}</b>
                    <span className="muted">
                      Sugestão de <b>{n.author}</b> · {fmtDay(n.at)}
                    </span>
                    {n.note && <p>{n.note}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                As sugestões que viram atualização aparecem aqui, com o nome de quem sugeriu.
              </p>
            )}
          </Panel>
          <Panel title="Como funciona" icon="info">
            <ul className="sug-how">
              <li>Toda sugestão é lida pelo criador do jogo.</li>
              <li>Se ela entrar numa atualização, todos os jogadores recebem um aviso com o seu nome.</li>
              <li>Se não der para fazer agora, só você recebe a resposta, com o motivo.</li>
              <li>Até 5 sugestões por dia. Nada de dados pessoais nas fotos, por favor.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
