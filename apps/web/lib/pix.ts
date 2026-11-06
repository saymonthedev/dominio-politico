import QRCode from "qrcode";

/**
 * Pix para quem quiser apoiar o jogo (doação opcional, sem intermediário: vai direto para a conta).
 * Chave informada pelo autor.
 */
export const PIX = {
  key: "saymonoliveiracastro@gmail.com",
  /** nome e cidade do recebedor no QR Code (padrão do Banco Central: sem acento, até 25 e 15 letras) */
  name: "Saymon Oliveira",
  city: "Jaragua do Sul",
  /** aparece no extrato de quem paga, nos bancos que mostram a descrição */
  description: "Apoio ao Dominio Politico",
} as const;

/** Campo do BR Code: identificador, tamanho com 2 dígitos e o valor. */
function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** Só letras sem acento, números e alguns sinais: o que o padrão aceita em nome e cidade. */
function plain(text: string, max: number): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .@-]/g, "")
    .toUpperCase()
    .slice(0, max)
    .trim();
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como o Banco Central exige no fim do código. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * "Pix copia e cola" (BR Code estático, sem valor: quem doa escolhe quanto). Funciona em qualquer
 * banco: colar o código ou ler o QR Code abre o pagamento já com a chave e o nome do recebedor.
 */
export function pixCode(p: { key: string; name: string; city: string; description?: string } = PIX): string {
  const account = field("00", "br.gov.bcb.pix") + field("01", p.key) + (p.description ? field("02", plain(p.description, 40)) : "");
  const body =
    field("00", "01") +
    field("26", account) +
    field("52", "0000") +
    field("53", "986") +
    field("58", "BR") +
    field("59", plain(p.name, 25)) +
    field("60", plain(p.city, 15)) +
    field("62", field("05", "***")) +
    "6304";
  return body + crc16(body);
}

let qr: Promise<string> | null = null;

/** QR Code do Pix em SVG (feito uma vez por servidor), para quem está no computador ler com o celular. */
export function pixQrSvg(): Promise<string> {
  qr ??= QRCode.toString(pixCode(), { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0b1f3a", light: "#ffffff" } });
  return qr;
}
