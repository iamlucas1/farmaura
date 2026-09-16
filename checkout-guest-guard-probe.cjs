const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  // Guest, never logged in — go straight to the checkout route by URL.
  await page.goto('http://127.0.0.1:3000/checkout', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const gateVisible = await page.locator('text=Entre para continuar sua compra').count();
  console.log('auth gate visible for guest on /checkout:', gateVisible);
  const deliveryFormVisible = await page.locator('text=Como você quer receber?').count();
  console.log('delivery form leaked through (should be 0):', deliveryFormVisible);

  await page.screenshot({ path: '/tmp/claude-1000/-home-noname-Documentos-desenvolvimento-dev/9e017e0c-f1c7-4380-b92d-8d052b150958/scratchpad/checkout-guest-gate.png' });

  // "Voltar ao carrinho" should work.
  await page.locator('button', { hasText: 'Voltar ao carrinho' }).click();
  await page.waitForTimeout(800);
  console.log('url after Voltar ao carrinho:', page.url());

  console.log('console/page errors:', JSON.stringify(errors));
  await browser.close();
})();
