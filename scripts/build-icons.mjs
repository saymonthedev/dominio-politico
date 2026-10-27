/**
 * Gera favicon, ícones do app e SVGs da marca a partir do desenho em
 * apps/web/components/Logo.tsx (LOGO_PATHS). Uso: node scripts/build-icons.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// Playwright vem instalado globalmente no ambiente de desenvolvimento
const { chromium } = createRequire(import.meta.url)("playwright");

const root = new URL("../apps/web/", import.meta.url);
const src = readFileSync(new URL("components/Logo.tsx", root), "utf8");
const paths = src.match(/LOGO_PATHS = `([^`]+)`/)[1];

const svg = (rx, ring = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#173763"/><stop offset="1" stop-color="#0b1f3a"/></linearGradient></defs><rect width="64" height="64" rx="${rx}" fill="url(#g)"/>${ring ? `<rect x=".75" y=".75" width="62.5" height="62.5" rx="${Math.max(0, rx - 0.75)}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1.5"/>` : ""}${paths}</svg>`;
// ícone "maskable"/Apple: fundo cheio e desenho reduzido para a zona segura
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#173763"/><stop offset="1" stop-color="#0b1f3a"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><g transform="translate(6.4 6.4) scale(.8)">${paths}</g></svg>`;

writeFileSync(new URL("app/icon.svg", root), svg(16));
writeFileSync(new URL("public/logo-mark.svg", root), svg(16));
writeFileSync(new URL("public/icons/app-icon.svg", root), full);

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(markup, size, rounded) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  return page.screenshot({ omitBackground: rounded, clip: { x: 0, y: 0, width: size, height: size } });
}
writeFileSync(new URL("app/apple-icon.png", root), await png(full, 180, false));
writeFileSync(new URL("public/icons/icon-192.png", root), await png(svg(14, false), 192, true));
writeFileSync(new URL("public/icons/icon-512.png", root), await png(svg(14, false), 512, true));
writeFileSync(new URL("public/icons/icon-maskable-512.png", root), await png(full, 512, false));

// favicon.ico com 16, 32 e 48 px (PNG embutido em ICO)
const sizes = [16, 32, 48];
const images = [];
for (const s of sizes) images.push(await png(svg(s <= 16 ? 12 : 14, false), s, true));
await browser.close();
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = [];
sizes.forEach((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  dir.push(e);
});
writeFileSync(new URL("app/favicon.ico", root), Buffer.concat([header, ...dir, ...images]));
console.log("ícones gerados");
