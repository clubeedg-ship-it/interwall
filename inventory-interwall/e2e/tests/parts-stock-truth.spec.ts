import { test, expect, request } from '@playwright/test';

/**
 * DOM-vs-canonical: the catalog's `.stock-qty` for a given part must match
 * the aggregated `total_qty` returned by /api/profit/valuation for that
 * product's EAN. Those two surfaces are how the UI and the API agree on
 * "how much of this part is on hand".
 */
test('parts catalog stock matches /api/profit/valuation', async ({ page, baseURL, context }) => {
  const ctx = await request.newContext({ baseURL, storageState: await context.storageState() });

  const productsResp = await ctx.get('/api/products?composite=false');
  expect(productsResp.status(), 'GET /api/products should succeed with auth').toBe(200);
  const products: Array<{ id: string; ean: string; name: string }> = await productsResp.json();
  if (!Array.isArray(products) || products.length === 0) {
    await ctx.dispose();
    test.skip(true, 'no parts seeded in stack');
    return;
  }

  const valuationResp = await ctx.get('/api/profit/valuation');
  expect(valuationResp.status()).toBe(200);
  const valuation: Array<{ ean: string; total_qty: string | number }> = await valuationResp.json();
  const qtyByEan = new Map<string, number>();
  for (const row of valuation) {
    qtyByEan.set(row.ean, Number(row.total_qty) || 0);
  }

  await page.goto('/');
  await page.click('[data-view="catalog"]');
  const firstCard = page.locator('.part-card').first();
  await firstCard.waitFor({ state: 'visible', timeout: 15_000 });

  const pk = await firstCard.getAttribute('data-part-id');
  expect(pk, 'catalog card must expose data-part-id').toBeTruthy();
  const product = products.find(p => p.id === pk);
  expect(product, `product ${pk} should appear in /api/products payload`).toBeTruthy();

  const domText = (await firstCard.locator('.stock-qty').first().innerText()).trim();
  const domQty = parseFloat(domText.replace(/[^0-9.\-]/g, '')) || 0;
  const canonicalQty = qtyByEan.get(product!.ean) ?? 0;

  expect(domQty, `DOM stock for ${product!.ean} should equal valuation total_qty`).toBeCloseTo(canonicalQty, 2);
  await ctx.dispose();
});
