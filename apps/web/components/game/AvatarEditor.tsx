"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAvatar } from "@/app/jogo/actions";
import { AVATAR_PARTS, avatarCode, parseAvatar, randomAvatar, type AvatarKey, type AvatarSpec } from "@/lib/avatar-code";
import { useModal } from "../a11y";
import { AvatarSvg } from "../Avatar";
import { Button } from "../forms";
import { Icon } from "../Icon";

/** Partes que mudam o desenho: as opções aparecem como miniaturas do próprio avatar. */
const SHAPES = new Set<AvatarKey>(["hair", "facial", "glasses", "top"]);

/** Botão "Editar visual" e a janela de montar o avatar (só aparência: não gasta tempo nem energia). */
export function AvatarEditor({ year, code }: { year: number; code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" tone="ghost" size="sm" icon="user" onClick={() => setOpen(true)}>
        Editar visual
      </Button>
      {open && <AvatarDialog year={year} code={code} onClose={() => setOpen(false)} />}
    </>
  );
}

function AvatarDialog({ year, code, onClose }: { year: number; code: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [spec, setSpec] = useState<AvatarSpec>(() => parseAvatar(code) ?? parseAvatar(randomAvatar())!);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useModal(box, true, () => !pending && onClose());
  const current = avatarCode(spec);
  const set = (key: AvatarKey, v: number) => setSpec((s) => ({ ...s, [key]: v }));
  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveAvatar(year, current);
      if (!r.ok) return setError(r.message);
      router.refresh();
      onClose();
    });

  return (
    <div className="ui-overlay" onMouseDown={(e) => e.target === e.currentTarget && !pending && onClose()}>
      <div className="ui-dialog avedit" role="dialog" aria-modal="true" aria-labelledby="avedit-title" ref={box}>
        <div className="avedit__head">
          <span className="avedit__preview">
            <AvatarSvg code={current} title="Prévia do seu visual" />
          </span>
          <div>
            <h2 id="avedit-title">Seu visual</h2>
            <p className="muted small">Só aparência: aparece para você e para os outros jogadores, sem mudar nada no jogo.</p>
            <Button type="button" tone="ghost" size="sm" icon="sparkle" onClick={() => setSpec(parseAvatar(randomAvatar())!)}>
              Sortear
            </Button>
          </div>
        </div>
        <div className="avedit__parts">
          {AVATAR_PARTS.map((part) => (
            <fieldset key={part.key} className="avedit__part">
              <legend>{part.label}</legend>
              <div className={`avedit__opts${SHAPES.has(part.key) ? " is-shapes" : ""}`}>
                {part.options.map((o, i) => {
                  const on = spec[part.key] === i;
                  return (
                    <button key={i} type="button" className={`avedit__opt${on ? " on" : ""}`} aria-pressed={on} title={o.label} aria-label={o.label} onClick={() => set(part.key, i)}>
                      {SHAPES.has(part.key) ? (
                        <AvatarSvg code={avatarCode({ ...spec, [part.key]: i })} />
                      ) : (
                        <i style={{ background: o.color }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        {error && (
          <p className="avedit__err" role="alert">
            <Icon name="alert" size={14} /> {error}
          </p>
        )}
        <div className="ui-dialog__actions">
          <Button type="button" tone="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" tone="gold" icon="check" loading={pending} onClick={save}>
            Salvar visual
          </Button>
        </div>
      </div>
    </div>
  );
}
