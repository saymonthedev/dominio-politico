import type { EventDef } from "../def";
import { BACKSTAGE_EVENTS } from "./bastidores";
import { BASE_EVENTS } from "./base";
import { CAMPAIGN_EVENTS } from "./campanha";
import { DAILY_EVENTS } from "./cotidiano";
import { MANDATE_EVENTS } from "./mandato";
import { PARTY_EVENTS } from "./partido";
import { LIFE_EVENTS } from "./vida";

/** Todos os acontecimentos da carreira, por id. */
export const STORY_DEFS: Record<string, EventDef> = Object.fromEntries(
  [...BASE_EVENTS, ...PARTY_EVENTS, ...CAMPAIGN_EVENTS, ...MANDATE_EVENTS, ...BACKSTAGE_EVENTS, ...LIFE_EVENTS, ...DAILY_EVENTS].map((d) => [d.id, d]),
);

export { birthdayOf } from "./vida";
