import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { deleteMyData } from "@/app/jogo/actions";
import { Footer, PublicHeader } from "@/components/SiteChrome";
import { getSession, myCharacters } from "@/lib/game";

export const metadata: Metadata = { title: "Minha conta" };

export default async function Page() {
  const { user } = await getSession();
  if (!user) redirect("/entrar?next=/conta");
  const chars = await myCharacters();
  return (
    <>
      <PublicHeader loggedIn />
      <main className="container narrow">
        <h1>Minha conta</h1>
        <div className="card">
          <dl className="kv">
            <dt>E-mail</dt><dd>{user.email}</dd>
            <dt>Personagens</dt><dd>{chars.length}</dd>
          </dl>
        </div>
        <div className="card mt">
          <h2>Seus dados (LGPD)</h2>
          <p className="muted">Baixe uma cópia em JSON com sua conta, personagens, notificações e histórico.</p>
          <a className="btn ghost" href="/api/meus-dados">Exportar meus dados</a>
        </div>
        <div className="card mt" style={{ borderColor: "var(--urgente)" }}>
          <h2>Excluir meus dados</h2>
          <p className="muted">Seus personagens saem do mundo de forma neutra, notificações e notícias privadas são apagadas e o vínculo com a conta é removido.</p>
          <form action={deleteMyData}>
            <button className="btn danger">Excluir meus dados e sair</button>
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}
