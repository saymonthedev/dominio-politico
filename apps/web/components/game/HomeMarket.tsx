"use client";
import { useMemo, useState } from "react";
import { NO_FILL } from "../forms";
import { Icon } from "../Icon";
import { QuickAction } from "./QuickAction";

export interface MarketQuote {
  tier: number;
  label: string;
  size: number;
  price: number;
  rent: number;
}
export interface MarketBairro {
  name: string;
  pop: number;
  income: number;
  m2: number;
  quotes: MarketQuote[];
}

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/**
 * Bairros reais da cidade (IBGE), do mais caro para o mais barato, com busca. Ao abrir
 * um bairro, aparecem os padrões de imóvel com preço de compra e de aluguel e os
 * botões para alugar, comprar à vista ou financiar.
 */
export function HomeMarket({
  year,
  bairros,
  homeKind,
  homeBairro,
  money,
  kindLabel,
}: {
  year: number;
  bairros: MarketBairro[];
  homeKind: string;
  homeBairro: string;
  money: number;
  /** "bairros" ou "distritos" */
  kindLabel: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const list = useMemo(() => {
    const n = norm(q.trim());
    return n ? bairros.filter((b) => norm(b.name).includes(n)) : bairros;
  }, [bairros, q]);
  const shown = q || all ? list : list.slice(0, 12);
  const ownsHome = homeKind === "PROPRIA";
  const maxM2 = Math.max(...bairros.map((b) => b.m2), 1);

  return (
    <div className="hm">
      <div className="hm__search">
        <Icon name="search" size={16} />
        <input {...NO_FILL} type="text" inputMode="search" enterKeyHint="search" placeholder={`Buscar entre ${bairros.length} ${kindLabel}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Buscar ${kindLabel}`} />
        {q && (
          <button type="button" className="hm__clear" onClick={() => setQ("")} aria-label="Limpar a busca">
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
      {ownsHome && <p className="muted small hm__note">Você mora em casa própria: para alugar ou comprar outra, venda a atual antes (em "Ações").</p>}
      <ul className="hm__list">
        {shown.map((b) => {
          const isOpen = open === b.name;
          const mine = b.name === homeBairro;
          return (
            <li key={b.name} className={`hm__row${isOpen ? " is-open" : ""}${mine ? " is-mine" : ""}`}>
              <button type="button" className="hm__head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.name)}>
                <span className="hm__name">
                  <b>{b.name}</b>
                  {mine && <em>você mora aqui</em>}
                  <small>
                    {b.pop.toLocaleString("pt-BR")} moradores · renda média {brl(b.income)}
                  </small>
                </span>
                <span className="hm__m2">
                  <b className="mono">{brl(b.m2)}</b>
                  <small>por m²</small>
                  <i aria-hidden="true">
                    <em style={{ width: `${Math.max(6, (b.m2 / maxM2) * 100)}%` }} />
                  </i>
                </span>
                <Icon name="chevron" size={16} className={isOpen ? "rot" : ""} />
              </button>
              {isOpen && (
                <div className="hm__tiers">
                  {b.quotes.map((t) => {
                    const buyCash = t.price * 1.03;
                    return (
                      <div key={t.tier} className="hm__tier">
                        <div className="hm__tierinfo">
                          <b>{t.label.charAt(0).toUpperCase() + t.label.slice(1)}</b>
                          <small>{t.size} m²</small>
                        </div>
                        <div className="hm__prices">
                          <span>
                            <small>compra</small>
                            <b className="mono">{brl(t.price)}</b>
                          </span>
                          <span>
                            <small>aluguel</small>
                            <b className="mono">{brl(t.rent)}/mês</b>
                          </span>
                        </div>
                        {!ownsHome && (
                          <div className="hm__btns">
                            <QuickAction year={year} action="alugar_imovel" params={{ bairro: b.name, padrao: String(t.tier) }} label="Alugar" tone="ghost" icon="home" />
                            {money >= buyCash && <QuickAction year={year} action="comprar_imovel" params={{ bairro: b.name, padrao: String(t.tier), pagamento: "VISTA" }} label="Comprar à vista" tone="gold" icon="key" />}
                            <QuickAction year={year} action="comprar_imovel" params={{ bairro: b.name, padrao: String(t.tier), pagamento: "FINANCIADO" }} label="Financiar" tone="primary" icon="coins" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!q && !all && list.length > 12 && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm hm__more" onClick={() => setAll(true)}>
          <span>Ver todos os {list.length} {kindLabel}</span>
        </button>
      )}
      {q && !list.length && <p className="muted small">Nenhum bairro com esse nome.</p>}
    </div>
  );
}
