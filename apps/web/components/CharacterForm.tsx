"use client";
import { useActionState, useState } from "react";
import { createCharacterAction, type ActionState } from "@/app/jogo/actions";

interface Option { value: string; label: string }
interface Axis { key: string; label: string; neg: string; pos: string }

export function CharacterForm({ year, ufs, professions, origins, axes }: { year: number; ufs: Option[]; professions: Option[]; origins: Option[]; axes: Axis[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCharacterAction, { ok: true, message: "" });
  const [vals, setVals] = useState<Record<string, number>>(Object.fromEntries(axes.map((a) => [a.key, 0])));
  return (
    <form action={action} className="grid grid-2" style={{ alignItems: "start" }}>
      <input type="hidden" name="year" value={year} />
      <div className="card">
        <h2>Quem é você</h2>
        <label htmlFor="name">Nome do personagem</label>
        <input id="name" name="name" required minLength={3} maxLength={40} placeholder="Ex.: Joana Ribeiro" />
        <label htmlFor="uf">UF (sua base será a capital)</label>
        <select id="uf" name="uf" required defaultValue="">
          <option value="" disabled>Escolha</option>
          {ufs.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <label htmlFor="age">Idade</label>
        <input id="age" name="age" type="number" min={18} max={80} defaultValue={30} required />
        <label htmlFor="profession">Profissão anterior</label>
        <select id="profession" name="profession" required>
          {professions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <label htmlFor="origin">Origem socioeconômica (fictícia)</label>
        <select id="origin" name="origin" required>
          {origins.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="muted mt" style={{ fontSize: ".82rem" }}>
          A profissão define renda, competência e carisma iniciais. A origem define suas economias e quantas pessoas já conhecem você.
        </p>
      </div>
      <div className="card">
        <h2>Posições do personagem</h2>
        <p className="muted" style={{ fontSize: ".85rem" }}>Seis eixos de −100 a +100. São do personagem, não suas.</p>
        {axes.map((a) => (
          <div key={a.key}>
            <label htmlFor={`ax_${a.key}`} className="row between">
              <span>{a.label}</span>
              <span className="mono muted">{vals[a.key]}</span>
            </label>
            <input
              id={`ax_${a.key}`}
              name={`ax_${a.key}`}
              type="range"
              min={-100}
              max={100}
              step={5}
              value={vals[a.key]}
              onChange={(e) => setVals((v) => ({ ...v, [a.key]: Number(e.target.value) }))}
            />
            <div className="row between muted" style={{ fontSize: ".72rem" }}>
              <span>{a.neg}</span>
              <span>{a.pos}</span>
            </div>
          </div>
        ))}
        <button className="btn gold mt" disabled={pending} style={{ width: "100%" }}>
          {pending ? "Criando o mundo e o personagem…" : "Entrar na vida pública"}
        </button>
        {pending && <p className="muted mt" style={{ fontSize: ".82rem" }}>Se você é o primeiro jogador deste ano, o país real está sendo montado (pode levar alguns segundos).</p>}
        {state.message && !state.ok && <div className="form-msg err">{state.message}</div>}
      </div>
    </form>
  );
}
