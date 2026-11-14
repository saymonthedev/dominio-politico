"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sendSuggestion } from "@/app/jogo/[ano]/sugestoes/actions";
import { Button, FormMessage, TextField } from "../forms";
import { Icon } from "../Icon";

const MAX = 3;
const MAX_SIDE = 1600;

/** Reduz a foto no próprio aparelho (até 1600 px, JPEG): o envio fica rápido e dentro do limite. */
async function shrink(file: File): Promise<File> {
  if (file.size < 900_000 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("Não deu para ler uma das fotos. Use JPG, PNG ou WebP.");
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
  if (!blob) throw new Error("Não deu para preparar uma das fotos.");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, { type: "image/jpeg" });
}

/** Nova sugestão: título, a ideia, até 3 fotos e o nome que aparece nos créditos. */
export function SuggestionForm({ year, defaultAuthor }: { year: number; defaultAuthor: string }) {
  const [photos, setPhotos] = useState<Array<{ file: File; url: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setMsg(null);
    const room = MAX - photos.length;
    const picked = [...list].slice(0, room);
    if (list.length > room) setMsg({ tone: "err", text: `No máximo ${MAX} fotos por sugestão.` });
    try {
      const ready = await Promise.all(picked.map(shrink));
      setPhotos((p) => [...p, ...ready.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Foto inválida." });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const remove = (i: number) =>
    setPhotos((p) => {
      URL.revokeObjectURL(p[i].url);
      return p.filter((_, j) => j !== i);
    });

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("photos");
    for (const p of photos) fd.append("photos", p.file);
    setBusy(true);
    setMsg(null);
    const r = await sendSuggestion(year, fd).catch(() => ({ ok: false, message: "Sem conexão. Tente de novo." }));
    setBusy(false);
    setMsg({ tone: r.ok ? "ok" : "err", text: r.message });
    if (r.ok) {
      formRef.current?.reset();
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
      router.refresh();
    }
  };

  return (
    <form ref={formRef} className="sug-form" onSubmit={submit}>
      <TextField label="Título" name="title" required minLength={3} maxLength={120} placeholder="Ex.: Debate ao vivo entre jogadores" />
      <div className="ui-field">
        <label className="ui-label" htmlFor="sug-body">
          Sua ideia
        </label>
        <div className="ui-input ui-input--area">
          <textarea id="sug-body" name="body" required minLength={3} maxLength={2000} rows={5} placeholder="Conte o que você gostaria de ver no jogo e por quê." />
        </div>
      </div>
      <div className="ui-field">
        <span className="ui-label">
          Fotos <span className="ui-optional">opcional, até {MAX}</span>
        </span>
        <div className="sug-photos">
          {photos.map((p, i) => (
            <figure key={p.url} className="sug-photo">
              <img src={p.url} alt={`Foto ${i + 1} da sugestão`} />
              <button type="button" onClick={() => remove(i)} aria-label={`Tirar a foto ${i + 1}`}>
                <Icon name="x" size={14} />
              </button>
            </figure>
          ))}
          {photos.length < MAX && (
            <label className="sug-add">
              <Icon name="plus" size={18} />
              <span>Adicionar foto</span>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={(e) => void add(e.target.files)} />
            </label>
          )}
        </div>
        <div className="ui-hint">Prints da tela ajudam a mostrar o que você quer dizer.</div>
      </div>
      <TextField label="Nome nos créditos" name="author" required maxLength={60} defaultValue={defaultAuthor} hint="Aparece no aviso para todos se a sugestão entrar no jogo." />
      {msg && <FormMessage tone={msg.tone}>{msg.text}</FormMessage>}
      <Button type="submit" tone="gold" icon="sparkle" loading={busy} disabled={busy}>
        Enviar sugestão
      </Button>
    </form>
  );
}
