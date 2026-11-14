"use server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin";
import { getSession } from "@/lib/game";
import { reportError } from "@/lib/report-error";
import { decideSuggestion, type SuggestionStatus } from "@/lib/suggestions";

const STATUSES: SuggestionStatus[] = ["NOVA", "CONCLUIDA", "REPROVADA"];

/** Concluir, reprovar ou voltar uma sugestão para nova (só o admin). */
export async function decide(id: string, status: SuggestionStatus, note: string): Promise<{ ok: boolean; message: string }> {
  const { user } = await getSession();
  if (!user || !isAdmin(user.id)) return { ok: false, message: "Sem acesso." };
  if (!STATUSES.includes(status) || !/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Pedido inválido." };
  const text = note.trim();
  if (text.length > 1000) return { ok: false, message: "A nota pode ter até 1.000 letras." };
  try {
    await decideSuggestion(id, status, text);
  } catch (e) {
    await reportError("admin", "decidir sugestao", e);
    return { ok: false, message: "Não deu para salvar agora. Tente de novo." };
  }
  revalidatePath("/admin");
  return {
    ok: true,
    message:
      status === "CONCLUIDA"
        ? "Concluída: o aviso de atualização vai para todos os jogadores, com o crédito."
        : status === "REPROVADA"
          ? "Reprovada: o aviso vai só para quem sugeriu."
          : "Voltou para nova.",
  };
}
