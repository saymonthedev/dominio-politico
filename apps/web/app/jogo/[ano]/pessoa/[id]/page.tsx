import { notFound } from "next/navigation";
import { AXES, AXIS_INFO, CRIMES, OFFICES, canBeTargeted, dossierLabel, geoName, type Finding, type MandateRow, type NewsRow, type PersonRow } from "@dp/engine";
import { NewsList } from "@/components/game/NewsList";
import { Empty, Kpi, Panel, Pill } from "@/components/game/Page";
import { QuickAction } from "@/components/game/QuickAction";
import { Icon } from "@/components/Icon";
import { PersonAvatar, PhotoCredit } from "@/components/PersonAvatar";
import { STAGE_LABEL } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getParties, getSession, partyMap, requireMe } from "@/lib/game";
import { photoOf } from "@/lib/photos";
import { citiesFor } from "@/lib/sim";

const MANDATE: Record<string, { label: string; tone: "ok" | "gold" | "neutral" }> = {
  ATIVO: { label: "em curso", tone: "ok" },
  FUTURO: { label: "posse marcada", tone: "gold" },
  ENCERRADO: { label: "encerrado", tone: "neutral" },
};

export default async function Page({ params }: { params: Promise<{ ano: string; id: string }> }) {
  const { ano, id } = await params;
  const year = Number(ano);
  const cities = await citiesFor(year);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [{ data: p }, mQ, nQ, parties, relQ] = await Promise.all([
    sb.from("persons").select("*").eq("world_id", me.worldId).eq("id", id).maybeSingle(),
    sb.from("mandates").select("*").eq("world_id", me.worldId).eq("person_id", id).order("start_on", { ascending: false }),
    sb.from("news_articles").select("*").eq("world_id", me.worldId).contains("person_ids", [id]).order("tick", { ascending: false }).limit(12),
    getParties(me.worldId),
    sb.from("relationships").select("score,interactions").eq("world_id", me.worldId).eq("a_id", me.person.id).eq("b_id", id).maybeSingle(),
  ]);
  if (!p) notFound();
  const person = p as PersonRow;
  const pm = partyMap(parties);
  const party = person.party_id ? pm[person.party_id] : null;
  const mandates = (mQ.data ?? []) as MandateRow[];
  const news = (nQ.data ?? []) as NewsRow[];
  const real = person.kind === "REAL_ACTIVE_AT_SNAPSHOT" || person.kind === "REAL_HISTORICAL";
  const photo = photoOf(person);
  const isMe = person.id === me.person.id;
  const rel = relQ.data as { score: number; interactions: number } | null;
  const age = Number((await sb.from("worlds").select("game_date").eq("id", me.worldId).maybeSingle()).data?.game_date?.slice(0, 4) ?? year) - person.birth_year;

  return (
    <>
      <div className="phero" style={{ ["--c" as string]: party?.color ?? "var(--planalto-2)" }}>
        <div>
          <PersonAvatar name={person.name} color={party?.color} photo={photo} size={photo ? 96 : 76} />
          {photo && <PhotoCredit photo={photo} />}
        </div>
        <div className="phero__text">
          <div className="ghead__kicker">{real ? "Pessoa real · dados públicos do TSE" : person.kind === "PLAYER" ? "Jogador(a)" : "Personagem gerado pelo jogo"}</div>
          <h1>{person.name}</h1>
          <div className="pcard__tags">
            {person.office_code ? <Pill tone="gold">{OFFICES[person.office_code].name}</Pill> : <Pill>{person.role_label ?? STAGE_LABEL[person.stage] ?? person.stage}</Pill>}
            {party ? (
              <a href={`/jogo/${year}/partidos/${party.id}`} className="pill" style={{ background: party.color, color: "#fff" }}>
                {party.acronym}
              </a>
            ) : (
              <Pill>sem partido</Pill>
            )}
            <Pill>{person.uf}</Pill>
            {person.status !== "ACTIVE" && <Pill tone="bad">{person.status_note ?? "fora da vida pública"}</Pill>}
          </div>
        </div>
        {!isMe && person.status === "ACTIVE" && person.kind !== "PLAYER" && (
          <div className="phero__actions">
            <QuickAction year={year} action="conversar" params={{ target: person.id }} label="Conversar" tone="ghost" icon="users" />
          </div>
        )}
      </div>

      {real && (
        <div className="hint-band">
          <Icon name="shield" size={18} />
          <span>
            Os fatos do ponto de partida vêm do TSE. Depois disso, a atuação desta pessoa no jogo é <b>simulação</b>. O jogo não atribui a pessoas reais crimes, falas, saúde ou
            vida íntima inventados — por isso ela não pode ser investigada aqui.
          </span>
        </div>
      )}

      <div className="kpis mb">
        <Kpi label="Idade" value={`${age} anos`} />
        <Kpi label="Reputação" value={Math.round(person.reputation)} />
        <Kpi label="Visibilidade" value={Math.round(person.visibility)} />
        {!isMe && <Kpi label="Sua relação" value={rel ? Math.round(rel.score) : "—"} hint={rel ? `${rel.interactions} conversa(s)` : "vocês ainda não conversaram"} tone={rel ? (rel.score >= 0 ? "up" : "down") : undefined} />}
      </div>

      {!isMe && canBeTargeted(person) && <DossierPanel year={year} person={person} findings={(me.state.findings ?? {})[person.id] ?? []} level={me.state.dossiers?.[person.id] ?? 0} />}

      <div className="ggrid ggrid--main">
        <Panel title="No noticiário" icon="newspaper">
          {news.length ? <NewsList news={news} compact /> : <Empty icon="newspaper" title="Sem notícias recentes" />}
        </Panel>
        <div className="gstack">
          <Panel title="Mandatos" icon="landmark">
            {mandates.length ? (
              <ol className="tline">
                {mandates.map((m) => (
                  <li key={m.id}>
                    <span className="tline__date mono">{m.start_on.slice(0, 4)}–{m.end_on.slice(0, 4)}</span>
                    <span>
                      <b>{OFFICES[m.office_code].name}</b> · {geoName(m.geo, { cities })} <Pill tone={MANDATE[m.status]?.tone}>{MANDATE[m.status]?.label ?? m.status}</Pill>
                      <small className="muted mono" style={{ display: "block" }}>
                        {fmtDate(m.start_on)} → {fmtDate(m.end_on)}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">Nenhum mandato registrado.</p>
            )}
          </Panel>
          <Panel title={real ? "Posição estimada (pelo partido)" : "Posições"} icon="sliders">
            {AXES.map((ax) => (
              <div key={ax} className="axis">
                <div className="axis__top">
                  <b>{AXIS_INFO[ax].label}</b>
                  <span className="mono">{person.ideology[ax] > 0 ? `+${person.ideology[ax]}` : person.ideology[ax]}</span>
                </div>
                <div className="axis__bar">
                  <i />
                  <em style={{ left: `${(person.ideology[ax] + 100) / 2}%` }} />
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

function DossierPanel({ year, person, findings, level }: { year: number; person: PersonRow; findings: Finding[]; level: number }) {
  const proof = findings.filter((f) => f.verified && f.act_id).length;
  return (
    <Panel
      title="Seu dossiê"
      icon="file"
      className="mb"
      aside={
        <span className="pend__actions">
          <QuickAction year={year} action="investigar" params={{ target: person.id }} label={findings.length ? "Aprofundar" : "Levantar informações"} tone="ghost" icon="search" />
          {proof > 0 && <QuickAction year={year} action="denunciar" params={{ target: person.id, authority: "PF" }} label="Denunciar à PF" tone="primary" icon="shield" />}
        </span>
      }
    >
      {findings.length ? (
        <>
          <p className="small" style={{ marginTop: 0 }}>
            Situação: <b>{dossierLabel(level)}</b> ({Math.round(level * 100)}%).
          </p>
          <ul className="findings">
            {[...findings].reverse().slice(0, 6).map((f) => (
              <li key={f.id} className={`finding finding--${f.act_id ? "ok" : f.verified ? "none" : "rumor"}`}>
                <Icon name={f.act_id ? "check" : f.verified ? "shield" : "info"} size={14} />
                <span>
                  {f.text}
                  <small>{f.act_id ? `prova${f.crime ? ` de ${CRIMES[f.crime].label.toLowerCase()}` : ""}` : f.verified ? "nada encontrado" : "pista sem prova"}</small>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          Você ainda não investigou {person.name}. O levantamento mostra o que de fato aparecer nas fontes — inclusive quando não há nada.
        </p>
      )}
    </Panel>
  );
}
