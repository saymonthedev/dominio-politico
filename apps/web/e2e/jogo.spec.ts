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

/** Responde (com a primeira opção disponível) os acontecimentos abertos na tela. */
async function answerOpenEvents(page: Page) {
  const ev = page.locator(".ev");
  for (let i = 0; i < 8 && (await ev.isVisible()); i++) {
    await ev.locator(".ev__choice:not(:disabled)").first().click();
    await ev.locator(".ev__continue").click();
    await page.waitForTimeout(400);
  }
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

  // passar o tempo: a semana vivida dia a dia; as decisões que param o relógio são respondidas no pop-up
  await page.goto("/jogo/2026");
  await page.waitForTimeout(1500);
  await answerOpenEvents(page);
  if (await page.locator(".tm__wait button").count()) {
    await page.locator(".tm__wait button").click();
    await answerOpenEvents(page);
  }
  await page.locator(".tm__opt--main").click();
  await expect(page.locator(".tm.is-live")).toBeVisible();
  const summary = page.locator(".pr__foot");
  for (let i = 0; i < 12; i++) {
    await expect.poll(async () => (await summary.isVisible()) || (await page.locator(".ev").isVisible()), { timeout: 120_000 }).toBe(true);
    if (await summary.isVisible()) break;
    await answerOpenEvents(page);
  }
  await expect(summary).toBeVisible();
  await expect(page.locator(".pr h2")).toContainText("Como foram seus dias");

  // convite no resumo: depois de responder, os botões somem
  const accept = page.locator(".pr-actions").getByRole("button", { name: "Recusar" }).first();
  if (await accept.count()) {
    await accept.click();
    await expect(page.getByText("Convite recusado.").first()).toBeVisible();
  }

  // ranking, carreira (com o histórico) e campanha abrem sem erro
  for (const path of ["/jogo/2026/ranking", "/jogo/2026/carreira", "/jogo/2026/noticias", "/jogo/2026/campanha"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
  }
  await page.goto("/jogo/2026/carreira");
  await expect(page.locator("#historia")).toBeVisible();

  await dropLeftovers(page);
  await page.goto("/jogo");
  await expect(page.locator(".world-card")).toHaveCount(0);
});
