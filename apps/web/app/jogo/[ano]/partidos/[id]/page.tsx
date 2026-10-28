import { notFound } from "next/navigation";
import { PartyMark } from "@/components/PartyMark";
import { AXES, AXIS_INFO, ENTRY_CULTURE_LABEL, OFFICES, spectrumLabel, UFS, type FactionRow, type PersonRow } from "@dp/engine";
import { Kpi, MeterRow, Panel, Pill } from "@/components/game/Page";
import { QuickAction } from "@/components/game/QuickAction";
import { PersonAvatar } from "@/components/PersonAvatar";
import { fmtMoney, fmtNum } from "@/lib/format";
import { partyFits } from "@/lib/game-view";
import { getParties, getSession, requireMe } from "@/lib/game";
import { photoOf } from "@/lib/photos";
import { cachedState } from "@/lib/sim";

const KIND: Record<string, { label: string; tone: "ok" | "gold" | "neutral" }> = {
  REAL_ACTIVE_AT_SNAPSHOT: { label: "pessoa real", tone: "ok" },
  REAL_HISTORICAL: { label: "pessoa real", tone: "ok" },
  PLAYER: { label: "jogador(a)", tone: "gold" },
  FICTIONAL_GENERATED: { label: "personagem do jogo", tone: "neutral" },
};

export default async function Page({ params }: { params: Promise<{ ano: string; id: string }> }) {
  const { ano, id } = await params;
  const year = Number(ano);
  const me = await requireMe(year);
  const party = (await getParties(me.worldId)).find((p) => p.id === id);
  if (!party) notFound();
  const { sb } = await getSession();
  const [facQ, peopleQ, state] = await Promise.all([
    sb.from("factions").select("*").eq("world_id", me.worldId).eq("party_id", id),
    sb.from("persons").select("*").eq("world_id", me.worldId).eq("party_id", id).eq("status", "ACTIVE").order("tier").order("reputation", { ascending: false }).limit(48),
    cachedState(me.worldId),
  ]);
  const factions = (facQ.data ?? []) as FactionRow[];
  const people = (peopleQ.data ?? []) as PersonRow[];
  const topUfs = [...UFS].sort((a, b) => (party.territory[b.code] ?? 0) - (party.territory[a.code] ?? 0)).slice(0, 8);
  const fit = partyFits(state, state.t.persons.get(me.person.id) ?? me.person).find((f) => f.party.id === id);
  const mine = me.person.party_id === id;

  return (
    <>
      <div className="phero" style={{ ["--c" as string]: party.color }}>
        <PartyMark party={party} year={year} size={84} />
        <div className="phero__text">
          <div className="ghead__kicker">Partido · nº {party.number}</div>
          <h1>{party.name}</h1>
          <div className="pcard__tags">
            <Pill>{spectrumLabel(party.ideology)}</Pill>
            {party.federation_name && <Pill tone="sim">{party.federation_name}</Pill>}
            {party.gov_alignment === 1 ? <Pill tone="ok">base do governo</Pill> : party.gov_alignment === -1 ? <Pill tone="warn">oposição</Pill> : null}
            {mine && <Pill tone="gold">seu partido</Pill>}
            {party.founder_id && <Pill tone="sim">fundado na simulação</Pill>}
          </div>
        </div>
        <div className="phero__actions">
          {party.president_id === me.person.id && (
            <a className="ui-btn ui-btn--gold ui-btn--sm" href={`/jogo/${year}/meu-partido`}>
              <span>Gerenciar</span>
            </a>
          )}
          <QuickAction year={year} action="investigar_partido" params={{ party: party.id }} label="Investigar as contas" tone="ghost" icon="search" />
          {!mine && <QuickAction year={year} action="reuniao_partidaria" params={{ party: party.id }} label="Ir à reunião aberta" tone="ghost" icon="users" />}
          {!me.person.party_id && <QuickAction year={year} action="pedir_filiacao" params={{ party: party.id }} label="Pedir filiação" tone="gold" icon="flag" />}
        </div>
      </div>
      {party.description && <p className="muted mb">{party.description}</p>}

      <div className="kpis mb">
        <Kpi icon="users" label="Deputados federais" value={party.seats.camara ?? 0} />
        <Kpi icon="landmark" label="Senadores" value={party.seats.senado ?? 0} />
        <Kpi icon="flag" label="Governos estaduais" value={party.seats.governos ?? 0} />
        <Kpi icon="users" label="Filiados (estimativa)" value={fmtNum(party.members)} />
        {fit && <Kpi icon="sliders" label="Afinidade com você" value={`${Math.round(fit.affinity * 100)}%`} />}
      </div>

      <div className="ggrid ggrid--main">
        <div className="gstack">
          <Panel title="Quadros conhecidos" icon="users" aside={<span className="muted small">{people.length} mais influentes</span>}>
            <div className="people">
              {people.map((p) => (
                <a key={p.id} className="person" href={`/jogo/${year}/pessoa/${p.id}`}>
                  <PersonAvatar name={p.name} color={party.color} photo={photoOf(p)} size={40} />
                  <div>
                    <b>{p.name}</b>
                    <span>
                      {p.office_code ? OFFICES[p.office_code].name : p.role_label ?? "filiado(a)"} · {p.uf}
                    </span>
                    <Pill tone={KIND[p.kind]?.tone}>{KIND[p.kind]?.label ?? p.kind}</Pill>
                  </div>
                </a>
              ))}
            </div>
          </Panel>

          <Panel title="Alas internas" icon="sliders">
            <div className="factions">
              {factions.map((f) => (
                <div key={f.id} className="faction">
                  <div className="faction__top">
                    <b>{f.name}</b>
                    <span className="mono">{Math.round(f.strength * 100)}%</span>
                  </div>
                  <MeterRow label="força dentro do partido" value={f.strength * 100} tone="sim" />
                  {mine && <QuickAction year={year} action="aproximar_faccao" params={{ faction: f.id }} label="Aproximar-se desta ala" tone="ghost" />}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="gstack">
          <Panel title="Como entrar" icon="flag">
            <p className="small" style={{ marginTop: 0 }}>{ENTRY_CULTURE_LABEL[party.entry_culture]}</p>
            {fit && !me.person.party_id && <MeterRow label="Chance de aprovar sua filiação agora" value={fit.chance * 100} tone="ok" />}
            <MeterRow label="Disciplina da bancada" value={party.discipline * 100} />
            <MeterRow label="Integridade (muda com a partida)" value={party.integrity * 100} tone={party.integrity < 0.4 ? "bad" : "ok"} />
            <MeterRow label="Reputação" value={party.reputation} tone="sim" />
            <p className="muted small mt">Caixa do partido: {fmtMoney(party.cash)}</p>
          </Panel>

          <Panel title="Onde é forte" icon="map">
            {topUfs.map((u) => (
              <MeterRow key={u.code} label={u.name} value={(party.territory[u.code] ?? 0) * 100} />
            ))}
          </Panel>

          <Panel title="Posições (calibração do jogo)" icon="sliders">
            {AXES.map((ax) => (
              <div key={ax} className="axis">
                <div className="axis__top">
                  <b>{AXIS_INFO[ax].label}</b>
                  <span className="mono">{party.ideology[ax] > 0 ? `+${party.ideology[ax]}` : party.ideology[ax]}</span>
                </div>
                <div className="axis__bar">
                  <i />
                  <em style={{ left: `${(party.ideology[ax] + 100) / 2}%`, background: party.color }} />
                </div>
                <div className="axis__ends">
                  <span>{AXIS_INFO[ax].neg}</span>
                  <span>{AXIS_INFO[ax].pos}</span>
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}

