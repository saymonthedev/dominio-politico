import type { PersonRow, WorldState } from "@dp/engine";
import { defaultAvatar, isAvatarCode } from "./avatar-code";

/** Avatar de um jogador (o escolhido ou o sorteado pelo id); políticos do jogo usam foto ou iniciais. */
export function avatarOf(state: WorldState | null | undefined, p: Pick<PersonRow, "id" | "kind"> | null | undefined): string | null {
  if (!p || p.kind !== "PLAYER") return null;
  const chosen = state?.t.person_states.get(p.id)?.story?.avatar;
  return isAvatarCode(chosen) ? chosen : defaultAvatar(p.id);
}
