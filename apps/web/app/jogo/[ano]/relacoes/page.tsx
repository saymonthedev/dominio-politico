import { OFFICES, type PersonRow, type RelationshipRow } from "@dp/engine";
import { Empty, GameHeader, Kpi, Panel, Pill } from "@/components/game/Page";
import { QuickAction } from "@/components/game/QuickAction";
import { PersonAvatar } from "@/components/PersonAvatar";
import { PartyChip } from "@/components/ui";
import { getParties, getSession, partyMap, requireMe } from "@/lib/game";
import { photoOf } from "@/lib/photos";
import { cachedState } from "@/lib/sim";

const roleOf = (p: PersonRow) => (p.office_code ? OFFICES[p.office_code].name : p.role_label ?? (p.kind === "PLAYER" ? "jogador(a)" : "político(a)"));

function tone(score: number): { label: string; tone: "ok" | "bad" | "neutral" | "gold" } {
  if (score >= 50) return { label: "aliado(a)", tone: "gold" };
  if (score >= 15) return { label: "próximo(a)", tone: "ok" };
  if (score <= -15) return { label: "desafeto", tone: "bad" };
  return { label: "conhecido(a)", tone: "neutral" };
}

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, parties, relQ] = await Promise.all([
    cachedState(me.worldId),
    getParties(me.worldId),
    sb.from("relationships").select("*").eq("world_id", me.worldId).eq("a_id", me.person.id).order("score", { ascending: false }),
  ]);
  const pm = partyMap(parties);
  const rels = (relQ.data ?? []) as RelationshipRow[];
  const people = new Map<string, PersonRow>();
  if (rels.length) {
    const { data } = await sb.from("persons").select("*").eq("world_id", me.worldId).in("id", rels.map((r) => r.b_id));
    for (const p of (data ?? []) as PersonRow[]) people.set(p.id, p);
  }
  // quem vale conhecer: lideranças alcançáveis (da sua UF ou nacionais) que você ainda não conhece
  const known = new Set(rels.map((r) => r.b_id));
  const suggestions = [...state.t.persons.values()]
    .filter((p) => p.status === "ACTIVE" && p.id !== me.person.id && p.kind !== "PLAYER" && !known.has(p.id) && (p.uf === me.person.uf || p.tier <= 1))
    .sort((a, b) => {
      const sameA = me.person.party_id && a.party_id === me.person.party_id ? 1 : 0;
      const sameB = me.person.party_id && b.party_id === me.person.party_id ? 1 : 0;
      return sameB - sameA || (a.uf === me.person.uf ? 0 : 1) - (b.uf === me.person.uf ? 0 : 1) || b.reputation - a.reputation;
    })
    .slice(0, 9);
  const allies = rels.filter((r) => r.score >= 15).length;
  const foes = rels.filter((r) => r.score <= -15).length;

  return (
    <>
      <GameHeader
        kicker="Bastidores"
        icon="users"
        title="Relações"
        lede="Relacionamento abre portas: alguns partidos só filiam quem tem padrinho, convites chegam de quem gosta de você e aliados pesam nas convenções."
      />

      <div className="kpis mb">
        <Kpi icon="users" label="Pessoas que você conhece" value={rels.length} />
        <Kpi icon="star" label="Próximos e aliados" value={allies} tone={allies ? "up" : undefined} />
        <Kpi icon="alert" label="Desafetos" value={foes} tone={foes ? "warn" : undefined} />
        <Kpi icon="zap" label="Energia" value={`${Math.round(me.state.energy)}/100`} hint="cada conversa gasta 10" />
      </div>

      <div className="ggrid ggrid--main">
        <Panel title="Sua rede" icon="users">
          {rels.length ? (
            <div className="rels">
              {rels.map((r) => {
                const p = people.get(r.b_id);
                if (!p) return null;
                const party = p.party_id ? pm[p.party_id] : undefined;
                const t = tone(r.score);
                return (
                  <div key={r.id} className="rel">
                    <a href={`/jogo/${year}/pessoa/${p.id}`} className="rel__who">
                      <PersonAvatar name={p.name} color={party?.color} photo={photoOf(p)} size={40} />
                      <div>
                        <b>{p.name}</b>
                        <span>
                          {roleOf(p)} · {p.uf}
                        </span>
                      </div>
                    </a>
                    <div className="rel__meta">
                      {party ? <PartyChip party={party} /> : <Pill>sem partido</Pill>}
                      <Pill tone={t.tone}>{t.label}</Pill>
                    </div>
                    <div className="rel__score">
                      <i>
                        <em className={r.score >= 0 ? "pos" : "neg"} style={{ width: `${Math.min(50, Math.abs(r.score) / 2)}%` }} />
                      </i>
                      <small className="mono">
                        {r.score > 0 ? "+" : ""}
                        {Math.round(r.score)} · {r.interactions} conversa(s)
                      </small>
                    </div>
                    {p.status === "ACTIVE" && <QuickAction year={year} action="conversar" params={{ target: p.id }} label="Conversar" tone="ghost" icon="users" />}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty icon="users" title="Você ainda não conhece ninguém">
              Comece pelas sugestões de quem vale conhecer ou vá a uma reunião aberta de partido.
            </Empty>
          )}
        </Panel>

        <Panel title="Quem vale conhecer" icon="star" tone="gold">
          {suggestions.length ? (
            <div className="sugs">
              {suggestions.map((p) => {
                const party = p.party_id ? pm[p.party_id] : undefined;
                return (
                  <div key={p.id} className="sug">
                    <a href={`/jogo/${year}/pessoa/${p.id}`} className="rel__who">
                      <PersonAvatar name={p.name} color={party?.color} photo={photoOf(p)} size={36} />
                      <div>
                        <b>{p.name}</b>
                        <span>
                          {roleOf(p)} · {party?.acronym ?? "sem partido"} · {p.uf}
                        </span>
                      </div>
                    </a>
                    <QuickAction year={year} action="conversar" params={{ target: p.id }} label="Conversar" tone="gold" />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              Você já conhece as principais lideranças ao seu alcance.
            </p>
          )}
          <p className="muted small mt" style={{ marginBottom: 0 }}>
            Você alcança políticos da sua UF ({me.person.uf}) e lideranças nacionais. Afinidade de ideias e carisma aumentam o ganho de cada conversa.
          </p>
        </Panel>
      </div>
    </>
  );
}
