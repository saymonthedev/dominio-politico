import { ENTRY_CULTURE_LABEL, spectrumLabel } from "@dp/engine";
import { PartyMark } from "@/components/PartyMark";
import { GameHeader, Pill } from "@/components/game/Page";
import { MoreList } from "@/components/game/MoreList";
import { QuickAction } from "@/components/game/QuickAction";
import { Icon } from "@/components/Icon";
import { actionsFor } from "@/lib/actions-view";
import { partyFits } from "@/lib/game-view";
import { playerState, requireMe } from "@/lib/game";
import { Term } from "@/components/Term";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default async function Page({ params, searchParams }: { params: Promise<{ ano: string }>; searchParams: Promise<{ ordem?: string }> }) {
  const year = Number((await params).ano);
  const { ordem = "afinidade" } = await searchParams;
  const me = await requireMe(year);
  const state = await playerState(year);
  const person = state.t.persons.get(me.person.id) ?? me.person;
  let fits = partyFits(state, person);
  if (ordem === "bancada") fits = [...fits].sort((a, b) => (b.party.seats.camara ?? 0) - (a.party.seats.camara ?? 0));
  if (ordem === "chance") fits = [...fits].sort((a, b) => b.chance - a.chance);
  const acts = actionsFor(state, me.person.id, ["BASE"]);
  const reason = (id: string) => acts.find((a) => a.id === id)?.reason ?? null;
  const askReason = reason("pedir_filiacao");
  const meetReason = reason("reuniao_partidaria");
  const best = fits[0];

  return (
    <>
      <GameHeader
        kicker="O país"
        icon="flag"
        title="Partidos"
        lede={
          <>
            Os partidos reais do ponto de partida. Bancadas, número e <Term k="Federação partidária">federação</Term> são fatos; posição nos eixos,{" "}
            <Term k="Cultura de entrada">cultura de entrada</Term> e integridade são do jogo e mudam com a partida.
          </>
        }
      >
        <div className="seg" role="tablist" aria-label="Ordenar">
          {[
            ["afinidade", "Afinidade"],
            ["chance", "Chance de entrar"],
            ["bancada", "Bancada"],
          ].map(([k, label]) => (
            <a key={k} role="tab" aria-selected={ordem === k} className={ordem === k ? "on" : ""} href={`?ordem=${k}`}>
              {label}
            </a>
          ))}
        </div>
      </GameHeader>

      {!me.person.party_id && best && (
        <div className="hint-band">
          <Icon name="info" size={18} />
          <span>
            O partido mais próximo das suas posições é o <b>{best.party.acronym}</b> ({pct(best.affinity)} de afinidade). Ir a reuniões abertas aproxima você das
            lideranças e aumenta a chance de aprovação.
          </span>
        </div>
      )}

      <MoreList count={fits.length} label="partidos">
      <div className="pgrid">
        {fits.map(({ party: p, affinity, chance }) => {
          const mine = me.person.party_id === p.id;
          return (
            <article key={p.id} className={`pcard${mine ? " is-mine" : ""}`} style={{ ["--c" as string]: p.color }}>
              <div className="pcard__band" />
              <div className="pcard__head">
                <PartyMark party={p} year={year} size={54} />
                <div>
                  <a href={`/jogo/${year}/partidos/${p.id}`} className="pcard__name">
                    {p.name}
                  </a>
                  <span>
                    nº {p.number}
                    {p.federation_name ? ` · ${p.federation_name}` : ""}
                  </span>
                </div>
                {mine && <Pill tone="gold">seu partido</Pill>}
              </div>
              <div className="pcard__tags">
                <Pill>{spectrumLabel(p.ideology)}</Pill>
                {p.gov_alignment === 1 ? <Pill tone="ok">base do governo</Pill> : p.gov_alignment === -1 ? <Pill tone="warn">oposição</Pill> : null}
              </div>
              <div className="pcard__nums">
                <div>
                  <b>{p.seats.camara ?? 0}</b>
                  <span>deputados</span>
                </div>
                <div>
                  <b>{p.seats.senado ?? 0}</b>
                  <span>senadores</span>
                </div>
                <div>
                  <b>{p.seats.governos ?? 0}</b>
                  <span>governos</span>
                </div>
              </div>
              <div className="pcard__fit">
                <div>
                  <span>Afinidade com você</span>
                  <b>{pct(affinity)}</b>
                </div>
                <i>
                  <em style={{ width: pct(affinity) }} />
                </i>
                {!me.person.party_id && (
                  <>
                    <div>
                      <span>Chance de aprovar filiação agora</span>
                      <b>{pct(chance)}</b>
                    </div>
                    <i>
                      <em style={{ width: pct(chance), background: "var(--mata)" }} />
                    </i>
                  </>
                )}
              </div>
              <p className="pcard__culture">{ENTRY_CULTURE_LABEL[p.entry_culture]}</p>
              <div className="pcard__actions">
                {!mine && !meetReason && <QuickAction year={year} action="reuniao_partidaria" params={{ party: p.id }} label="Ir à reunião" tone="ghost" icon="users" />}
                {!me.person.party_id && !askReason && <QuickAction year={year} action="pedir_filiacao" params={{ party: p.id }} label="Pedir filiação" tone="gold" icon="flag" />}
                <a className="ui-btn ui-btn--ghost ui-btn--sm" href={`/jogo/${year}/partidos/${p.id}`}>
                  <span>Detalhes</span>
                </a>
              </div>
            </article>
          );
        })}
      </div>
      </MoreList>
      {!me.person.party_id && askReason && <p className="muted small mt">Pedir filiação: {askReason}</p>}
    </>
  );
}
