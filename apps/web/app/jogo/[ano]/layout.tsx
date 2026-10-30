import { after } from "next/server";
import { canonicalGeo, geoName, type NotificationRow } from "@dp/engine";
import { GameSidebar } from "@/components/game/GameSidebar";
import { HashScroll } from "@/components/game/HashScroll";
import { NotificationBell } from "@/components/game/NotificationBell";
import { StoryBell } from "@/components/game/StoryCenter";
import { Toaster } from "@/components/game/Toaster";
import { UserMenu } from "@/components/game/UserMenu";
import { LogoMark } from "@/components/Logo";
import { STAGE_LABEL } from "@/components/ui";
import { initials } from "@/lib/format";
import { getSession, getWorld, requireMe } from "@/lib/game";
import { advanceWorld, citiesFor, ensureWorld } from "@/lib/sim";

export const dynamic = "force-dynamic";
/** avançar 30 dias pode levar alguns segundos */
export const maxDuration = 60;

const WEEKDAY = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MONTH = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default async function GameLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const world = await getWorld(year);
  if (!world) await ensureWorld(year);
  const { sb, user } = await getSession();
  const [unreadQ, recentQ, invitesQ, cities] = await Promise.all([
    sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("world_id", me.worldId).is("read_at", null),
    sb.from("notifications").select("*").eq("user_id", user!.id).eq("world_id", me.worldId).order("tick", { ascending: false }).limit(8),
    sb.from("affiliation_requests").select("id").eq("world_id", me.worldId).eq("person_id", me.person.id).eq("kind", "CONVITE").eq("status", "PENDENTE"),
    citiesFor(year),
  ]);
  const unread = unreadQ.count ?? 0;
  // acontecimentos esperando resposta (os que seguram o tempo primeiro)
  const storyPending = [...(me.state.story?.pending ?? [])].sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.on.localeCompare(b.on));
  const invites = (invitesQ.data ?? []).map((r) => r.id as string);

  // O mundo segue andando: se o relógio está atrasado, avança em segundo plano
  if (world) {
    const hours = (Date.now() - Date.parse(world.anchor_real_at)) / 3_600_000;
    const behind = world.anchor_tick + Math.floor(hours * world.game_days_per_real_hour) - world.tick;
    if (behind > 0) after(() => advanceWorld(year).catch(() => undefined));
  }
  const d = world ? new Date(`${world.game_date}T12:00:00Z`) : null;
  const city = canonicalGeo(me.person.municipality);
  const place = /^\d{7}$/.test(city) ? geoName(city, { cities }) : me.person.uf;

  return (
    <Toaster>
      <a className="skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="gtop">
        <div className="gtop__inner">
          <a className="gtop__brand" href="/jogo" title="Seus mundos">
            <LogoMark size={34} />
            <span>
              <b>
                Domínio <em>Político</em>
              </b>
              <small>Brasil pós-{year}{world?.stats?.fictional ? " · fictício" : world?.stats?.private ? " · só seu" : ""}</small>
            </span>
          </a>
          <a className="gtop__date" href={`/jogo/${year}#tempo`} title="Passar o tempo no painel">
            {d ? (
              <>
                <small>{WEEKDAY[d.getUTCDay()]}</small>
                <b>
                  {d.getUTCDate()} de {MONTH[d.getUTCMonth()]} de {d.getUTCFullYear()}
                </b>
              </>
            ) : (
              <b>Montando o mundo…</b>
            )}
          </a>
          <span className="gtop__spacer" />
          <StoryBell year={year} events={storyPending} today={world?.game_date ?? storyPending[0]?.on ?? ""} />
          <NotificationBell
            year={year}
            unread={unread}
            openInvites={invites}
            items={((recentQ.data ?? []) as NotificationRow[]).map((n) => ({ id: n.id, title: n.title, body: n.body, date: n.game_date, link: n.link, unread: !n.read_at }))}
          />
          <UserMenu initials={initials(me.person.name)} />
        </div>
      </header>
      <div className="gshell">
        <GameSidebar
          year={year}
          badges={{ "/notificacoes": unread, "": invites.length }}
          profile={{
            name: me.person.name,
            stage: STAGE_LABEL[me.person.stage] ?? me.person.stage,
            age: world?.game_date ? Number(world.game_date.slice(0, 4)) - me.person.birth_year : null,
            place,
            party: me.party ? { acronym: me.party.acronym, color: me.party.color } : null,
            photo: null,
            initials: initials(me.person.name),
            energy: Math.round(me.state.energy),
            money: Math.round(me.state.money),
            reputation: Math.round(me.person.reputation),
            attrs: [
              { label: "Ativismo", value: Math.min(100, me.state.activism), goal: me.person.stage === "CIDADAO" ? 20 : undefined, hint: "Engajamento em causas e na comunidade. Com 20, você vira ativista." },
              ...(me.party ? [{ label: "Prestígio no partido", value: me.state.party_standing, goal: me.person.stage === "FILIADO" ? 45 : undefined, hint: "Peso dentro do partido: conta na convenção e nas indicações." }] : []),
              { label: "Capital político", value: me.state.political_capital, hint: "Favores, contatos e influência acumulados." },
              { label: "Preparo para debates", value: me.state.debate_prep, hint: "Treino de oratória e debate." },
              { label: "Alcance no estado", value: Math.round((me.state.reach?.[me.person.uf] ?? 0) * 100), suffix: "%", hint: "Quanto do eleitorado do seu estado conhece seu nome." },
              ...(me.state.story?.health != null ? [{ label: "Saúde", value: me.state.story.health, hint: "Pesa na energia e na longevidade." }] : []),
              ...(me.state.scandal > 0 ? [{ label: "Escândalo", value: me.state.scandal, bad: true, hint: "Desgaste por denúncias e polêmicas." }] : []),
            ],
          }}
        />
        <main className="gmain" id="conteudo" tabIndex={-1}>
          <HashScroll />
          {children}
        </main>
      </div>
    </Toaster>
  );
}
