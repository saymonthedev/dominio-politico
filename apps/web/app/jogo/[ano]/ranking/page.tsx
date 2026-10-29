import { ACHIEVEMENTS, careerScore, OFFICES } from "@dp/engine";
import { Empty, GameHeader, Panel, Pill } from "@/components/game/Page";
import { PersonAvatar } from "@/components/PersonAvatar";
import { STAGE_LABEL } from "@/components/ui";
import { playerState, requireMe } from "@/lib/game";

/** Ranking dos jogadores do mundo: conquistas, cargo atual e reputação. */
export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const state = await playerState(year);
  const rows = [...state.t.persons.values()]
    .filter((p) => p.kind === "PLAYER" && p.status === "ACTIVE")
    .map((p) => {
      const st = state.t.person_states.get(p.id);
      const party = p.party_id ? state.t.parties.get(p.party_id) : undefined;
      return { p, party, score: careerScore(p, st), achs: Object.keys(st?.achievements ?? {}).length };
    })
    .sort((a, b) => b.score - a.score || b.p.reputation - a.p.reputation);
  const mine = rows.findIndex((r) => r.p.id === me.person.id);

  return (
    <>
      <GameHeader
        kicker="O país"
        icon="star"
        title="Ranking"
        lede={`Os jogadores deste mundo, pelos pontos de carreira: conquistas, cargo atual e reputação. ${mine >= 0 ? `Você está em ${mine + 1}º de ${rows.length}.` : ""}`}
      />
      <Panel title="Jogadores" icon="users" aside={<span className="muted small">{ACHIEVEMENTS.length} conquistas possíveis</span>}>
        {rows.length ? (
          <ol className="rank">
            {rows.map((r, i) => (
              <li key={r.p.id} className={r.p.id === me.person.id ? "is-me" : ""}>
                <span className="rank__pos mono">{i + 1}</span>
                <PersonAvatar name={r.p.name} color={r.party?.color} size={38} />
                <div className="rank__who">
                  <b>{r.p.name}</b>
                  <span>
                    {r.p.office_code ? OFFICES[r.p.office_code].name : STAGE_LABEL[r.p.stage] ?? r.p.stage} · {r.party?.acronym ?? "sem partido"} · {r.p.uf}
                  </span>
                </div>
                <Pill tone="sim">{r.achs} conquistas</Pill>
                <b className="rank__score mono">{r.score}</b>
              </li>
            ))}
          </ol>
        ) : (
          <Empty icon="users" title="Nenhum jogador ainda" />
        )}
      </Panel>
    </>
  );
}
