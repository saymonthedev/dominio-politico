import { expect, test, type Page } from "@playwright/test";

/**
 * Percorre o essencial do jogo com a conta de teste, num mundo só dela
 * (criado e apagado a cada execução): entrar, criar personagem, ver partidos
 * com logos, passar o tempo e responder um convite, se aparecer.
 */
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

async function login(page: Page) {
  await page.goto("/entrar");
  await page.locator('input[name="acesso"]').fill(EMAIL);
  await page.locator('input[name="chave"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/jogo/);
}

/** Apaga o mundo próprio que tenha sobrado de uma execução anterior. */
async function dropLeftovers(page: Page) {
  await page.goto("/conta");
  while (await page.getByRole("button", { name: "Apagar este mundo" }).count()) {
    const card = page.locator("section.account-card", { has: page.getByRole("button", { name: "Apagar este mundo" }) }).first();
    await card.locator(".ui-check").click();
    await card.getByRole("button", { name: "Apagar este mundo" }).click();
    await page.waitForURL(/mundo=apagado/);
  }
}

test.describe.configure({ mode: "serial" });

test("páginas públicas", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Planalto");
  await page.goto("/partida/2018");
  await expect(page.getByRole("heading", { name: "Brasil pós-2018" })).toBeVisible();
  await expect(page.locator(".sp-ufs li")).toHaveCount(27);
  const missing = await page.goto("/pagina-que-nao-existe");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("convenção");
  const og = await request.get("/opengraph-image");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
});

test("carreira num mundo só seu", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "sem conta de teste (E2E_EMAIL / E2E_PASSWORD)");
  await login(page);
  await dropLeftovers(page);

  // criar personagem no mundo "Só meu" de 2026
  await page.goto("/jogo/novo?ano=2026");
  await page.locator(".ui-choice", { hasText: "Só meu" }).first().click();
  await page.locator('input[name="name"]').fill("Teste Automático");
  await page.getByRole("button", { name: "Estado", exact: true }).click();
  await page.getByRole("option", { name: /Bahia/ }).click();
  await page.getByRole("button", { name: "Entrar na vida pública" }).click();
  await page.waitForURL(/\/jogo\/2026$/, { timeout: 120_000 });
  await expect(page.locator(".gtop__brand small")).toContainText("só seu");

  // partidos: logos com tamanho de verdade (o defeito dos quadrados em branco)
  await page.goto("/jogo/2026/partidos");
  const logo = page.locator(".pmark--logo img").first();
  await expect(logo).toBeVisible();
  const box = await logo.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(10);
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);

  // passar o tempo: 1 mês, com resumo do período
  await page.goto("/jogo/2026");
  await page.locator(".tm__opt--main").click();
  await expect(page.locator(".pr-notes, .pr__foot").first()).toBeVisible({ timeout: 120_000 });

  // convite no resumo: depois de responder, os botões somem
  const accept = page.locator(".pr-actions").getByRole("button", { name: "Recusar" }).first();
  if (await accept.count()) {
    await accept.click();
    await expect(page.getByText("Convite recusado.").first()).toBeVisible();
  }

  // ranking e carreira abrem sem erro
  for (const path of ["/jogo/2026/ranking", "/jogo/2026/carreira", "/jogo/2026/noticias"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
  }

  await dropLeftovers(page);
  await page.goto("/jogo");
  await expect(page.locator(".world-card")).toHaveCount(0);
});
