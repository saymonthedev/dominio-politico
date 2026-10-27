export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dominio-politico.vercel.app";

/** Segredo do motor: só existe no servidor. */
export function simSecret(): string {
  const s = process.env.SIM_SECRET;
  if (!s) throw new Error("SIM_SECRET não configurado");
  return s;
}
