import { makeIdeology, type Ideology } from "./ideology";
import { moderateText } from "./news/moderation";
import { buildPerson } from "./npc";
import { origin, profession } from "./names";
import { municipalityId, UF_BY_CODE } from "./geo";
import type { Ctx } from "./state";
import type { PersonRow } from "./types";

/**
 * O jogador cria um PERSONAGEM, não um perfil político de si mesmo (LGPD:
 * a ideologia escolhida não é tratada como opinião do usuário).
 */
export interface CharacterInput {
  userId: string;
  name: string;
  uf: string;
  age: number;
  profession: string;
  origin: string;
  interests: string[];
  ideology: Partial<Ideology>;
}

export interface CharacterResult {
  ok: boolean;
  error?: string;
  person?: PersonRow;
}

export function createCharacter(ctx: Ctx, input: CharacterInput): CharacterResult {
  if ([...ctx.t.persons.values()].some((p) => p.user_id === input.userId && p.status === "ACTIVE")) {
    return { ok: false, error: "Você já tem um personagem neste mundo." };
  }
  const uf = UF_BY_CODE[input.uf];
  if (!uf) return { ok: false, error: "UF inválida." };
  const age = Math.floor(Number(input.age));
  if (!Number.isFinite(age) || age < ctx.s.ruleset.minCharacterAge || age > 80) return { ok: false, error: `Idade do personagem entre ${ctx.s.ruleset.minCharacterAge} e 80 anos.` };
  const realNames = [...ctx.t.persons.values()].filter((p) => p.kind === "REAL_ACTIVE_AT_SNAPSHOT" || p.kind === "REAL_HISTORICAL").map((p) => p.name);
  const mod = moderateText(input.name, { minLength: 3, maxLength: 40, extraRealNames: realNames.filter((n) => n.split(" ").length >= 2) });
  if (!mod.ok) return { ok: false, error: mod.reason };
  const prof = profession(input.profession);
  const orig = origin(input.origin);
  const rng = ctx.rng("character", input.userId);
  const { person, state } = buildPerson({
    id: ctx.id("per_p", input.userId),
    kind: "PLAYER",
    name: input.name.trim().replace(/\s+/g, " "),
    birthYear: Number(ctx.date.slice(0, 4)) - age,
    uf: uf.code,
    municipality: uf.capital,
    profession: prof.id,
    origin: orig.id,
    partyId: null,
    ideology: makeIdeology(input.ideology),
    stage: "CIDADAO",
    reputation: 20,
    visibility: 2,
    traits: {
      ambition: 0.8,
      loyalty: 0.6,
      riskTolerance: 0.5,
      competence: Math.min(0.9, 0.45 + prof.competence + rng.range(0, 0.05)),
      charisma: Math.min(0.9, 0.45 + prof.charisma + rng.range(0, 0.05)),
    },
    money: orig.savings,
    reach: { [uf.code]: orig.reach },
    tier: 3,
    userId: input.userId,
    domicileSince: ctx.date,
    createdTick: ctx.tick,
    worldId: ctx.world.id,
  });
  person.municipality = uf.capital;
  state.interests = input.interests.slice(0, 5);
  state.income_last_year = prof.income * 12;
  ctx.save("persons", person);
  ctx.save("person_states", state);
  ctx.emit("CHARACTER_CREATED", { actors: [person.id], geography: uf.code, payload: { municipality: municipalityId(uf.code) } });
  ctx.notify(
    person.id,
    "Bem-vindo(a) à vida pública",
    `Você começa como cidadão(ã) em ${uf.capital} (${uf.code}). Acompanhe o noticiário, participe da vida local, conheça os partidos e construa sua carreira.`,
    "/jogo",
  );
  return { ok: true, person };
}
