import { test, expect, request } from '@playwright/test';
import { STATE_PATH, performLogin, hasAuthState } from '../fixtures/auth';

/**
 * T-C06 / D-043 — Batches view truth test.
 *
 * Load #batches. Pick one active-batch card. Read its remaining-qty DOM value.
 * Assert it equals the canonical value returned by GET /api/stock-lots for
 * that lot id.
 *
 * This spec lives outside the default `authenticated` testMatch, so it
 * primes the storage state itself via performLogin() and then applies it
 * via test.use().
 */

test.describe('batches view truth', () => {
  test.use({ storageState: STATE_PATH });

  test.beforeAll(async () => {
    // Ensure a storage state file exists on disk; performLogin is idempotent.
    if (!hasAuthState()) {
      await performLogin();
    }
  });

  test('#batches remaining-qty matches /api/stock-lots', async ({ page, baseURL, context }) => {
    const ctx = await request.newContext({ baseURL, storageState: await context.storageState() });
    const lotsResp = await ctx.get('/api/stock-lots');
    expect(lotsResp.status(), 'GET /api/stock-lots should succeed').toBe(200);
    const lots: Array<{ id: string; quantity: number }> = await lotsResp.json();
    if (!Array.isArray(lots) || lots.length === 0) {
      await ctx.dispose();
      test.skip(true, 'no active stock lots seeded in stack');
      return;
    }

    await page.goto('/#batches');

    const firstCard = page.locator('.batch-card[data-batch-id]').first();
    await firstCard.waitFor({ state: 'visible', timeout: 15_000 });

    const lotId = await firstCard.getAttribute('data-batch-id');
    expect(lotId, 'card must expose data-batch-id').toBeTruthy();

    const canonical = lots.find(l => String(l.id) === String(lotId));
    expect(canonical, `lot ${lotId} should be present in /api/stock-lots`).toBeTruthy();

    const remainingText = (
      await firstCard.locator('.batch-metric-value').first().innerText()
    ).trim();
    const domQty = parseFloat(remainingText.replace(/[^0-9.\-]/g, '')) || 0;

    expect(
      domQty,
      `DOM remaining qty for lot ${lotId} should equal canonical quantity`
    ).toBe(Number(canonical!.quantity));

    await ctx.dispose();
  });
});
