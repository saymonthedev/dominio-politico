"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { usePopover } from "../a11y";
import { Icon } from "../Icon";
import { LiveNumber } from "./ActionFx";

type Item = [suffix: string, label: string, icon: string];

const GROUPS: Array<{ id: string; title: string; items: Item[] }> = [
  {
    id: "voce",
    title: "Você",
    items: [
      ["", "Painel", "home"],
      ["/carreira", "Carreira", "user"],
      ["/financas", "Finanças", "coins"],
      ["/campanha", "Campanha", "megaphone"],
      ["/governo", "Mandato", "landmark"],
      ["/meu-partido", "Meu partido", "star"],
      ["/relacoes", "Relações", "users"],
    ],
  },
  { id: "pais", title: "O país", items: [["/noticias", "Notícias", "newspaper"], ["/eleicoes", "Eleições", "ballot"], ["/partidos", "Partidos", "flag"], ["/mapa", "Mapa", "map"], ["/economia", "Economia", "chart"], ["/ranking", "Ranking", "star"]] },
  { id: "bastidores", title: "Bastidores", items: [["/investigacoes", "Investigações", "search"], ["/esquemas", "Esquemas", "key"], ["/notificacoes", "Notificações", "bell"]] },
];
const ALL = GROUPS.flatMap((g) => g.items);
/** atalhos fixos da barra do celular; o resto fica em "Mais" */
const PRIMARY = ["", "/carreira", "/noticias", "/eleicoes"];
const STORE = "dp:menu-fechado";

export interface SideProfile {
  name: string;
  stage: string;
  /** idade no jogo */
  age: number | null;
  place: string;
  party: { acronym: string; color: string } | null;
  photo: string | null;
  initials: string;
  energy: number;
  money: number;
  reputation: number;
}

function readClosed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function GameSidebar({ year, profile, badges }: { year: number; profile: SideProfile; badges: Record<string, number> }) {
  const path = usePathname();
  const base = `/jogo/${year}`;
  const active = (suffix: string) => (suffix === "" ? path === base : path.startsWith(base + suffix));
  const current = ALL.find(([s]) => active(s));

  // menu "Mais" do celular
  const [more, setMore] = useState(false);
  const moreBox = useRef<HTMLDivElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  usePopover(moreBox, more, () => setMore(false), { trigger: moreBtn, focusFirst: true });

  // grupos recolhidos ficam lembrados neste navegador; o grupo da página atual sempre abre
  const [closed, setClosed] = useState<string[]>([]);
  useEffect(() => setClosed(readClosed()), []);
  useEffect(() => {
    const g = GROUPS.find((x) => x.items.some(([s]) => active(s)));
    if (g) setClosed((c) => (c.includes(g.id) ? c.filter((x) => x !== g.id) : c));
    setMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const toggle = (id: string) =>
    setClosed((c) => {
      const next = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        // sem armazenamento local: vale só nesta visita
      }
      return next;
    });

  const inMore = !!current && !PRIMARY.includes(current[0]);
  const moreBadge = ALL.filter(([s]) => !PRIMARY.includes(s)).reduce((n, [s]) => n + (badges[s] ?? 0), 0);

  const link = ([suffix, label, icon]: Item, cls = "") => (
    <a key={suffix} href={base + suffix} className={[cls, active(suffix) ? "on" : ""].filter(Boolean).join(" ")} aria-current={active(suffix) ? "page" : undefined}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
      {badges[suffix] ? <em className="gnav__badge">{badges[suffix]}</em> : null}
    </a>
  );

  return (
    <>
      <aside className="gside" aria-label="Navegação do jogo">
        <a className="gprofile" href={`${base}/carreira`}>
          <span className="gprofile__avatar" style={{ ["--c" as string]: profile.party?.color ?? "var(--planalto-2)" }}>
            {profile.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.photo} alt="" />
            ) : (
              profile.initials
            )}
          </span>
          <span className="gprofile__who">
            <b>{profile.name}</b>
            <span>
              {profile.stage}
              {profile.age != null ? ` · ${profile.age} anos` : ""}
            </span>
            <span className="gprofile__place">
              {profile.party ? <i className="dot" style={{ background: profile.party.color }} /> : null}
              {profile.party?.acronym ?? "Sem partido"} · {profile.place}
            </span>
          </span>
        </a>
        <div className="gmeters">
          <div title="Energia: recupera 25 por dia de jogo">
            <span>
              <Icon name="zap" size={14} /> Energia
            </span>
            <b>
              <LiveNumber value={profile.energy} />
            </b>
            <i>
              <em style={{ width: `${Math.min(100, profile.energy)}%` }} />
            </i>
          </div>
          <div>
            <span>
              <Icon name="coins" size={14} /> Caixa
            </span>
            <b>
              <LiveNumber value={profile.money} format={(v) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`} />
            </b>
          </div>
          <div>
            <span>
              <Icon name="star" size={14} /> Reputação
            </span>
            <b>
              <LiveNumber value={profile.reputation} />
            </b>
            <i>
              <em style={{ width: `${Math.min(100, profile.reputation)}%`, background: "var(--simulacao)" }} />
            </i>
          </div>
        </div>
        <nav className="gnav" aria-label="Seções">
          {GROUPS.map((g) => {
            const open = !closed.includes(g.id);
            const hidden = g.items.reduce((n, [s]) => n + (badges[s] ?? 0), 0);
            return (
              <div key={g.id} className={`gnav__group${open ? "" : " is-closed"}`}>
                <button type="button" className="gnav__title" aria-expanded={open} aria-controls={`gnav-${g.id}`} onClick={() => toggle(g.id)}>
                  <span>{g.title}</span>
                  {!open && hidden > 0 ? <em className="gnav__badge" aria-label={`${hidden} pendência(s)`}>{hidden}</em> : null}
                  <Icon name="chevron" size={14} className="gnav__chev" />
                </button>
                <div id={`gnav-${g.id}`} className="gnav__items" hidden={!open}>
                  {g.items.map((it) => link(it))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <nav className="gtabs" aria-label="Seções do jogo">
        {ALL.filter(([s]) => PRIMARY.includes(s)).map((it) => link(it, "gtabs__item"))}
        <div className="gtabs__more" ref={moreBox}>
          <button
            type="button"
            ref={moreBtn}
            className={`gtabs__item${inMore ? " on" : ""}`}
            aria-haspopup="dialog"
            aria-expanded={more}
            aria-controls={more ? "gtabs-more" : undefined}
            onClick={() => setMore((o) => !o)}
          >
            <Icon name={inMore ? current![2] : "menu"} size={18} />
            <span>{inMore ? current![1] : "Mais"}</span>
            {moreBadge > 0 && <em className="gnav__badge">{moreBadge}</em>}
          </button>
          {more && (
            <div className="gmore" id="gtabs-more" role="dialog" aria-label="Todas as seções">
              {GROUPS.map((g) => (
                <div key={g.id} className="gmore__group">
                  <div className="gmore__title">{g.title}</div>
                  <div className="gmore__grid">{g.items.map((it) => link(it, "gmore__item"))}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
