"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { decide } from "@/app/admin/actions";
import type { AdminSuggestion, SuggestionStatus } from "@/lib/suggestions";
import { fmtDay } from "@/lib/format";
import { Button } from "./forms";
import { Icon } from "./Icon";

const LABEL: Record<SuggestionStatus, string> = { NOVA: "Nova", CONCLUIDA: "Concluída", REPROVADA: "Reprovada" };
const TONE: Record<SuggestionStatus, string> = { NOVA: "pill--gold", CONCLUIDA: "pill--ok", REPROVADA: "pill--bad" };
type Filter = SuggestionStatus | "TODAS";

function Card({ s }: { s: AdminSuggestion }) {
  const [note, setNote] = useState(s.admin_note ?? "");
  const [busy, setBusy] = useState<SuggestionStatus | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const run = async (status: SuggestionStatus) => {
    setBusy(status);
    setMsg(null);
    const r = await decide(s.id, status, note).catch(() => ({ ok: false, message: "Sem conexão." }));
    setBusy(null);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) router.refresh();
  };
  return (
    <li className={`adm-sug adm-sug--${s.status.toLowerCase()}`}>
      <div className="adm-sug__head">
        <b>{s.title}</b>
        <span className={`pill ${TONE[s.status]}`}>{LABEL[s.status]}</span>
      </div>
      <small className="muted">
        {s.author_name}
        {s.email ? ` · ${s.email}` : ""}
        {s.world_year ? ` · mundo ${s.world_year}` : ""} · {fmtDay(s.created_at)}
        {s.decided_at ? ` · decidida em ${fmtDay(s.decided_at)}` : ""}
      </small>
      <p className="adm-sug__body">{s.body}</p>
      {s.images.length > 0 && (
        <div className="sug-thumbs">
          {s.images.map((p, i) => (
            <a key={p} href={`/api/sugestao-foto?p=${encodeURIComponent(p)}`} target="_blank" rel="noopener">
              <img src={`/api/sugestao-foto?p=${encodeURIComponent(p)}`} alt={`Foto ${i + 1}`} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <label className="adm-sug__note">
        <span>Nota para o jogador</span>
        <textarea
          value={note}
          maxLength={1000}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Concluída: o que mudou no jogo (vai no aviso para todos). Reprovada: o motivo (só o jogador vê)."
        />
      </label>
      <div className="adm-sug__actions">
        <Button type="button" tone="gold" size="sm" icon="check" loading={busy === "CONCLUIDA"} disabled={!!busy} onClick={() => run("CONCLUIDA")}>
          {s.status === "CONCLUIDA" ? "Salvar como concluída" : "Concluir"}
        </Button>
        <Button type="button" tone="danger" size="sm" icon="x" loading={busy === "REPROVADA"} disabled={!!busy} onClick={() => run("REPROVADA")}>
          {s.status === "REPROVADA" ? "Salvar como reprovada" : "Reprovar"}
        </Button>
        {s.status !== "NOVA" && (
          <Button type="button" tone="ghost" size="sm" loading={busy === "NOVA"} disabled={!!busy} onClick={() => run("NOVA")}>
            Voltar para nova
          </Button>
        )}
      </div>
      {msg && (
        <p className={`adm-sug__msg${msg.ok ? "" : " is-err"}`} role="status">
          <Icon name={msg.ok ? "check" : "alert"} size={14} /> {msg.text}
        </p>
      )}
    </li>
  );
}

/** Sugestões dos jogadores no /admin: as novas primeiro, com fotos, nota e decisão. */
export function AdminSuggestions({ items }: { items: AdminSuggestion[] }) {
  const [filter, setFilter] = useState<Filter>("NOVA");
  const count = (f: Filter) => (f === "TODAS" ? items.length : items.filter((s) => s.status === f).length);
  const shown = filter === "TODAS" ? items : items.filter((s) => s.status === filter);
  return (
    <div className="adm-sugs">
      <div className="seg" role="tablist" aria-label="Filtrar sugestões">
        {(["NOVA", "CONCLUIDA", "REPROVADA", "TODAS"] as Filter[]).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f === "TODAS" ? "Todas" : f === "NOVA" ? "Novas" : f === "CONCLUIDA" ? "Concluídas" : "Reprovadas"} ({count(f)})
          </button>
        ))}
      </div>
      {shown.length ? (
        <ul className="adm-sug-list">
          {shown.map((s) => (
            <Card key={`${s.id}:${s.status}:${s.decided_at ?? ""}`} s={s} />
          ))}
        </ul>
      ) : (
        <p className="muted small">Nada por aqui.</p>
      )}
    </div>
  );
}
