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
 * servidor lê 1 a 2 MB daqui e pede ao banco só o que mudou depois dela.
 *
 * A cópia guarda a revisão do mundo em que foi tirada. Ela só vale se o banco ainda tiver o registro
 * de tudo o que mudou depois dessa revisão; senão (cópia velha demais, mundo recriado, conta
 * excluída), o servidor monta o mundo no banco como antes e grava uma cópia nova.
 *
 * Liga sozinha quando a loja está conectada ao projeto; WORLD_SNAPSHOTS=0 desliga sem publicar código.
 */
export const SNAPSHOTS = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) && process.env.WORLD_SNAPSHOTS !== "0";

const MAGIC = Buffer.from("DPS1");
const pack = promisify(brotliCompress);
const unpack = promisify(brotliDecompress);
const pathOf = (worldId: string) => `mundos/${worldId}.bin`;
/** a chave sai do segredo do motor: quem só tiver acesso à loja não lê o mundo */
const key = () => createHash("sha256").update("dominio-politico/copia-do-mundo/v1/").update(simSecret()).digest();

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
  try {
    const res = await get(pathOf(worldId), { access: "private", abortSignal: AbortSignal.timeout(timeoutMs) });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
    if (buf.length < 33 || !buf.subarray(0, 4).equals(MAGIC)) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(4, 16));
    decipher.setAuthTag(buf.subarray(16, 32));
    const packed = Buffer.concat([decipher.update(buf.subarray(32)), decipher.final()]);
    const snap = JSON.parse((await unpack(packed)).toString("utf8")) as Snapshot<T>;
    return typeof snap?.rev === "number" && snap.data ? snap : null;
  } catch {
    return null;
  }
}

/** Há uma cópia tirada há menos de `ms`? (pergunta barata, sem baixar a cópia) */
export async function snapshotNewerThan(worldId: string, ms: number): Promise<boolean> {
  if (!SNAPSHOTS) return true;
  try {
    const meta = await head(pathOf(worldId));
    return Date.now() - meta.uploadedAt.getTime() < ms;
  } catch {
    return false;
  }
}

/**
 * Grava a cópia. O texto do mundo é montado na hora da chamada (antes de qualquer espera), então a
 * cópia sai exatamente como o mundo estava nesse instante, mesmo que ele mude logo depois.
 */
export function writeSnapshot(worldId: string, snap: Snapshot<unknown>): Promise<boolean> {
  if (!SNAPSHOTS) return Promise.resolve(false);
  let raw: Buffer;
  try {
    raw = Buffer.from(JSON.stringify(snap));
  } catch {
    return Promise.resolve(false);
  }
  return (async () => {
    try {
      const packed = await pack(raw, { params: { [Z.BROTLI_PARAM_QUALITY]: 4, [Z.BROTLI_PARAM_SIZE_HINT]: raw.length } });
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key(), iv);
      const body = Buffer.concat([cipher.update(packed), cipher.final()]);
      await put(pathOf(worldId), Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/octet-stream",
        // a leitura pode vir de um cache por até 1 min: no máximo um pouco mais de mudanças a buscar no banco
        cacheControlMaxAge: 60,
      });
      return true;
    } catch {
      return false;
    }
  })();
}

/** Apaga a cópia (mundo removido, ou criado de novo com o mesmo id). */
export async function dropSnapshot(worldId: string): Promise<void> {
  if (!SNAPSHOTS) return;
  await del(pathOf(worldId)).catch(() => undefined);
}
