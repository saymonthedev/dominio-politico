import type { EventDef } from "../def";
import { BACKSTAGE_EVENTS } from "./bastidores";
import { BASE_EVENTS } from "./base";
import { CAMPAIGN_EVENTS } from "./campanha";
import { DAILY_EVENTS } from "./cotidiano";
import { CHOICE_EVENTS } from "./escolhas";
import { MANDATE_EVENTS } from "./mandato";
import { PARTY_EVENTS } from "./partido";
import { HOME_EVENTS } from "./casa";
import { COMMAND_EVENTS } from "./comando";
import { GABINETE_EVENTS } from "./gabinete";
import { MORE_EVENTS } from "./mais";
import { LIFE_EVENTS } from "./vida";
import { LIFE2_EVENTS } from "./vida2";

/** Todos os acontecimentos da carreira, por id. */
export const STORY_DEFS: Record<string, EventDef> = Object.fromEntries(
  [
    ...BASE_EVENTS,
    ...PARTY_EVENTS,
    ...CAMPAIGN_EVENTS,
    ...MANDATE_EVENTS,
    ...BACKSTAGE_EVENTS,
    ...LIFE_EVENTS,
    ...DAILY_EVENTS,
    ...CHOICE_EVENTS,
    ...GABINETE_EVENTS,
    ...LIFE2_EVENTS,
    ...HOME_EVENTS,
    ...COMMAND_EVENTS,
    ...MORE_EVENTS,
  ].map((d) => [d.id, d]),
);

/** Catálogos desta rodada: nenhum id pode repetir um que já existe (o último sobrescreveria o outro). */
export const NEW_CATALOGS: EventDef[][] = [GABINETE_EVENTS, LIFE2_EVENTS, HOME_EVENTS, COMMAND_EVENTS, MORE_EVENTS];
export const OLD_CATALOG_IDS: string[] = [BASE_EVENTS, PARTY_EVENTS, CAMPAIGN_EVENTS, MANDATE_EVENTS, BACKSTAGE_EVENTS, LIFE_EVENTS, DAILY_EVENTS, CHOICE_EVENTS].flat().map((d) => d.id);

export { birthdayOf } from "./vida";
