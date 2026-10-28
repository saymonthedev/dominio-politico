"use client";
import { usePathname } from "next/navigation";
import { Icon } from "../Icon";

const GROUPS: Array<{ title: string; items: Array<[string, string, string]> }> = [
  {
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
  { title: "O país", items: [["/noticias", "Notícias", "newspaper"], ["/eleicoes", "Eleições", "ballot"], ["/partidos", "Partidos", "flag"], ["/mapa", "Mapa", "map"], ["/economia", "Economia", "chart"]] },
  { title: "Bastidores", items: [["/investigacoes", "Investigações", "search"], ["/esquemas", "Esquemas", "key"], ["/notificacoes", "Notificações", "bell"]] },
];

export interface SideProfile {
  name: string;
  stage: string;
  place: string;
  party: { acronym: string; color: string } | null;
  photo: string | null;
  initials: string;
  energy: number;
  money: string;
  reputation: number;
}

export function GameSidebar({ year, profile, badges }: { year: number; profile: SideProfile; badges: Record<string, number> }) {
  const path = usePathname();
  const base = `/jogo/${year}`;
  const active = (suffix: string) => (suffix === "" ? path === base : path.startsWith(base + suffix));
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
            <span>{profile.stage}</span>
            <span className="gprofile__place">
              {profile.party ? (
                <i className="dot" style={{ background: profile.party.color }} />
              ) : null}
              {profile.party?.acronym ?? "Sem partido"} · {profile.place}
            </span>
          </span>
        </a>
        <div className="gmeters">
          <div title="Energia: recupera 25 por dia de jogo">
            <span>
              <Icon name="zap" size={14} /> Energia
            </span>
            <b>{profile.energy}</b>
            <i>
              <em style={{ width: `${Math.min(100, profile.energy)}%` }} />
            </i>
          </div>
          <div>
            <span>
              <Icon name="coins" size={14} /> Caixa
            </span>
            <b>{profile.money}</b>
          </div>
          <div>
            <span>
              <Icon name="star" size={14} /> Reputação
            </span>
            <b>{profile.reputation}</b>
            <i>
              <em style={{ width: `${Math.min(100, profile.reputation)}%`, background: "var(--simulacao)" }} />
            </i>
          </div>
        </div>
        <nav className="gnav">
          {GROUPS.map((g) => (
            <div key={g.title} className="gnav__group">
              <div className="gnav__title">{g.title}</div>
              {g.items.map(([suffix, label, icon]) => (
                <a key={suffix} href={base + suffix} className={active(suffix) ? "on" : ""} aria-current={active(suffix) ? "page" : undefined}>
                  <Icon name={icon} size={18} />
                  <span>{label}</span>
                  {badges[suffix] ? <em className="gnav__badge">{badges[suffix]}</em> : null}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <nav className="gtabs" aria-label="Seções do jogo">
        {GROUPS.flatMap((g) => g.items).map(([suffix, label, icon]) => (
          <a key={suffix} href={base + suffix} className={active(suffix) ? "on" : ""}>
            <Icon name={icon} size={18} />
            <span>{label}</span>
            {badges[suffix] ? <em className="gnav__badge">{badges[suffix]}</em> : null}
          </a>
        ))}
      </nav>
    </>
  );
}
