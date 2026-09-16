const { chromium } = require('playwright');

async function closeAnyModal(page) {
  const overlay = page.locator('.fa-modal-overlay');
  if (await overlay.count() === 0) return;
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  if (await overlay.count() > 0) {
    await page.locator('.fa-modal-x').first().click({ timeout: 3000, force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await ctx.newPage();

  await page.goto('http://127.0.0.1:3000/marketplace.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await closeAnyModal(page);
  await page.locator('text=Entrar / Criar conta').first().click();
  await page.waitForTimeout(500);
  await page.locator('text=Entrar / Criar conta').last().click();
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', 'mariana.souza@cliente.farmaura.com.br');
  await page.fill('input[type="password"]', 'Farmaura@123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
  await closeAnyModal(page);

  await page.locator('[aria-label="carrinho"]').first().click();
  await page.waitForTimeout(1500);
  await closeAnyModal(page);

  await page.locator('button', { hasText: 'Enviar nova receita' }).first().click();
  await page.waitForTimeout(1000);
  const msgCount = await page.locator('text=Receita recusada pelo farmacêutico. Motivo:').count();
  console.log('rejection message visible in reopened chat:', msgCount);
  await page.screenshot({ path: '/tmp/claude-1000/-home-noname-Documentos-desenvolvimento-dev/9e017e0c-f1c7-4380-b92d-8d052b150958/scratchpad/rx-chat-with-reason.png' });

  await browser.close();
})();
