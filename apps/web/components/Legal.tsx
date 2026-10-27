import { Icon } from "./Icon";

/** Blocos visuais das páginas legais (privacidade e termos). */

export function UpdatedAt({ date, version }: { date: string; version: string }) {
  return (
    <div className="legal-meta">
      <span><Icon name="calendar" size={15} /> Atualizado em {date}</span>
      <span><Icon name="file" size={15} /> Versão {version}</span>
    </div>
  );
}

export function SummaryTiles({ items }: { items: Array<{ icon: string; title: string; text: string }> }) {
  return (
    <div className="summary-tiles">
      {items.map((i) => (
        <div key={i.title} className="summary-tile">
          <span className="ico"><Icon name={i.icon} size={20} /></span>
          <b>{i.title}</b>
          <span>{i.text}</span>
        </div>
      ))}
    </div>
  );
}

export interface DataItem {
  icon: string;
  what: string;
  examples: string;
  why: string;
  basis: string;
  keep: string;
}

export function DataInventory({ items }: { items: DataItem[] }) {
  return (
    <div className="data-inv">
      {items.map((d) => (
        <article key={d.what} className="data-card">
          <header>
            <span className="ico"><Icon name={d.icon} size={18} /></span>
            <div>
              <b>{d.what}</b>
              <small>{d.examples}</small>
            </div>
          </header>
          <dl>
            <div><dt>Para quê</dt><dd>{d.why}</dd></div>
            <div><dt>Base legal</dt><dd>{d.basis}</dd></div>
            <div><dt>Por quanto tempo</dt><dd>{d.keep}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}

export function NeverList({ items }: { items: string[] }) {
  return (
    <ul className="never-list">
      {items.map((i) => (
        <li key={i}><span className="x"><Icon name="x" size={14} /></span>{i}</li>
      ))}
    </ul>
  );
}

export function RightsGrid({ items }: { items: Array<{ icon: string; title: string; text: string; href?: string; cta?: string }> }) {
  return (
    <div className="rights">
      {items.map((r) => (
        <div key={r.title} className="right-card">
          <span className="ico"><Icon name={r.icon} size={18} /></span>
          <b>{r.title}</b>
          <p>{r.text}</p>
          {r.href && (
            <a href={r.href} className="right-link">
              {r.cta} <Icon name="arrow" size={15} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export function ProviderList({ items }: { items: Array<{ name: string; role: string; detail: string }> }) {
  return (
    <div className="providers">
      {items.map((p) => (
        <div key={p.name} className="provider">
          <span className="mark">{p.name.slice(0, 1)}</span>
          <div>
            <b>{p.name}</b> <span className="badge plain">{p.role}</span>
            <p>{p.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DoDont({ dos, donts }: { dos: string[]; donts: string[] }) {
  return (
    <div className="dodont">
      <div className="dodont__col do">
        <div className="dodont__head"><Icon name="check" size={16} /> Pode</div>
        <ul>{dos.map((d) => <li key={d}>{d}</li>)}</ul>
      </div>
      <div className="dodont__col dont">
        <div className="dodont__head"><Icon name="x" size={16} /> Não pode</div>
        <ul>{donts.map((d) => <li key={d}>{d}</li>)}</ul>
      </div>
    </div>
  );
}

export function Steps({ items }: { items: Array<{ title: string; text: string }> }) {
  return (
    <ol className="legal-steps">
      {items.map((s, i) => (
        <li key={s.title}>
          <span className="n">{i + 1}</span>
          <div><b>{s.title}</b><p>{s.text}</p></div>
        </li>
      ))}
    </ol>
  );
}
