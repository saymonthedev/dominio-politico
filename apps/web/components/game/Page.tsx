/** Blocos visuais comuns às páginas do jogo. */
import { Icon } from "../Icon";

export function GameHeader({ kicker, title, lede, icon, children }: { kicker?: string; title: React.ReactNode; lede?: React.ReactNode; icon?: string; children?: React.ReactNode }) {
  return (
    <header className="ghead">
      <div className="ghead__text">
        {kicker && (
          <div className="ghead__kicker">
            {icon && <Icon name={icon} size={15} />} {kicker}
          </div>
        )}
        <h1>{title}</h1>
        {lede && <p>{lede}</p>}
      </div>
      {children && <div className="ghead__actions">{children}</div>}
    </header>
  );
}

export function Panel({
  title,
  icon,
  href,
  hrefLabel = "Ver tudo",
  tone,
  children,
  className,
  aside,
}: {
  title?: React.ReactNode;
  icon?: string;
  href?: string;
  hrefLabel?: string;
  tone?: "dark" | "alert" | "gold";
  children: React.ReactNode;
  className?: string;
  aside?: React.ReactNode;
}) {
  return (
    <section className={["gpanel", tone && `gpanel--${tone}`, className].filter(Boolean).join(" ")}>
      {(title || href || aside) && (
        <div className="gpanel__head">
          {title && (
            <h2>
              {icon && <Icon name={icon} size={17} />}
              {title}
            </h2>
          )}
          {aside}
          {href && (
            <a href={href} className="gpanel__link">
              {hrefLabel} <Icon name="arrow" size={14} />
            </a>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, tone, icon }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; tone?: "up" | "down" | "warn"; icon?: string }) {
  return (
    <div className={`kpi${tone ? ` kpi--${tone}` : ""}`}>
      <span className="kpi__label">
        {icon && <Icon name={icon} size={14} />} {label}
      </span>
      <b className="kpi__value">{value}</b>
      {hint && <span className="kpi__hint">{hint}</span>}
    </div>
  );
}

export function MeterRow({ label, value, max = 100, tone, hint, goal, unit }: { label: string; value: number; max?: number; tone?: "ok" | "bad" | "sim" | "gold"; hint?: string; goal?: number; unit?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="mrow">
      <div className="mrow__top">
        <span>{label}</span>
        <b className="mono">
          {Math.round(value)}
          {unit}
          {goal ? <small> / {goal}</small> : null}
        </b>
      </div>
      <div className={`mrow__bar${tone ? ` mrow__bar--${tone}` : ""}`}>
        <span style={{ width: `${pct}%` }} />
        {goal ? <i style={{ left: `${Math.min(100, (goal / max) * 100)}%` }} /> : null}
      </div>
      {hint && <small className="mrow__hint">{hint}</small>}
    </div>
  );
}

export function Empty({ icon = "inbox", title, children }: { icon?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="gempty">
      <span className="gempty__icon">
        <Icon name={icon} size={22} />
      </span>
      <b>{title}</b>
      {children && <div className="gempty__text">{children}</div>}
    </div>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "bad" | "warn" | "sim" | "gold"; children: React.ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}
