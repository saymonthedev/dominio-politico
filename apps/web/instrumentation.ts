import type { Instrumentation } from "next";

/** Erros de páginas, ações e rotas vão para o painel /admin (só no servidor Node). */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logError } = await import("./lib/sim");
  const digest = error && typeof error === "object" && "digest" in error ? String((error as { digest: unknown }).digest) : null;
  await logError(context.routeType, request.path, error, digest);
};
