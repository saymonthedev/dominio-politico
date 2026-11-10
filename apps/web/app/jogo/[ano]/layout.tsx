import { after } from "next/server";
import { sideVitals } from "@/lib/vitals";
import { canonicalGeo, clockTarget, geoName, type NotificationRow } from "@dp/engine";
import { Announce } from "@/components/Announce";
import { GameSidebar } from "@/components/game/GameSidebar";
import { HashScroll } from "@/components/game/HashScroll";
import { KeyboardMode } from "@/components/game/KeyboardMode";
import { MobileStatus } from "@/components/game/MobileStatus";
import { NotificationBell } from "@/components/game/NotificationBell";
import { StoryBell } from "@/components/game/StoryCenter";
import { Toaster } from "@/components/game/Toaster";
import { SharedWorldProvider } from "@/components/game/world-mode";
import { UserMenu } from "@/components/game/UserMenu";
import { LogoMark } from "@/components/Logo";
import { SupportTopButton } from "@/components/Support";
import { DONATIONS } from "@/lib/donations";
import { STAGE_LABEL } from "@/components/ui";
import { initials } from "@/lib/format";
import { defaultAvatar, isAvatarCode } from "@/lib/avatar-code";
import { getSession, getWorld, requireMe } from "@/lib/game";
import { asPlayer, backgroundAdvance, citiesFor, ensureWorld, modeOfWorld } from "@/lib/sim";

export const dynamic = "force-dynamic";
/** avançar 30 dias pode levar alguns segundos */
export const maxDuration = 60;

const WEEKDAY = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MONTH = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default async function GameLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const world = await getWorld(year);
  const { sb, user } = await getSession();
  const token = (await sb.auth.getSession()).data.session?.access_token;
  // mundo que não existe ou ficou pela metade (criação interrompida): monta ou completa agora
  if (!world || world.stats?.building) await asPlayer(token, () => ensureWorld(year, me.worldId));
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

  // O mundo segue andando: o relógio passou do dia do mundo, avança em segundo plano (com trava: uma tentativa
  // por mundo a cada 90 s nesta instância, sem fila de servidores esperando o mesmo lease)
  if (world && clockTarget(world, Date.now()) > world.tick) after(() => asPlayer(token, () => backgroundAdvance(year)));
  const shared = modeOfWorld(me.worldId) === "SHARED";
  const d = world ? new Date(`${world.game_date}T12:00:00Z`) : null;
  const city = canonicalGeo(me.person.municipality);
  const place = /^\d{7}$/.test(city) ? geoName(city, { cities }) : me.person.uf;

  // os mesmos números que o relógio e as decisões devolvem (a barra muda na hora da escolha)
  const vitals = sideVitals(me.person, me.state, !!me.party);
  const chosen = me.state.story?.avatar;
  const avatar = isAvatarCode(chosen) ? chosen : defaultAvatar(me.person.id);

  return (
    <SharedWorldProvider shared={shared}>
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
          <a className="gtop__date" href={`/jogo/${year}#tempo`} title={shared ? "O tempo anda sozinho: veja o ritmo no Painel" : "Passar o tempo no Painel"}>
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
          {DONATIONS && <SupportTopButton />}
          <StoryBell year={year} events={storyPending} today={world?.game_date ?? storyPending[0]?.on ?? ""} />
          <NotificationBell
            year={year}
            unread={unread}
            openInvites={invites}
            items={((recentQ.data ?? []) as NotificationRow[]).map((n) => ({ id: n.id, title: n.title, body: n.body, date: n.game_date, link: n.link, unread: !n.read_at }))}
          />
          <UserMenu initials={initials(me.person.name)} avatar={avatar} />
        </div>
        <MobileStatus year={year} energy={vitals.energy} money={vitals.money} reputation={vitals.reputation} stage={vitals.stage} approval={vitals.approval} fatigue={vitals.fatigue} />
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
            avatar,
            initials: initials(me.person.name),
            energy: vitals.energy,
            money: vitals.money,
            reputation: vitals.reputation,
            attrs: vitals.attrs,
          }}
        />
        <main className="gmain" id="conteudo" tabIndex={-1}>
          <HashScroll />
          <KeyboardMode />
          <Announce />
          {children}
        </main>
      </div>
    </Toaster>
    </SharedWorldProvider>
  );
}
