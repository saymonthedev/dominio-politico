export const dynamic = "force-dynamic";

/** Versão publicada agora: a tela compara com a dela para recarregar depois de um deploy. */
export function GET() {
  return Response.json({ v: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
