import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { data: chars } = await sb.rpc("my_characters");
  const out: Record<string, unknown> = { conta: { id: auth.user.id, email: auth.user.email, criada_em: auth.user.created_at }, personagens: [] };
  for (const c of (chars ?? []) as Array<{ world_id: string; person_id: string }>) {
    const [p, s, n, f, r] = await Promise.all([
      sb.from("persons").select("*").eq("world_id", c.world_id).eq("id", c.person_id).maybeSingle(),
      sb.from("person_states").select("*").eq("world_id", c.world_id).eq("id", c.person_id).maybeSingle(),
      sb.from("notifications").select("*").eq("world_id", c.world_id),
      sb.from("finance_transactions").select("*").eq("world_id", c.world_id).eq("person_id", c.person_id),
      sb.from("affiliation_requests").select("*").eq("world_id", c.world_id).eq("person_id", c.person_id),
    ]);
    (out.personagens as unknown[]).push({ mundo: c.world_id, personagem: p.data, estado: s.data, notificacoes: n.data, financas: f.data, filiacoes: r.data });
  }
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="dominio-politico-meus-dados.json"' },
  });
}
