import { test, expect, request } from '@playwright/test';

/**
 * DOM-vs-canonical: the profit view's "Today's Margin" (#todayMargin)
 * is rendered from `profitState.totalMargin`, which profitEngine.init()
 * computes as sum(parseFloat(tx.profit)) over the first 100 rows of
 * /api/profit/transactions. See inventory-interwall/frontend/profit.js
 * (mapApiTransaction + init). The value is API-derived *when* the
 * endpoint returns at least one row; otherwise the engine falls back
 * to localStorage (recordSale.loadTransactions), at which point we
 * refuse to assert against browser state.
 *
 * NOTE: the label says "Today's Margin" but the implementation is a
 * lifetime sum over the loaded window — the source comment explicitly
 * flags this ("Simplified for MVP"). The contract this test enforces
 * is the one the code implements, not the label.
 */
test("profit 'Today's Margin' derives from /api/profit/transactions", async ({ page, baseURL, context }) => {
  const ctx = await request.newContext({ baseURL, storageState: await context.storageState() });

  const txResp = await ctx.get('/api/profit/transactions?limit=100&offset=0');
  expect(txResp.status(), 'GET /api/profit/transactions should succeed with auth').toBe(200);
  const txns: Array<{ profit: string | number }> = await txResp.json();
  if (!Array.isArray(txns) || txns.length === 0) {
    await ctx.dispose();
    test.skip(
      true,
      "/api/profit/transactions is empty — profitEngine would fall back to localStorage; skipping to avoid asserting against browser state"
    );
    return;
  }

  const expected = txns.reduce((sum, t) => sum + (parseFloat(String(t.profit)) || 0), 0);
  const expectedText = `${expected >= 0 ? '' : '-'}€${Math.abs(expected).toFixed(2)}`;

  await page.goto('/');
  await page.click('[data-view="profit"]');
  const margin = page.locator('#todayMargin');
  await margin.waitFor({ state: 'visible', timeout: 15_000 });
  // Wait until profitEngine.init finishes its async API load + render.
  await expect(margin).not.toHaveText('€0.00', { timeout: 15_000 });

  const domText = (await margin.innerText()).trim();
  // Parse € amount from DOM and compare numerically (catches locale
  // rounding surprises). Assert exact-string too so a format change is
  // caught explicitly.
  const domNum = parseFloat(domText.replace(/[^0-9.\-]/g, '')) || 0;
  expect(domNum, 'rendered margin should equal sum of API profits').toBeCloseTo(expected, 2);
  expect(domText).toBe(expectedText);
  await ctx.dispose();
});
