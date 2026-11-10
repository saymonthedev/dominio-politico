import { del, get, head, put } from "@vercel/blob";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { brotliCompress, brotliDecompress, constants as Z } from "node:zlib";
import { simSecret } from "./env";

/**
 * Cópia de cada mundo fora do banco (Vercel Blob, loja privada), compactada e criptografada.
 *
 * Um servidor que acabou de ligar precisa do mundo inteiro na memória. Montar isso no banco custa
 * de 5 a 10 s de processamento por mundo (até 18 MB de dados), e no plano grátis, quando vários
 * servidores fazem isso juntos, o banco trava e as telas estouram o limite de 60 s. Com a cópia, o
 * servidor lê 1 a 3 MB daqui e pede ao banco só o que mudou depois dela.
 *
 * A cópia guarda a revisão do mundo em que foi tirada. Ela só vale se o banco ainda tiver o registro
 * de tudo o que mudou depois dessa revisão; senão (cópia velha demais, mundo recriado, conta
 * excluída), o servidor monta o mundo no banco como antes e grava uma cópia nova.
 *
 * Liga sozinha quando a loja está conectada ao projeto; WORLD_SNAPSHOTS=0 desliga sem publicar código.
 * Cada leitura e gravação deixa uma linha "[copia]" nos registros da Vercel.
 */
export const SNAPSHOTS = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) && process.env.WORLD_SNAPSHOTS !== "0";

const MAGIC = Buffer.from("DPS1");
const pack = promisify(brotliCompress);
const unpack = promisify(brotliDecompress);
const pathOf = (worldId: string) => `mundos/${worldId}.bin`;
/** a chave sai do segredo do motor: quem só tiver acesso à loja não lê o mundo */
const key = () => createHash("sha256").update("dominio-politico/copia-do-mundo/v1/").update(simSecret()).digest();
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const why = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 300);
const notFound = (e: unknown) => e instanceof Error && /not ?found/i.test(`${e.name} ${e.message}`);

export interface Snapshot<T> {
  /** revisão do mundo no banco quando a cópia foi tirada */
  rev: number;
  /** quando foi tirada (ms) */
  at: number;
  data: T;
}

/** A cópia guardada, ou null (não há, está corrompida, ou a loja não respondeu a tempo). */
export async function readSnapshot<T>(worldId: string, timeoutMs = 5_000): Promise<Snapshot<T> | null> {
  if (!SNAPSHOTS) return null;
  const t0 = Date.now();
  try {
    const res = await get(pathOf(worldId), { access: "private", abortSignal: AbortSignal.timeout(timeoutMs) });
    if (!res || res.statusCode !== 200 || !res.stream) {
      console.log(`[copia] ${worldId}: sem cópia guardada`);
      return null;
    }
    const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
    if (buf.length < 33 || !buf.subarray(0, 4).equals(MAGIC)) throw new Error("formato desconhecido");
    const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(4, 16));
    decipher.setAuthTag(buf.subarray(16, 32));
    const packed = Buffer.concat([decipher.update(buf.subarray(32)), decipher.final()]);
    const snap = JSON.parse((await unpack(packed)).toString("utf8")) as Snapshot<T>;
    if (typeof snap?.rev !== "number" || !snap.data) throw new Error("conteúdo inválido");
    console.log(`[copia] ${worldId}: lida rev ${snap.rev}, ${mb(buf.length)} em ${Date.now() - t0} ms`);
    return snap;
  } catch (e) {
    if (notFound(e)) console.log(`[copia] ${worldId}: sem cópia guardada`);
    else console.warn(`[copia] ${worldId}: erro ao ler (${Date.now() - t0} ms): ${why(e)}`);
    return null;
  }
}

/** Há uma cópia tirada há menos de `ms`? (pergunta barata, sem baixar a cópia) */
export async function snapshotNewerThan(worldId: string, ms: number): Promise<boolean> {
  if (!SNAPSHOTS) return true;
  try {
    const meta = await head(pathOf(worldId), { abortSignal: AbortSignal.timeout(4_000) });
    return Date.now() - meta.uploadedAt.getTime() < ms;
  } catch (e) {
    if (!notFound(e)) console.warn(`[copia] ${worldId}: erro ao consultar: ${why(e)}`);
    return false;
  }
}

/**
 * Grava a cópia. O texto do mundo é montado na hora da chamada (antes de qualquer espera), então a
 * cópia sai exatamente como o mundo estava nesse instante, mesmo que ele mude logo depois.
 */
export function writeSnapshot(worldId: string, snap: Snapshot<unknown>): Promise<boolean> {
  if (!SNAPSHOTS) return Promise.resolve(false);
  const t0 = Date.now();
  let raw: Buffer;
  try {
    raw = Buffer.from(JSON.stringify(snap));
  } catch (e) {
    console.warn(`[copia] ${worldId}: erro ao montar a cópia: ${why(e)}`);
    return Promise.resolve(false);
  }
  return (async () => {
    try {
      const packed = await pack(raw, { params: { [Z.BROTLI_PARAM_QUALITY]: 4, [Z.BROTLI_PARAM_SIZE_HINT]: raw.length } });
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key(), iv);
      const sealed = Buffer.concat([cipher.update(packed), cipher.final()]);
      const body = Buffer.concat([MAGIC, iv, cipher.getAuthTag(), sealed]);
      await put(pathOf(worldId), body, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/octet-stream",
        // a leitura pode vir de um cache por até 1 min: no máximo um pouco mais de mudanças a buscar no banco
        cacheControlMaxAge: 60,
        multipart: body.length > 4_000_000,
        abortSignal: AbortSignal.timeout(30_000),
      });
      console.log(`[copia] ${worldId}: gravada rev ${snap.rev}, ${mb(raw.length)} → ${mb(body.length)} em ${Date.now() - t0} ms`);
      return true;
    } catch (e) {
      console.warn(`[copia] ${worldId}: erro ao gravar (${mb(raw.length)}, ${Date.now() - t0} ms): ${why(e)}`);
      return false;
    }
  })();
}

/** Apaga a cópia (mundo removido, ou criado de novo com o mesmo id). */
export async function dropSnapshot(worldId: string): Promise<void> {
  if (!SNAPSHOTS) return;
  await del(pathOf(worldId), { abortSignal: AbortSignal.timeout(4_000) }).catch(() => undefined);
}
