import { paywallOn } from "@/lib/payments";
import { RELEASE, RELEASE_BEFORE_PAYWALL } from "@/lib/release";
import { Announcements } from "./Announcements";

/** Novidades da versão (escolha de mundo e telas do jogo). As da assinatura só com ela ligada. */
export function Announce() {
  return <Announcements release={paywallOn() ? RELEASE : RELEASE_BEFORE_PAYWALL} />;
}
