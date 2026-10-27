import type { NotificationRow } from "@dp/engine";
import { SubmitButton } from "@/components/forms";
import { markAllRead } from "@/app/jogo/actions";
import { fmtDate } from "@/lib/format";
import { getSession, requireMe } from "@/lib/game";

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const { data } = await sb.from("notifications").select("*").eq("world_id", me.worldId).order("tick", { ascending: false }).limit(100);
  const list = (data ?? []) as NotificationRow[];
  return (
    <>
      <div className="row between">
        <h1>Notificações</h1>
        <form action={markAllRead}>
          <input type="hidden" name="__year" value={year} />
          <SubmitButton tone="ghost" size="sm" icon="check" pendingLabel="Marcando…">Marcar todas como lidas</SubmitButton>
        </form>
      </div>
      <div className="card">
        {list.length ? (
          list.map((n) => (
            <div key={n.id} className="news">
              <div className="meta">
                <span className="mono">{fmtDate(n.game_date)}</span>
                {!n.read_at && <span className="badge gold plain">nova</span>}
              </div>
              <h3 style={{ fontSize: "1rem" }}>{n.link ? <a href={`/jogo/${year}${n.link.replace(/^\/jogo/, "")}`}>{n.title}</a> : n.title}</h3>
              <p>{n.body}</p>
            </div>
          ))
        ) : (
          <div className="empty">Nenhuma notificação.</div>
        )}
      </div>
    </>
  );
}
