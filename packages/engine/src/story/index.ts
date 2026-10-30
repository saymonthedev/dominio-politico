/**
 * Acontecimentos da carreira: eventos com contexto, escolhas e consequências,
 * o dia a dia do personagem, a campanha interativa e o fim da jornada.
 */
export type { CareerEnd, ChoiceTone, ScheduledStory, StoryChoice, StoryDelta, StoryEvent, StoryKind, StoryLogEntry, StoryState, StoryTag, StoryWho } from "./types";
export type { ChoiceDef, EventDef, Rendered } from "./def";
export { STORY_DEFS, birthdayOf } from "./catalog";
export { StoryCtx, liveCandidacy, type CampaignPhase } from "./context";
export { dailyStory, isPresent, pendingFor, resolveStory, storyCtx, type StoryOutcome } from "./director";
export { annualMortality, careerSummary, endCareer, type CareerSummary } from "./life";
export { emptyStory, pendingBlocking, scheduleStory, storyOf } from "./state";
export { nextSaturday, weekdayName, WEEKDAYS } from "./time";
export { routineLine, stepDays, type DayDigest, type DayEvent, type StepResult } from "./step";
export {
  afterPolls,
  explainShift,
  mainRival,
  PERSONA_LABEL,
  projectList,
  raceUf,
  rivalsDaily,
  SEGMENT_LABEL,
  segLabel,
  segmentStandings,
  strongSegments,
  weakSegments,
  type ListProjection,
  type RivalView,
  type SegmentStanding,
} from "./campaign";
