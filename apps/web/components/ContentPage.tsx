import { currentUser } from "@/lib/supabase/server";
import { Footer, PublicHeader } from "./SiteChrome";

export async function ContentPage({ title, kicker, children }: { title: string; kicker?: string; children: React.ReactNode }) {
  const { user } = await currentUser();
  return (
    <>
      <PublicHeader loggedIn={!!user} />
      <main className="container narrow">
        {kicker && <div className="label">{kicker}</div>}
        <h1>{title}</h1>
        <div className="stack">{children}</div>
      </main>
      <Footer />
    </>
  );
}
