import type { PersonRow, PersonStateRow, WorldState } from "@dp/engine";
import { STAGE_LABEL } from "@/components/ui";

/** Atributo da barra lateral (com meta, se houver, e a explicação do que é). */
export interface VitalAttr {
  label: string;
  value: number;
  goal?: number;
  bad?: boolean;
  hint?: string;
  suffix?: string;
}

/** Os números do personagem que a barra lateral e a faixa do celular mostram. */
export interface LiveVitals {
  stage: string;
  energy: number;
  money: number;
  reputation: number;
  /** aprovação popular (só com mandato) */
  approval: number | null;
  fatigue: number;
  attrs: VitalAttr[];
}

/**
 * Monta os números da barra lateral. É a mesma conta na página (a cada carregamento) e
 * nas respostas do relógio e das decisões: assim a barra muda na hora em que você escolhe,
 * sem esperar o fim do período que mandou passar.
 */
export function sideVitals(person: PersonRow, st: PersonStateRow, hasParty: boolean): LiveVitals {
  const story = st.story;
  const approval = person.office_code && story?.approval != null ? Math.round(story.approval) : null;
  const fatigue = Math.round(story?.fatigue ?? 25);
  const attrs: VitalAttr[] = [
    // quem tem mandato vê primeiro o que o povo acha dele
    ...(approval != null
      ? [{ label: "Aprovação popular", value: approval, suffix: "%", hint: "O que o povo acha do seu mandato. Sobe com entregas (leis, obras, emendas) e cai com escândalos e votos contra a base. Pesa muito na reeleição." }]
      : []),
    { label: "Cansaço", value: fatigue, bad: true, hint: "Sobe com trabalho, política e campanha; cai com descanso (academia, futebol, família, folga). Muito cansaço devolve menos energia e desgasta a saúde." },
    { label: "Ativismo", value: Math.min(100, st.activism), goal: person.stage === "CIDADAO" ? 20 : undefined, hint: "Engajamento em causas e na comunidade. Com 20, você vira ativista." },
    ...(hasParty ? [{ label: "Prestígio no partido", value: st.party_standing, goal: person.stage === "FILIADO" ? 45 : undefined, hint: "Peso dentro do partido: conta na convenção e nas indicações." }] : []),
    { label: "Capital político", value: st.political_capital, hint: "Favores, contatos e influência acumulados." },
    { label: "Preparo para debates", value: st.debate_prep, hint: "Treino de oratória e debate." },
    { label: "Alcance no estado", value: Math.round((st.reach?.[person.uf] ?? 0) * 100), suffix: "%", hint: "Quanto do eleitorado do seu estado conhece seu nome." },
    ...(story?.health != null ? [{ label: "Saúde", value: story.health, hint: "Pesa na energia e na longevidade." }] : []),
    ...(st.scandal > 0 ? [{ label: "Escândalo", value: st.scandal, bad: true, hint: "Desgaste por denúncias e polêmicas." }] : []),
  ];
  return {
    stage: STAGE_LABEL[person.stage] ?? person.stage,
    energy: Math.round(st.energy),
    money: Math.round(st.money),
    reputation: Math.round(person.reputation),
    approval,
    fatigue,
    attrs,
  };
}

/** Os mesmos números a partir do mundo em memória (depois de um passo do relógio ou de uma decisão). */
export function liveVitals(state: WorldState, personId: string | null | undefined): LiveVitals | undefined {
  if (!personId) return undefined;
  const p = state.t.persons.get(personId);
  const st = state.t.person_states.get(personId);
  if (!p || !st) return undefined;
  return sideVitals(p, st, !!p.party_id);
}
