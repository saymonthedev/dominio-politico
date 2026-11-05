import { DONATIONS } from "@/lib/donations";
import { PIX, pixCode, pixQrSvg } from "@/lib/pix";
import { RELEASE } from "@/lib/release";
import { Announcements } from "./Announcements";
import type { PixInfo } from "./Support";

/** Pix pronto para a tela (chave, nome, copia e cola e QR Code), montado no servidor. */
export async function pixInfo(): Promise<PixInfo> {
  return { key: PIX.key, name: PIX.name, code: pixCode(), qr: await pixQrSvg() };
}

/** Novidades da versão e lembrete de apoio (escolha de mundo e telas do jogo). */
export async function Announce() {
  return <Announcements pix={DONATIONS ? await pixInfo() : null} release={RELEASE} />;
}
