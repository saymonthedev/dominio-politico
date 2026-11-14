import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getSession } from "@/lib/game";
import { PHOTO_PATH, readPhoto } from "@/lib/suggestions";

export const dynamic = "force-dynamic";

/** Foto de uma sugestão: só para quem mandou e para o admin. */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("p") ?? "";
  if (!PHOTO_PATH.test(path)) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  const { user } = await getSession();
  if (!user) return NextResponse.json({ error: "entre na sua conta" }, { status: 401 });
  if (!isAdmin(user.id) && !path.startsWith(`sugestoes/${user.id}/`)) return NextResponse.json({ error: "sem acesso" }, { status: 403 });
  const photo = await readPhoto(path);
  if (!photo) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  return new Response(photo.stream, {
    headers: { "Content-Type": photo.type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
