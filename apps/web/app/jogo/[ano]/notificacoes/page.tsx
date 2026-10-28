import type { AffiliationRequestRow, NotificationRow, PartyRow } from "@dp/engine";
import { Icon } from "@/components/Icon";
import { Empty, GameHeader, Panel, Pill } from "@/components/game/Page";
import { QuickAction } from "@/components/game/QuickAction";
import { fmtDate } from "@/lib/format";
import { getParties, getSession, partyMap, requireMe } from "@/lib/game";
import { inviteIdOf, resolveLink } from "@/lib/links";

/** Ícone pelo assunto da notificação. */
function iconOf(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("convite") || t.includes("filia")) return "flag";
  if (t.includes("eleit") || t.includes("candidat") || t.includes("turno") || t.includes("convenç")) return "ballot";
  if (t.includes("posse") || t.includes("mandato")) return "landmark";
  if (t.includes("investig") || t.includes("denún") || t.includes("prova") || t.includes("cpi")) return "search";
  if (t.includes("oferta") || t.includes("propina") || t.includes("caixa")) return "coins";
  return "bell";
}

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [nQ, reqQ, parties] = await Promise.all([
    sb.from("notifications").select("*").eq("world_id", me.worldId).order("tick", { ascending: false }).limit(150),
    sb.from("affiliation_requests").select("*").eq("world_id", me.worldId).eq("person_id", me.person.id).eq("status", "PENDENTE"),
    getParties(me.worldId),
  ]);
  const list = (nQ.data ?? []) as NotificationRow[];
  const pendingReqs = (reqQ.data ?? []) as AffiliationRequestRow[];
  const pm = partyMap(parties);
  const invites = pendingReqs.filter((r) => r.kind === "CONVITE");
  const openInvites = new Set(invites.map((r) => r.id));
  // abrir a página já conta como leitura
  if (list.some((n) => !n.read_at)) await sb.rpc("mark_notifications_read", { p_ids: null });

  const groups = new Map<string, NotificationRow[]>();
  for (const n of list) groups.set(n.game_date, [...(groups.get(n.game_date) ?? []), n]);

  return (
    <>
      <GameHeader kicker="Bastidores" icon="bell" title="Notificações" lede="Tudo o que aconteceu com você no jogo. As novas aparecem destacadas e ficam lidas assim que você abre esta página." />
      {invites.length > 0 && (
        <Panel title="Convites esperando resposta" icon="flag" tone="gold" className="mb">
          <div className="invites">
            {invites.map((r) => (
              <InviteCard key={r.id} year={year} req={r} party={pm[r.party_id]} />
            ))}
          </div>
        </Panel>
      )}
      <Panel>
        {list.length ? (
          <div className="ntl">
            {[...groups.entries()].map(([date, items]) => (
              <div key={date} className="ntl__day">
                <div className="ntl__date mono">{fmtDate(date)}</div>
                <div className="ntl__items">
                  {items.map((n) => {
                    const href = resolveLink(n.link, year);
                    const invite = inviteIdOf(n.link);
                    return (
                      <div key={n.id} className={`ntl__item${n.read_at ? "" : " is-new"}`}>
                        <span className="ntl__icon">
                          <Icon name={iconOf(n.title)} size={16} />
                        </span>
                        <div>
                          <div className="ntl__title">
                            {href && !invite ? <a href={href}>{n.title}</a> : <b>{n.title}</b>}
                            {!n.read_at && <Pill tone="gold">nova</Pill>}
                          </div>
                          <p>{n.body}</p>
                          {invite && openInvites.has(invite) && (
                            <div className="ntl__actions">
                              <QuickAction year={year} action="responder_convite" params={{ request: invite, decision: "ACEITAR" }} label="Aceitar filiação" tone="gold" icon="check" />
                              <QuickAction year={year} action="responder_convite" params={{ request: invite, decision: "RECUSAR" }} label="Recusar" tone="ghost" />
                            </div>
                          )}
                          {invite && !openInvites.has(invite) && <small className="muted">Convite já respondido ou expirado.</small>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon="bell" title="Nenhuma notificação ainda">
            Passe o tempo no Painel e tome decisões: pedidos de filiação, convites, eleições e investigações aparecem aqui.
          </Empty>
        )}
      </Panel>
    </>
  );
}

function InviteCard({ year, req, party }: { year: number; req: AffiliationRequestRow; party: PartyRow | undefined }) {
  return (
    <div className="invite" style={{ ["--c" as string]: party?.color ?? "var(--planalto)" }}>
      <div className="invite__party">
        <span className="invite__mark">{party?.acronym ?? "?"}</span>
        <div>
          <b>{party?.name ?? "Partido"}</b>
          <span>{req.reason ?? "Convite de filiação"}</span>
          <small className="mono">Vale até {fmtDate(req.decide_on)}</small>
        </div>
      </div>
      <div className="invite__actions">
        <QuickAction year={year} action="responder_convite" params={{ request: req.id, decision: "ACEITAR" }} label="Aceitar filiação" tone="gold" icon="check" />
        <QuickAction year={year} action="responder_convite" params={{ request: req.id, decision: "RECUSAR" }} label="Recusar" tone="ghost" />
      </div>
    </div>
  );
}
