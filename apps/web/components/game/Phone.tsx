"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { chatFetch, chatPost, chatReport, chatThreads, type ChatMessage, type ChatThread } from "@/app/jogo/chat-actions";
import { quickAction } from "@/app/jogo/actions";
import { initials } from "@/lib/format";
import { AvatarSvg } from "../Avatar";
import { Icon } from "../Icon";

export interface PhonePost {
  id: string;
  date: string;
  text: string;
  author: string;
  authorId: string;
  avatar: string | null;
  mine: boolean;
}

interface Player {
  id: string;
  name: string;
  avatar: string | null;
  party: string | null;
}

interface Props {
  year: number;
  world: string;
  shared: boolean;
  me: { id: string; name: string; avatar: string | null };
  date: string;
  party: { id: string; acronym: string; color: string } | null;
  players: Player[];
  posts: PhonePost[];
  postedToday: boolean;
  news: Array<{ id: string; game_date: string; outlet: string; headline: string }>;
  gallery: Array<{ id: string; title: string; text: string; icon: string; date: string }>;
  initialChannel: string | null;
  initialApp: string | null;
}

type App = "mensagens" | "rede" | "noticias" | "galeria";
const APPS: Array<{ id: App; label: string; icon: string; tone: string }> = [
  { id: "mensagens", label: "Mensagens", icon: "chat", tone: "#2f7d5c" },
  { id: "rede", label: "Rede social", icon: "megaphone", tone: "#3d5a99" },
  { id: "noticias", label: "Notícias", icon: "newspaper", tone: "#8a1c1c" },
  { id: "galeria", label: "Galeria", icon: "star", tone: "#b07d12" },
];

const dmChannel = (a: string, b: string) => `dm:${[a, b].sort().join("|")}`;
const fmtDay = (iso: string) => iso.split("-").reverse().join("/");
const fmtTime = (ts: string) => new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const MUTED = "dp:silenciados";
function readMuted(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MUTED) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function writeMuted(list: string[]): void {
  try {
    localStorage.setItem(MUTED, JSON.stringify(list));
  } catch {
    // navegação privada: o silêncio vale só nesta visita
  }
}

function Face({ name, avatar, size = 34 }: { name: string; avatar: string | null; size?: number }) {
  return (
    <span className="ph-face" style={{ width: size, height: size }} aria-hidden="true">
      {avatar ? <AvatarSvg code={avatar} /> : initials(name)}
    </span>
  );
}

/** Celular do jogo: mensagens entre jogadores, rede social, manchetes e galeria da carreira. */
export function Phone(props: Props) {
  const { initialChannel, initialApp } = props;
  const [app, setApp] = useState<App | null>(initialChannel ? "mensagens" : (APPS.find((a) => a.id === initialApp)?.id ?? null));
  const current = APPS.find((a) => a.id === app);
  return (
    <div className="phone">
      <div className={`phone__screen${current ? "" : " is-home"}`}>
        <div className="phone__status">
          <span>{fmtDay(props.date)}</span>
          <span className="phone__notch" aria-hidden="true" />
          <span aria-hidden="true">4G ▮▮▮</span>
        </div>
        {current ? (
          <div className="phone__app">
            <div className="phone__bar">
              <button type="button" className="phone__back" onClick={() => setApp(null)} aria-label="Voltar para a tela inicial">
                <Icon name="chevron" size={18} />
              </button>
              <b>{current.label}</b>
            </div>
            {app === "mensagens" && <Messages {...props} />}
            {app === "rede" && <Social {...props} />}
            {app === "noticias" && <News {...props} />}
            {app === "galeria" && <Gallery {...props} />}
          </div>
        ) : (
          <div className="phone__home">
            <div className="phone__wall">
              <Face name={props.me.name} avatar={props.me.avatar} size={64} />
              <b>{props.me.name}</b>
            </div>
            <div className="phone__apps">
              {APPS.map((a) => (
                <button key={a.id} type="button" className="phone__icon" onClick={() => setApp(a.id)}>
                  <span style={{ background: a.tone }}>
                    <Icon name={a.icon} size={24} />
                  </span>
                  <small>{a.label}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Mensagens ---------------- */

function Messages({ world, shared, me, party, players, initialChannel }: Props) {
  const [channel, setChannel] = useState<string | null>(initialChannel);
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [picking, setPicking] = useState(false);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  useEffect(() => {
    if (shared && !channel) chatThreads(world).then(setThreads, () => setThreads([]));
  }, [world, shared, channel]);

  if (!shared) {
    return <p className="phone__empty">Num mundo só seu não há outros jogadores. As mensagens funcionam nos mundos compartilhados.</p>;
  }
  const titleOf = (c: string) => {
    if (c === "mundo") return "Todos os jogadores";
    if (c.startsWith("partido:")) return `Partido ${party?.acronym ?? ""}`.trim();
    const other = c.slice(3).split("|").find((id) => id !== me.id) ?? "";
    return byId.get(other)?.name ?? "Conversa";
  };
  if (channel) return <ChatView world={world} channel={channel} title={titleOf(channel)} me={me} players={byId} onBack={() => setChannel(null)} />;
  if (picking) {
    return (
      <div className="ph-list">
        <button type="button" className="ph-link" onClick={() => setPicking(false)}>
          ← Voltar
        </button>
        {players.length ? (
          players.map((p) => (
            <button key={p.id} type="button" className="ph-row" onClick={() => (setPicking(false), setChannel(dmChannel(me.id, p.id)))}>
              <Face name={p.name} avatar={p.avatar} />
              <span>
                <b>{p.name}</b>
                <small>{p.party ?? "sem partido"}</small>
              </span>
            </button>
          ))
        ) : (
          <p className="phone__empty">Ainda não há outros jogadores ativos neste mundo.</p>
        )}
      </div>
    );
  }
  return (
    <div className="ph-list">
      <button type="button" className="ph-row" onClick={() => setChannel("mundo")}>
        <span className="ph-face is-group" aria-hidden="true">
          <Icon name="globe" size={18} />
        </span>
        <span>
          <b>Todos os jogadores</b>
          <small>Canal aberto do mundo</small>
        </span>
      </button>
      {party && (
        <button type="button" className="ph-row" onClick={() => setChannel(`partido:${party.id}`)}>
          <span className="ph-face is-group" style={{ background: party.color }} aria-hidden="true">
            <Icon name="flag" size={18} />
          </span>
          <span>
            <b>Partido {party.acronym}</b>
            <small>Só para os jogadores do partido</small>
          </span>
        </button>
      )}
      <div className="ph-sep">Conversas particulares</div>
      {threads === null ? (
        <p className="phone__empty">Carregando…</p>
      ) : (
        threads.map((t) => {
          const other = t.channel.slice(3).split("|").find((id) => id !== me.id) ?? "";
          const p = byId.get(other);
          return (
            <button key={t.channel} type="button" className="ph-row" onClick={() => setChannel(t.channel)}>
              <Face name={p?.name ?? t.last_name} avatar={p?.avatar ?? null} />
              <span>
                <b>{p?.name ?? "Jogador"}</b>
                <small>
                  {t.last_name === me.name ? "Você: " : ""}
                  {t.last_body}
                </small>
              </span>
            </button>
          );
        })
      )}
      <button type="button" className="ph-new" onClick={() => setPicking(true)}>
        <Icon name="plus" size={16} /> Nova conversa
      </button>
      <p className="ph-note">Respeito acima de tudo: mensagens denunciadas por dois jogadores somem. Você pode silenciar quem quiser.</p>
    </div>
  );
}

function ChatView({ world, channel, title, me, players, onBack }: { world: string; channel: string; title: string; me: Props["me"]; players: Map<string, Player>; onBack: () => void }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [muted, setMuted] = useState<string[]>([]);
  const [menu, setMenu] = useState<number | null>(null);
  const [sending, start] = useTransition();
  const last = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const r = await chatFetch(world, channel, last.current);
    if (!r.ok) return setError(r.error ?? "Erro ao carregar.");
    setError(null);
    if (r.messages.length) {
      last.current = r.messages[r.messages.length - 1].id;
      setMsgs((m) => [...m, ...r.messages].slice(-200));
    }
  }, [world, channel]);
  useEffect(() => {
    setMuted(readMuted());
    last.current = 0;
    setMsgs([]);
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 7000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [msgs.length]);
  const send = () => {
    const body = text.trim();
    if (!body) return;
    start(async () => {
      const r = await chatPost(world, channel, body);
      if (!r.ok) return setError(r.error ?? "Não foi possível enviar.");
      setText("");
      await load();
    });
  };
  const mute = (id: string) => {
    const next = muted.includes(id) ? muted.filter((x) => x !== id) : [...muted, id];
    setMuted(next);
    writeMuted(next);
    setMenu(null);
  };
  const report = async (id: number) => {
    setMenu(null);
    const ok = await chatReport(world, id);
    setError(ok ? "Denúncia registrada. Obrigado." : "Não foi possível denunciar esta mensagem.");
  };
  const shown = msgs.filter((m) => !muted.includes(m.person_id));

  return (
    <div className="ph-chat">
      <div className="ph-chat__head">
        <button type="button" className="ph-link" onClick={onBack}>
          ← Conversas
        </button>
        <b>{title}</b>
      </div>
      <div className="ph-chat__msgs" ref={box} aria-live="polite">
        {shown.length === 0 && <p className="phone__empty">Nenhuma mensagem ainda. Comece a conversa.</p>}
        {shown.map((m) => {
          const mine = m.person_id === me.id;
          const p = players.get(m.person_id);
          return (
            <div key={m.id} className={`ph-msg${mine ? " is-mine" : ""}`}>
              {!mine && <Face name={m.name} avatar={p?.avatar ?? null} size={28} />}
              <div className="ph-msg__bubble">
                {!mine && <b>{m.name}</b>}
                <p>{m.body}</p>
                <small>{fmtTime(m.created_at)}</small>
              </div>
              {!mine && (
                <button type="button" className="ph-msg__more" aria-label="Opções da mensagem" aria-expanded={menu === m.id} onClick={() => setMenu(menu === m.id ? null : m.id)}>
                  ⋯
                </button>
              )}
              {menu === m.id && (
                <div className="ph-msg__menu" ref={(el) => el?.scrollIntoView({ block: "nearest" })}>
                  <button type="button" onClick={() => mute(m.person_id)}>
                    Silenciar {m.name.split(" ")[0]}
                  </button>
                  <button type="button" className="is-danger" onClick={() => report(m.id)}>
                    Denunciar mensagem
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {muted.length > 0 && (
        <button type="button" className="ph-link ph-unmute" onClick={() => (setMuted([]), writeMuted([]))}>
          Mostrar {muted.length === 1 ? "o jogador silenciado" : `os ${muted.length} jogadores silenciados`}
        </button>
      )}
      {error && <p className="ph-error">{error}</p>}
      <form
        className="ph-chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} placeholder="Mensagem" rows={1} aria-label="Escrever mensagem" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())} />
        <button type="submit" disabled={sending || !text.trim()} aria-label="Enviar">
          <Icon name="arrow" size={18} />
        </button>
      </form>
    </div>
  );
}

/* ---------------- Rede social ---------------- */

function Social({ year, posts, postedToday, me }: Props) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const publish = () =>
    start(async () => {
      const r = await quickAction(year, "publicar_post", { texto: text.trim() });
      setMsg(r.message);
      if (r.ok) {
        setText("");
        router.refresh();
      }
    });
  return (
    <div className="ph-list">
      {postedToday ? (
        <p className="ph-note">Você já publicou hoje. Amanhã (no calendário do jogo) dá para postar de novo.</p>
      ) : (
        <form
          className="ph-compose"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim().length >= 3) publish();
          }}
        >
          <div className="ph-compose__who">
            <Face name={me.name} avatar={me.avatar} size={30} />
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 280))} placeholder="O que você quer dizer aos eleitores hoje?" rows={3} aria-label="Escrever post" />
          </div>
          <div className="ph-compose__foot">
            <small>{text.length}/280 · um post por dia · sem links</small>
            <button type="submit" disabled={pending || text.trim().length < 3}>
              {pending ? "Publicando…" : "Publicar"}
            </button>
          </div>
        </form>
      )}
      {msg && <p className="ph-note">{msg}</p>}
      {posts.length ? (
        posts.map((p) => (
          <article key={p.id} className={`ph-post${p.mine ? " is-mine" : ""}`}>
            <Face name={p.author} avatar={p.avatar} size={34} />
            <div>
              <header>
                <b>{p.author}</b>
                <small>{fmtDay(p.date)}</small>
              </header>
              <p>{p.text}</p>
            </div>
          </article>
        ))
      ) : (
        <p className="phone__empty">Ninguém publicou ainda. Seja o primeiro.</p>
      )}
    </div>
  );
}

/* ---------------- Notícias e galeria ---------------- */

function News({ year, news }: Props) {
  return (
    <div className="ph-list">
      {news.map((n) => (
        <a key={n.id} className="ph-news" href={`/jogo/${year}/noticias`}>
          <small>
            {n.outlet} · {fmtDay(n.game_date)}
          </small>
          <b>{n.headline}</b>
        </a>
      ))}
      <a className="ph-new" href={`/jogo/${year}/noticias`}>
        <Icon name="newspaper" size={16} /> Ver todas as notícias
      </a>
    </div>
  );
}

function Gallery({ year, gallery }: Props) {
  return (
    <div className="ph-list">
      {gallery.length ? (
        <div className="ph-gallery">
          {gallery.map((g) => (
            <figure key={g.id} title={g.text}>
              <span>
                <Icon name={g.icon} size={26} />
              </span>
              <figcaption>
                <b>{g.title}</b>
                <small>{fmtDay(g.date)}</small>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="phone__empty">As conquistas da sua carreira aparecem aqui, como fotos de cada momento.</p>
      )}
      <a className="ph-new" href={`/jogo/${year}/familia`}>
        <Icon name="heart" size={16} /> Fotos da família
      </a>
    </div>
  );
}
