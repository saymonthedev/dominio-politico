import { genderOf, geoName, officeTitle, personWord, stageTitle, type PersonRow, type WorldState } from "@dp/engine";
import { inviteUrl, signCard, type ShareCard } from "./referral";

/** O que o botão de compartilhar precisa: o link do convite (com o cartão), o texto e as imagens. */
export interface SharePack {
  link: string;
  text: string;
  /** imagem em pé (story) e deitada (prévia do link) */
  story: string;
  feed: string;
}

export function sharePack(code: string, card: ShareCard, text: string): SharePack {
  const token = signCard(code, card);
  return {
    link: inviteUrl(code, token),
    text,
    story: `/convite/${code}/cartao?f=story&c=${token}`,
    feed: `/convite/${code}/cartao?f=feed&c=${token}`,
  };
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Cartão da carreira do jogador: o cargo (ou a eleição ganha, antes da posse, ou a etapa da carreira),
 * o lugar, o partido e as conquistas. Só dados do personagem fictício do jogador.
 */
export function careerShare(state: WorldState, p: PersonRow, year: number): { card: ShareCard; text: string } {
  const g = genderOf(p);
  const where = (geo: string) => (geo === "BR" ? "do Brasil" : `em ${geoName(geo, state)}`);
  const future = [...state.t.mandates.values()].find((m) => m.person_id === p.id && m.status === "FUTURO");
  let kicker = "Minha carreira";
  let title: string;
  let text: string;
  if (p.office_code) {
    title = `${officeTitle(p.office_code, g)} ${where(p.office_geo ?? p.uf)}`;
    text = `Sou ${lower(title)} no Domínio Político, o jogo de carreira política brasileira. Vem jogar também:`;
  } else if (future) {
    kicker = personWord("Eleito(a)!", g);
    title = `${officeTitle(future.office_code, g)} ${where(future.geo)}`;
    text = `Ganhei a eleição: ${lower(title)} no Domínio Político, o jogo de carreira política brasileira. Vem jogar também:`;
  } else {
    title = `${stageTitle(p.stage, g)} ${where(p.municipality || p.uf)}`;
    text = "Estou construindo minha carreira política no Domínio Político, do bairro ao Planalto. Vem jogar também:";
  }
  const party = p.party_id ? state.t.parties.get(p.party_id)?.acronym : null;
  const wins = Object.keys(state.t.person_states.get(p.id)?.achievements ?? {}).length;
  const lede = [party ?? "sem partido", `Brasil pós-${year}`, wins ? `${wins} ${wins === 1 ? "conquista" : "conquistas"}` : null].filter(Boolean).join(" · ");
  return { card: { k: kicker, n: p.name, t: title, l: lede, y: year }, text };
}

/** Convite simples (Minha conta): sem personagem em destaque. */
export function inviteShare(name: string): { card: ShareCard; text: string } {
  return {
    card: { k: "Convite", n: name, t: "te convida para o Domínio Político", l: "Crie seu político, dispute eleições e chegue ao Planalto num Brasil real", y: 0 },
    text: "Tô jogando o Domínio Político, um jogo de carreira política brasileira: você começa como cidadão e tenta chegar ao Planalto. Entra pelo meu convite:",
  };
}
