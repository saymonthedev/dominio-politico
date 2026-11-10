import { ACHIEVEMENTS } from "@dp/engine";
import { GameHeader } from "@/components/game/Page";
import { Phone, type PhonePost } from "@/components/game/Phone";
import { avatarOf } from "@/lib/avatar";
import { getSession, playerState, requireMe } from "@/lib/game";
import { modeOfWorld } from "@/lib/sim";

export const metadata = { title: "Celular" };

export default async function Page({ params, searchParams }: { params: Promise<{ ano: string }>; searchParams: Promise<{ c?: string; app?: string }> }) {
  const year = Number((await params).ano);
  const { c, app } = await searchParams;
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, postsQ, newsQ] = await Promise.all([
    playerState(year),
    sb.from("news_articles").select("id, tick, game_date, headline, person_ids").eq("world_id", me.worldId).eq("outlet", "Rede social").order("tick", { ascending: false }).limit(40),
    sb.from("news_articles").select("id, game_date, outlet, headline").eq("world_id", me.worldId).neq("outlet", "Rede social").order("tick", { ascending: false }).order("importance", { ascending: false }).limit(15),
  ]);
  const face = (id: string) => avatarOf(state, state.t.persons.get(id));
  const players = [...state.t.persons.values()]
    .filter((p) => p.kind === "PLAYER" && p.status === "ACTIVE" && p.id !== me.person.id)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((p) => ({ id: p.id, name: p.name, avatar: face(p.id), party: p.party_id ? state.t.parties.get(p.party_id)?.acronym ?? null : null }));
  const posts: PhonePost[] = ((postsQ.data ?? []) as Array<{ id: string; game_date: string; headline: string; person_ids: string[] }>).map((n) => {
    const author = state.t.persons.get(n.person_ids[0]);
    return { id: n.id, date: n.game_date, text: n.headline, author: author?.name ?? "Jogador", authorId: author?.id ?? "", avatar: author ? face(author.id) : null, mine: author?.id === me.person.id };
  });
  const earned = ACHIEVEMENTS.filter((a) => me.state.achievements?.[a.id]).map((a) => ({ id: a.id, title: a.title, text: a.text, icon: a.icon, date: me.state.achievements[a.id] }));
  const party = me.party ? { id: me.party.id, acronym: me.party.acronym, color: me.party.color } : null;
  const postedToday = me.state.story?.flags.ultimo_post === state.world.game_date;

  return (
    <>
      <GameHeader kicker="Você" icon="phone" title="Celular" lede="Mensagens com os outros jogadores, a sua rede social, as manchetes do dia e a galeria da sua carreira." />
      <Phone
        year={year}
        world={me.worldId}
        shared={modeOfWorld(me.worldId) === "SHARED"}
        me={{ id: me.person.id, name: me.person.name, avatar: face(me.person.id) }}
        date={state.world.game_date}
        party={party}
        players={players}
        posts={posts}
        postedToday={postedToday}
        news={(newsQ.data ?? []) as Array<{ id: string; game_date: string; outlet: string; headline: string }>}
        gallery={earned}
        initialChannel={typeof c === "string" ? c : null}
        initialApp={typeof app === "string" ? app : null}
      />
    </>
  );
}
