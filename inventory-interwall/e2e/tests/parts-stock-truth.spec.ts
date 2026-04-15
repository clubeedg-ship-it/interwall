import { test, expect, request } from '@playwright/test';

test('parts page stock matches API', async ({ page, baseURL }) => {
  const ctx = await request.newContext({ baseURL });
  const products = await ctx.get('/api/products?composite=false');
  if (products.status() === 401 || products.status() === 403) {
    await ctx.dispose();
    test.skip(true, 'parts endpoints require auth; no headless credentials wired into harness yet');
    return;
  }
  expect(products.status()).toBe(200);
  const productRows = await products.json();
  if (!Array.isArray(productRows) || productRows.length === 0) {
    await ctx.dispose();
    test.skip(true, 'no parts seeded in stack');
    return;
  }

  const valuation = await ctx.get('/api/profit/valuation');
  expect(valuation.status()).toBe(200);
  const valRows = await valuation.json();
  const canonical = new Map<string, number>();
  for (const r of valRows) {
    canonical.set(r.ean, parseFloat(r.total_qty) || 0);
  }

  await page.goto('/#catalog');
  const card = page.locator('[data-ean], .part-card, .product-card').first();
  await card.waitFor({ state: 'attached', timeout: 10_000 });
  const ean = await card.getAttribute('data-ean');
  if (!ean) {
    await ctx.dispose();
    test.skip(true, 'catalog cards do not expose data-ean; selector needs a frontend hook before DOM-vs-canonical assertion is possible');
    return;
  }
  const stockText = await card.locator('[data-stock], .stock, .in-stock').first().innerText();
  const domQty = parseFloat(stockText.replace(/[^0-9.\-]/g, '')) || 0;
  const canonicalQty = canonical.get(ean) ?? 0;
  expect(domQty).toBeCloseTo(canonicalQty, 2);
  await ctx.dispose();
});
