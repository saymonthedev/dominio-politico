import { ACHIEVEMENTS, careerScore, OFFICES } from "@dp/engine";
import { Empty, GameHeader, Panel, Pill } from "@/components/game/Page";
import { PersonAvatar } from "@/components/PersonAvatar";
import { avatarOf } from "@/lib/avatar";
import { STAGE_LABEL } from "@/components/ui";
import { playerState, requireMe } from "@/lib/game";
import { fmtMoney } from "@/lib/format";

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
  // mural de apoiadores: quem mais doou para campanhas de outros jogadores nas eleições em curso
  const backers = new Map<string, { id: string; name: string; total: number; to: Set<string> }>();
  for (const c of state.t.candidacies.values()) {
    for (const s of c.campaign.supporters ?? []) {
      const b = backers.get(s.id) ?? { id: s.id, name: s.name, total: 0, to: new Set<string>() };
      b.total += s.amount;
      b.to.add(c.person_id);
      backers.set(s.id, b);
    }
  }
  const mural = [...backers.values()].sort((a, b) => b.total - a.total).slice(0, 10);

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
                <PersonAvatar name={r.p.name} color={r.party?.color} avatar={avatarOf(state, r.p)} size={38} />
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
      <Panel title="Mural de apoiadores" icon="heart" className="mt">
        {mural.length ? (
          <ul className="mural">
            {mural.map((b) => (
              <li key={b.id}>
                <PersonAvatar name={b.name} avatar={avatarOf(state, state.t.persons.get(b.id))} size={34} />
                <span className="mural__who">
                  <b>{b.name}</b>
                  <small>
                    apoiou {b.to.size === 1 ? "1 campanha" : `${b.to.size} campanhas`}:{" "}
                    {[...b.to].map((id) => state.t.persons.get(id)?.name ?? "jogador").join(", ")}
                  </small>
                </span>
                <b className="mono">{fmtMoney(b.total)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            Ninguém doou para a campanha de outro jogador nesta eleição. Em período eleitoral, a ação &ldquo;Doar para a campanha de outro jogador&rdquo; aparece em Carreira.
          </p>
        )}
      </Panel>
    </>
  );
}
