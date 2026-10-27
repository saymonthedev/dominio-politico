import { currentUser } from "@/lib/supabase/server";
import { Icon } from "./Icon";
import { Footer, PublicHeader } from "./SiteChrome";

export interface Section {
  id: string;
  title: string;
  icon?: string;
  body: React.ReactNode;
}

/** Modelo das páginas institucionais: faixa de abertura, índice lateral e seções em cartões. */
export async function ContentPage({ title, kicker, lede, sections, children, heroExtra }: { title: string; kicker?: string; lede?: string; sections?: Section[]; children?: React.ReactNode; heroExtra?: React.ReactNode }) {
  const { user } = await currentUser();
  return (
    <>
      <PublicHeader loggedIn={!!user} />
      <section className="page-hero">
        <div className="container">
          {kicker && <div className="kicker">{kicker}</div>}
          <h1>{title}</h1>
          {lede && <p className="lede">{lede}</p>}
          {heroExtra}
        </div>
      </section>
      <main className="container page-body">
        {sections ? (
          <div className="doc">
            <nav className="toc" aria-label="Nesta página">
              <div className="label">Nesta página</div>
              {sections.map((s, i) => (
                <a key={s.id} href={`#${s.id}`}>
                  <span className="mono">{String(i + 1).padStart(2, "0")}</span> {s.title}
                </a>
              ))}
            </nav>
            <div className="doc-sections">
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} className="doc-section">
                  <div className="doc-num">
                    <Icon name={s.icon ?? "file"} size={22} />
                    <span className="mono">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <div>
                    <h2>{s.title}</h2>
                    {s.body}
                  </div>
                </section>
              ))}
              {children}
            </div>
          </div>
        ) : (
          children
        )}
      </main>
      <Footer />
    </>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warn" | "real"; title: string; children: React.ReactNode }) {
  return (
    <div className={`callout ${tone}`}>
      <b>{title}</b>
      <div>{children}</div>
    </div>
  );
}
