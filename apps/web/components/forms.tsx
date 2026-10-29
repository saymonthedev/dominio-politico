"use client";
/**
 * Kit de formulário do Domínio Político. Nenhum controle usa a aparência
 * padrão do navegador: cada um tem desenho próprio. Os valores seguem para as
 * server actions por <input type="hidden"> (ou por um input real, visualmente
 * oculto, quando o leitor de tela precisa dele).
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "./Icon";

/**
 * Atributos que desligam preenchimento e sugestões do navegador e de
 * gerenciadores de senha (Google, 1Password, LastPass, Bitwarden).
 */
export const NO_FILL = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

/* ---------------------------------------------------------------- Botão */

type ButtonTone = "primary" | "gold" | "ghost" | "danger" | "on-dark";

export function Button({
  tone = "primary",
  size,
  loading,
  icon,
  full,
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: "sm" | "lg"; loading?: boolean; icon?: string; full?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={["ui-btn", `ui-btn--${tone}`, size && `ui-btn--${size}`, full && "ui-btn--full", className].filter(Boolean).join(" ")}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={18} /> : null}
      <span>{children}</span>
    </button>
  );
}

/** Botão de envio que mostra carregamento enquanto o formulário pai está pendente. */
export function SubmitButton({ children, pendingLabel, ...rest }: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...rest}>
      {pending ? pendingLabel ?? children : children}
    </Button>
  );
}

/* ---------------------------------------------------------------- Campo */

function FieldShell({ id, label, hint, error, optional, children }: { id: string; label: string; hint?: React.ReactNode; error?: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className={`ui-field${error ? " has-error" : ""}`}>
      <label className="ui-label" htmlFor={id}>
        {label}
        {optional && <span className="ui-optional">opcional</span>}
      </label>
      {children}
      {error ? (
        <div className="ui-hint ui-hint--error" id={`${id}-hint`}>{error}</div>
      ) : hint ? (
        <div className="ui-hint" id={`${id}-hint`}>{hint}</div>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  icon,
  optional,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: React.ReactNode; error?: string; icon?: string; optional?: boolean }) {
  const auto = useId();
  const id = input.id ?? auto;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <div className="ui-input">
        {icon && <Icon name={icon} size={18} className="ui-input__icon" />}
        <input {...input} {...NO_FILL} id={id} aria-describedby={hint || error ? `${id}-hint` : undefined} aria-invalid={!!error || undefined} />
      </div>
    </FieldShell>
  );
}

function strength(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
const STRENGTH = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];

export function PasswordField({ label, hint, showStrength, ...input }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; showStrength?: boolean }) {
  const auto = useId();
  const id = input.id ?? auto;
  const [show, setShow] = useState(false);
  const [value, setValue] = useState("");
  // Com máscara por CSS o campo não é reconhecido como senha e nenhum gerenciador
  // oferece preenchimento. Sem suporte, cai no type="password".
  const [cssMask, setCssMask] = useState(false);
  useEffect(() => setCssMask(typeof CSS !== "undefined" && CSS.supports("-webkit-text-security", "disc")), []);
  const s = strength(value);
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <div className="ui-input">
        <Icon name="lock" size={18} className="ui-input__icon" />
        <input
          {...input}
          {...NO_FILL}
          id={id}
          type={show || cssMask ? "text" : "password"}
          className={cssMask && !show ? "ui-masked" : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button type="button" className="ui-input__action" onClick={() => setShow((v) => !v)} aria-label={show ? "Ocultar senha" : "Mostrar senha"} aria-pressed={show}>
          <Icon name={show ? "eyeOff" : "eye"} size={18} />
        </button>
      </div>
      {showStrength && value && (
        <div className="ui-strength" data-level={s} aria-live="polite">
          <div className="ui-strength__bars">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={i < s ? "on" : ""} />
            ))}
          </div>
          <span>{STRENGTH[s]}</span>
        </div>
      )}
    </FieldShell>
  );
}

/* ---------------------------------------------------------------- Checkbox */

export function Checkbox({ name, children, defaultChecked, required, value = "on" }: { name: string; children: React.ReactNode; defaultChecked?: boolean; required?: boolean; value?: string }) {
  const id = useId();
  return (
    <label className="ui-check" htmlFor={id}>
      <input className="ui-sr" type="checkbox" id={id} name={name} value={value} defaultChecked={defaultChecked} required={required} />
      <span className="ui-check__box" aria-hidden="true">
        <Icon name="check" size={14} />
      </span>
      <span className="ui-check__text">{children}</span>
    </label>
  );
}

/* ---------------------------------------------------------------- Seletor */

/** Listas muito longas (ex.: 5.570 cidades) só desenham os primeiros resultados. */
const MAX_RENDERED = 200;

export interface Option {
  value: string;
  label: string;
  hint?: string;
  /** facetas para filtrar listas de pessoas: cargo, partido e UF */
  meta?: { o: string; p: string; u: string };
}

type Facet = "o" | "p" | "u";
const FACETS: Array<{ key: Facet; label: string; spoken: string }> = [
  { key: "o", label: "Cargo", spoken: "cargo" },
  { key: "p", label: "Partido", spoken: "partido" },
  { key: "u", label: "UF", spoken: "estado (UF)" },
];

/** Fileira de filtros (barra de ferramentas com uma parada de Tab; setas percorrem as opções). */
function FacetRow({ label, spoken, values, current, onPick }: { label: string; spoken: string; values: Array<[string, number]>; current: string | null; onPick: (v: string | null) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const all: Array<[string | null, number]> = [[null, 0], ...values];
  const selected = Math.max(0, all.findIndex(([v]) => v === current));
  const onKey = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const buttons = [...(row.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
    buttons[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  return (
    <div className="ui-facet" role="toolbar" aria-label={`Filtrar por ${spoken}`} ref={row} onKeyDown={onKey}>
      <span className="ui-facet__label" aria-hidden="true">
        {label}
      </span>
      <div className="ui-facet__chips">
        {all.map(([v, n], i) => (
          <button key={v ?? "__todos"} type="button" tabIndex={i === selected ? 0 : -1} aria-pressed={current === v} className={`ui-chip${current === v ? " is-on" : ""}`} onClick={() => onPick(current === v ? null : v)}>
            {v ?? "Todos"}
            {v !== null && <small>{n}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Lista suspensa própria (padrão combobox/listbox do WAI-ARIA), com busca
 * automática quando há muitas opções.
 */
export function Select({
  name,
  label,
  options,
  placeholder = "Escolha…",
  defaultValue = "",
  required,
  optional,
  hint,
  emptyText = "Nenhuma opção disponível",
  onChange,
}: {
  name: string;
  label: string;
  options: Option[];
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  optional?: boolean;
  hint?: React.ReactNode;
  emptyText?: string;
  onChange?: (value: string) => void;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [facet, setFacet] = useState<Record<Facet, string | null>>({ o: null, p: null, u: null });
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchable = options.length > 8;
  // listas de pessoas: filtros por cargo, partido e UF. Cada fileira conta só o que combina com os
  // outros filtros escolhidos, para nunca levar a uma lista vazia; a fileira some se não ajuda a filtrar.
  const facetRows = useMemo(() => {
    if (options.length < 12 || !options.some((o) => o.meta)) return null;
    const distinct = (k: Facet) => new Set(options.map((o) => o.meta?.[k]).filter(Boolean)).size;
    return { o: distinct("o") > 1, p: distinct("p") > 1, u: distinct("u") > 1 };
  }, [options]);
  const facets = useMemo(() => {
    if (!facetRows) return null;
    const count = (k: Facet) => {
      const m = new Map<string, number>();
      for (const o of options) {
        if (!o.meta || !(["o", "p", "u"] as Facet[]).every((x) => x === k || !facet[x] || o.meta?.[x] === facet[x])) continue;
        m.set(o.meta[k], (m.get(o.meta[k]) ?? 0) + 1);
      }
      if (facet[k] && !m.has(facet[k]!)) m.set(facet[k]!, 0);
      return [...m.entries()].sort((a, b) => (k === "u" ? a[0].localeCompare(b[0]) : b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")));
    };
    return { o: count("o"), p: count("p"), u: count("u") };
  }, [options, facet, facetRows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const byFacet = facets ? options.filter((o) => (["o", "p", "u"] as Facet[]).every((k) => !facet[k] || o.meta?.[k] === facet[k])) : options;
    if (!q) return byFacet;
    return byFacet.filter((o) => o.label.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(q));
  }, [options, query, facet, facets]);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    const idx = Math.max(0, filtered.findIndex((o) => o.value === value));
    setActive(idx);
    if (searchable) search.current?.focus();
    else list.current?.focus();
    return () => document.removeEventListener("mousedown", close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (o: Option) => {
    setValue(o.value);
    onChange?.(o.value);
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    // dentro das fileiras de filtro, Enter e espaço acionam o filtro, não a opção
    if (e.key !== "Escape" && (e.target as HTMLElement).closest?.(".ui-facet")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(Math.min(filtered.length, MAX_RENDERED) - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "Home" && open) {
      setActive(0);
    } else if (e.key === "End" && open) {
      setActive(Math.min(filtered.length, MAX_RENDERED) - 1);
    }
  };

  return (
    <FieldShell id={id} label={label} hint={hint} optional={optional}>
      <div
        className={`ui-select${open ? " is-open" : ""}`}
        ref={root}
        onKeyDown={onKey}
        onBlur={(e) => {
          // o foco saiu do seletor (Tab, clique fora): fecha sem escolher
          if (open && !root.current?.contains(e.relatedTarget as Node | null)) {
            setOpen(false);
            setQuery("");
          }
        }}
      >
        <input type="hidden" name={name} value={value} />
        {/* validação nativa sem o visual nativo: campo invisível que exige valor */}
        {required && <input className="ui-sr" tabIndex={-1} aria-hidden="true" required value={value} onChange={() => undefined} onFocus={() => trigger.current?.focus()} />}
        <button
          type="button"
          id={id}
          ref={trigger}
          className="ui-select__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          disabled={!options.length}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={current ? "" : "ui-placeholder"}>{current ? current.label : options.length ? placeholder : emptyText}</span>
          <Icon name="chevron" size={18} className="ui-select__chevron" />
        </button>
        {open && (
          <div className="ui-select__pop">
            {facets && (
              <div className="ui-select__facets">
                {FACETS.map(({ key, label: l, spoken }) =>
                  facetRows?.[key] ? (
                    <FacetRow
                      key={key}
                      label={l}
                      spoken={spoken}
                      values={facets[key]}
                      current={facet[key]}
                      onPick={(v) => {
                        setFacet((f) => ({ ...f, [key]: v }));
                        setActive(0);
                      }}
                    />
                  ) : null,
                )}
              </div>
            )}
            {searchable && (
              <div className="ui-select__search">
                <Icon name="search" size={16} />
                <input
                  {...NO_FILL}
                  ref={search}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  placeholder="Buscar…"
                  aria-label={`Buscar em ${label}`}
                  aria-controls={`${id}-list`}
                  aria-activedescendant={filtered[active] ? `${id}-opt-${active}` : undefined}
                />
              </div>
            )}
            <ul ref={list} id={`${id}-list`} role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={filtered[active] ? `${id}-opt-${active}` : undefined}>
              {optional && !query && (
                <li role="option" aria-selected={value === ""} className={`ui-option ui-option--none${value === "" ? " is-selected" : ""}`} onClick={() => choose({ value: "", label: "" })}>
                  Nenhum
                </li>
              )}
              {filtered.slice(0, MAX_RENDERED).map((o, i) => (
                <li
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={o.value === value}
                  className={`ui-option${i === active ? " is-active" : ""}${o.value === value ? " is-selected" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                >
                  <span>
                    {o.label}
                    {o.hint && <small>{o.hint}</small>}
                  </span>
                  {o.value === value && <Icon name="check" size={16} />}
                </li>
              ))}
              {!filtered.length && <li className="ui-option ui-option--empty">Nada encontrado</li>}
              {filtered.length > MAX_RENDERED && (
                <li className="ui-option ui-option--empty">
                  Mostrando {MAX_RENDERED} de {filtered.length.toLocaleString("pt-BR")}. Digite para refinar.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </FieldShell>
  );
}

/* ---------------------------------------------------------------- Slider */

export function Slider({
  name,
  label,
  min = -100,
  max = 100,
  step = 5,
  defaultValue = 0,
  negLabel,
  posLabel,
}: {
  name: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  negLabel?: string;
  posLabel?: string;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const track = useRef<HTMLDivElement>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const fromPointer = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    setValue(clamp(min + ((clientX - r.left) / r.width) * (max - min)));
  };
  const pos = ((value - min) / (max - min)) * 100;
  const zero = ((0 - min) / (max - min)) * 100;
  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -step * 4, PageUp: step * 4 };
    if (e.key in map) {
      e.preventDefault();
      setValue((v) => clamp(v + map[e.key]));
    } else if (e.key === "Home") setValue(min);
    else if (e.key === "End") setValue(max);
  };
  const lean = value === 0 ? "Centro" : value < 0 ? negLabel : posLabel;
  return (
    <div className="ui-slider">
      <div className="ui-slider__head">
        <span className="ui-label" id={`${id}-label`}>{label}</span>
        <span className="ui-slider__value" data-sign={Math.sign(value)}>
          {value > 0 ? `+${value}` : value}
        </span>
      </div>
      <input type="hidden" name={name} value={value} />
      <div
        className="ui-slider__track"
        ref={track}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          fromPointer(e.clientX);
          (e.currentTarget.querySelector(".ui-slider__thumb") as HTMLElement | null)?.focus();
        }}
        onPointerMove={(e) => {
          if (e.buttons) fromPointer(e.clientX);
        }}
      >
        <span className="ui-slider__fill" style={{ left: `${Math.min(pos, zero)}%`, width: `${Math.abs(pos - zero)}%` }} />
        <span className="ui-slider__zero" style={{ left: `${zero}%` }} />
        <span
          className="ui-slider__thumb"
          role="slider"
          tabIndex={0}
          aria-labelledby={`${id}-label`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${value} (${lean})`}
          style={{ left: `${pos}%` }}
          onKeyDown={onKey}
        />
      </div>
      {(negLabel || posLabel) && (
        <div className="ui-slider__ends">
          <span className={value < 0 ? "on" : ""}>{negLabel}</span>
          <span className={value > 0 ? "on" : ""}>{posLabel}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Escolha em cartões */

export function ChoiceCards({
  name,
  label,
  options,
  defaultValue,
  columns = 3,
}: {
  name: string;
  label: string;
  options: Array<Option & { icon?: string }>;
  defaultValue?: string;
  columns?: number;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue ?? options[0]?.value ?? "");
  return (
    <fieldset className="ui-choices">
      <legend className="ui-label">{label}</legend>
      <div className="ui-choices__grid" style={{ ["--cols" as string]: columns }}>
        {options.map((o) => (
          <label key={o.value} className={`ui-choice${value === o.value ? " is-on" : ""}`} htmlFor={`${id}-${o.value}`}>
            <input className="ui-sr" type="radio" id={`${id}-${o.value}`} name={name} value={o.value} checked={value === o.value} onChange={() => setValue(o.value)} />
            {o.icon && (
              <span className="ui-choice__icon" aria-hidden="true">
                <Icon name={o.icon} size={18} />
              </span>
            )}
            <span className="ui-choice__text">
              <b>{o.label}</b>
              {o.hint && <small>{o.hint}</small>}
            </span>
            <span className="ui-choice__mark" aria-hidden="true">
              <Icon name="check" size={13} />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ---------------------------------------------------------------- Número */

export function Stepper({ name, label, min, max, defaultValue, suffix }: { name: string; label: string; min: number; max: number; defaultValue: number; suffix?: string }) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const set = (v: number) => setValue(Math.min(max, Math.max(min, v)));
  return (
    <div className="ui-field">
      <span className="ui-label" id={`${id}-l`}>{label}</span>
      <div className="ui-stepper" role="group" aria-labelledby={`${id}-l`}>
        <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label="Diminuir">−</button>
        <input
          {...NO_FILL}
          type="text"
          inputMode="numeric"
          name={name}
          value={value}
          aria-labelledby={`${id}-l`}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ""));
            if (!Number.isNaN(n)) setValue(n);
          }}
          onBlur={() => set(value)}
        />
        {suffix && <span className="ui-stepper__suffix">{suffix}</span>}
        <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label="Aumentar">+</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Mensagens */

export function FormMessage({ tone, children }: { tone: "ok" | "err" | "info"; children: React.ReactNode }) {
  return (
    <div className={`ui-msg ui-msg--${tone}`} role={tone === "err" ? "alert" : "status"}>
      <Icon name={tone === "ok" ? "check" : tone === "err" ? "alert" : "info"} size={18} />
      <div>{children}</div>
    </div>
  );
}
