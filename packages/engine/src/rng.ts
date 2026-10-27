/**
 * Aleatoriedade determinística do motor.
 *
 * Regra do projeto: NUNCA usar Math.random() dentro do motor de simulação.
 * Toda aleatoriedade deriva de hash(world_seed + subsystem + game_tick + event_id),
 * o que permite reproduzir bugs e reexecutar eleições de forma auditável.
 */

/** cyrb53 em duas metades de 32 bits. */
export function hash32x2(input: string): [number, number] {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [h1 >>> 0, h2 >>> 0];
}

export function hashString(input: string): number {
  return hash32x2(input)[0];
}

export function hashHex(input: string, length = 16): string {
  let out = "";
  let salt = 0;
  while (out.length < length) {
    const [a, b] = hash32x2(`${input}#${salt++}`);
    out += a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
  }
  return out.slice(0, length);
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string) {
    const [h1, h2] = hash32x2(seed);
    const [h3, h4] = hash32x2(`${seed}::sfc`);
    this.a = h1;
    this.b = h2;
    this.c = h3;
    this.d = h4 | 1;
    for (let i = 0; i < 12; i++) this.nextUint();
  }

  /** sfc32 */
  nextUint(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** [0, 1) */
  float(): number {
    return this.nextUint() / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** inteiro em [min, max] */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick em lista vazia");
    return items[Math.floor(this.float() * items.length)];
  }

  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const total = items.reduce((s, it) => s + Math.max(0, weight(it)), 0);
    if (total <= 0) return this.pick(items);
    let r = this.float() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  /** Box–Muller */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    while (u === 0) u = this.float();
    const v = this.float();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  shuffle<T>(items: readonly T[]): T[] {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** RNG = hash(world_seed + subsystem + game_tick + event_id) */
export function rngFor(worldSeed: string, subsystem: string, tick: number, eventId = ""): Rng {
  return new Rng(`${worldSeed}|${subsystem}|${tick}|${eventId}`);
}

/** Identificador determinístico (mesma seed → mesmos ids). */
export function detId(prefix: string, ...parts: Array<string | number>): string {
  return `${prefix}_${hashHex(parts.join("|"), 20)}`;
}
