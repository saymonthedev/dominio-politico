import { Ctx, FAMILY_ACTION_IDS, familyOf, monthlyStatement, roleLabel, type FamilyMember } from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { AvatarSvg } from "@/components/Avatar";
import { GameHeader, Panel } from "@/components/game/Page";
import { actionsFor } from "@/lib/actions-view";
import { avatarCode, defaultAvatar, parseAvatar } from "@/lib/avatar-code";
import { fmtMoney } from "@/lib/format";
import { playerState, requireMe } from "@/lib/game";

/** Rosto de cada familiar: sorteado pelo personagem e pelo familiar, com cabelo grisalho nos pais e roupa de criança nos pequenos. */
function memberAvatar(seed: string, m: FamilyMember, age: number): string {
  const s = parseAvatar(defaultAvatar(`${seed}|${m.id}`))!;
  if (m.role === "PAI" || m.role === "MAE") s.hairColor = age > 70 ? 6 : 5;
  if (age < 18) Object.assign(s, { facial: 0, glasses: 0, top: 3 });
  if (m.female && (s.facial ?? 0) > 0) s.facial = 0;
  return avatarCode(s);
}

function bondLabel(v: number): [string, string] {
  if (v >= 75) return ["Muito próxima", "ok"];
  if (v >= 50) return ["Próxima", "ok"];
  if (v >= 30) return ["Um pouco distante", "warn"];
  return ["Distante", "bad"];
}

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const state = await playerState(year);
  const p = state.t.persons.get(me.person.id) ?? me.person;
  const st = state.t.person_states.get(me.person.id) ?? me.state;
  const members = familyOf({ world: state.world, date: state.world.game_date }, p, st);
  const now = Number(state.world.game_date.slice(0, 4));
  const kids = members.filter((m) => m.role === "FILHO" && now - m.born < 18).length;
  const statement = kids ? monthlyStatement(new Ctx(state, "view"), p, st) : null;
  const kidsCost = statement?.items.find((i) => i.kind === "FAMILIA")?.amount ?? 0;
  const actions = actionsFor(state, me.person.id, ["VIDA"]).filter((a) => FAMILY_ACTION_IDS.has(a.id));
  const order = { CONJUGE: 0, FILHO: 1, MAE: 2, PAI: 3 } as const;

  return (
    <>
      <GameHeader kicker="Vida" icon="users" title="Família" lede="Quem está com você fora da política. A convivência descansa e aproxima; a ausência pesa, e no limite o casamento acaba." />
      <div className="ggrid ggrid--main">
        <div className="gstack">
          <Panel title="Sua família" icon="users">
            {members.length ? (
              <ul className="fam">
                {[...members]
                  .sort((a, b) => order[a.role] - order[b.role] || a.born - b.born)
                  .map((m) => {
                    const age = now - m.born;
                    const [label, tone] = bondLabel(m.bond);
                    return (
                      <li key={m.id} className="fam__card">
                        <span className="fam__face">
                          <AvatarSvg code={memberAvatar(me.person.id, m, age)} />
                        </span>
                        <div className="fam__who">
                          <b>{m.name}</b>
                          <span>
                            {roleLabel(m)} · {age <= 0 ? "recém-nascido(a)" : `${age} ${age === 1 ? "ano" : "anos"}`}
                          </span>
                          <div className={`fam__bond is-${tone}`} title={`Proximidade ${Math.round(m.bond)} de 100`}>
                            <i>
                              <em style={{ width: `${Math.max(4, m.bond)}%` }} />
                            </i>
                            <small>{label}</small>
                          </div>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <p className="muted">Sua família de origem já se foi. Você pode casar e ter filhos nas ações ao lado.</p>
            )}
            {kidsCost < 0 && (
              <p className="muted small mt">
                Despesas com {kids === 1 ? "o filho" : `os ${kids} filhos`} menores de idade: {fmtMoney(Math.abs(kidsCost))} por mês, no fechamento do mês.
              </p>
            )}
          </Panel>
        </div>
        <div className="gstack">
          <Panel title="Tempo com a família" icon="heart">
            <ActionPanel year={year} actions={actions} empty="Nada a fazer com a família agora." />
          </Panel>
          <Panel title="Como funciona" icon="info">
            <ul className="bhelp">
              <li>A proximidade cai um pouco todo mês, e mais quando você está muito cansado(a).</li>
              <li>Família próxima ajuda a descansar no fechamento do mês; distante, aumenta o cansaço.</li>
              <li>Se a relação com o cônjuge chegar a zero, vocês se separam.</li>
              <li>Cada filho menor de idade entra nas despesas do mês até os 18 anos.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
