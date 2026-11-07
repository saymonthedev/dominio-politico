/**
 * Falha passageira ao renovar o login: outra requisição renovando o mesmo login ao mesmo tempo
 * (409), limite de pedidos (429), servidor de login fora do ar ou lento (5xx, rede). O login do
 * jogador continua valendo: não é motivo para apagar os cookies nem mandar para a tela de entrar.
 */
export function transientAuthError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { name, status, code } = e as { name?: unknown; status?: unknown; code?: unknown };
  if (name === "AuthRetryableFetchError") return true;
  return code === "conflict" || status === 409 || status === 429 || (typeof status === "number" && status >= 500);
}

export const pause = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
