import { cardImage } from "@/lib/og";
import { isInviteCode, readCard } from "@/lib/referral";

/** Imagem do cartão de convite: ?f=story (em pé) ou ?f=feed (deitada), com o cartão assinado em ?c=. */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (!isInviteCode(codigo)) return new Response("Convite inválido.", { status: 404 });
  const url = new URL(request.url);
  const card = readCard(codigo, url.searchParams.get("c"));
  const code = codigo.toUpperCase();
  return cardImage(
    card
      ? { kicker: card.k, name: card.n, title: card.t, lede: card.l, link: `dominio-politico.com.br/convite/${code}` }
      : { kicker: "Convite", name: "Domínio Político", title: "O jogo de carreira política brasileira", lede: "Do bairro ao Planalto, num Brasil real", link: `dominio-politico.com.br/convite/${code}` },
    url.searchParams.get("f") === "story",
  );
}
