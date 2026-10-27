import { brazilUfPaths } from "@/lib/geo-paths";
import { Icon } from "./Icon";

const PERKS = [
  { icon: "flag", title: "Brasil real como ponto de partida", text: "Eleitos, partidos e economia do dia seguinte a um 2º turno presidencial." },
  { icon: "clock", title: "Um mundo que não pausa", text: "O país segue andando; você volta e encontra as consequências." },
  { icon: "shield", title: "Seus dados mínimos", text: "Só e-mail e senha. Sem CPF, título de eleitor ou endereço." },
];

/** Moldura das telas de acesso: painel de marca à esquerda, formulário à direita. */
export function AuthShell({ title, sub, aside, children, footer }: { title: string; sub: React.ReactNode; aside: { title: React.ReactNode; text: string }; children: React.ReactNode; footer?: React.ReactNode }) {
  const paths = brazilUfPaths(420, 440);
  return (
    <div className="auth">
      <aside className="auth__aside">
        <svg className="auth__mapdeco" viewBox="0 0 420 440" aria-hidden="true">
          {paths.map((p) => (
            <path key={p.uf} d={p.d} fill="#d4a53c" stroke="#0b1f3a" strokeWidth="1" />
          ))}
        </svg>
        <h2>{aside.title}</h2>
        <p>{aside.text}</p>
        <div className="auth__perks">
          {PERKS.map((p) => (
            <div key={p.title} className="auth__perk">
              <span className="ico">
                <Icon name={p.icon} size={19} />
              </span>
              <div>
                <b>{p.title}</b>
                <span>{p.text}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>
      <main className="auth__main">
        <div className="auth__card">
          <h1>{title}</h1>
          <p className="sub">{sub}</p>
          {children}
          {footer && <div className="auth__switch">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
