export const dynamic = "force-dynamic";

/** Versão publicada agora: a tela compara com a dela para recarregar depois de um deploy. */
export function GET() {
  // a mesma identidade que foi gravada na tela durante o build (next.config: NEXT_PUBLIC_BUILD)
  return Response.json({ v: process.env.NEXT_PUBLIC_BUILD ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
