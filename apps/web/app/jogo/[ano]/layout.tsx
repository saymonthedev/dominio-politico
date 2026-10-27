import { after } from "next/server";
import { AdvanceTime } from "@/components/AdvanceTime";
import { GameNav } from "@/components/GameNav";
import { LogoMark } from "@/components/Logo";
import { DISCLAIMER } from "@/components/SiteChrome";
import { STAGE_LABEL } from "@/components/ui";
import { fmtDateLong, fmtMoney } from "@/lib/format";
import { getSession, getWorld, requireMe } from "@/lib/game";
import { advanceWorld, ensureWorld } from "@/lib/sim";

export const dynamic = "force-dynamic";

export default async function GameLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const world = await getWorld(year);
  if (!world) await ensureWorld(year);
  const { sb, user } = await getSession();
  const { count } = await sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("world_id", me.worldId).is("read_at", null);

  // O mundo segue andando: se o relógio está atrasado, avança em segundo plano
  if (world) {
    const hours = (Date.now() - Date.parse(world.anchor_real_at)) / 3_600_000;
    const behind = world.anchor_tick + Math.floor(hours * world.game_days_per_real_hour) - world.tick;
    if (behind > 0) after(() => advanceWorld(year).catch(() => undefined));
  }

  return (
    <>
      <header className="masthead">
        <div className="container inner">
          <a className="brand" href="/jogo" title="Seus mundos">
            <LogoMark size={36} />
            <span className="word">
              Domínio <span>Político</span>
              <em>mundo pós-{year}</em>
            </span>
          </a>
          <span className="spacer" />
          <div className="edition">
            <b>{world ? fmtDateLong(world.game_date) : "Montando o mundo…"}</b>
            linha do tempo simulada
          </div>
          <AdvanceTime year={year} />
          <a className="bell" href={`/jogo/${year}/notificacoes`} aria-label={`${count ?? 0} notificações não lidas`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {count ? <span className="count">{count}</span> : null}
          </a>
        </div>
      </header>
      <GameNav year={year} />
      <div className="ribbon">
        <div className="container row between">
          <span>
            <b>{me.person.name}</b> · {STAGE_LABEL[me.person.stage] ?? me.person.stage} · {me.person.municipality} ({me.person.uf})
            {me.party ? ` · ${me.party.acronym}` : ""}
          </span>
          <span className="mono">
            Energia <b>{Math.round(me.state.energy)}</b> · Caixa <b>{fmtMoney(me.state.money)}</b> · Reputação <b>{Math.round(me.person.reputation)}</b>
          </span>
        </div>
      </div>
      <main className="container">{children}</main>
      <footer className="footer">
        <div className="container">
          <p>{DISCLAIMER}</p>
          <p>
            <a href="/manual">Manual</a> · <a href="/fontes">Fontes</a> · <a href="/conta">Minha conta</a>
          </p>
        </div>
      </footer>
    </>
  );
}
