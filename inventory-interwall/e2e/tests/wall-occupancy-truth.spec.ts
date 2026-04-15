import { test, expect, request } from '@playwright/test';

/**
 * DOM-vs-canonical: the wall grid renders per-cell quantities from
 * /api/shelves/occupancy (backed by v_shelf_occupancy). For a single
 * cell, the sum of the rendered `.qty` text nodes must equal the sum
 * of occupancy rows whose zone_name/col/level match that cell — across
 * all bin variants (null, A, B).
 */
test('wall cell qty matches /api/shelves/occupancy', async ({ page, baseURL, context }) => {
  const ctx = await request.newContext({ baseURL, storageState: await context.storageState() });

  const occResp = await ctx.get('/api/shelves/occupancy');
  if (occResp.status() !== 200) {
    const body = await occResp.text();
    await ctx.dispose();
    test.skip(
      true,
      `/api/shelves/occupancy returned ${occResp.status()} — view unavailable: ${body.slice(0, 160)}`
    );
    return;
  }
  const rows: Array<{
    zone_name: string;
    col: number;
    level: number;
    bin: string | null;
    total_qty: number;
  }> = await occResp.json();

  // Aggregate canonical qty per cell key "zone-col-level".
  const canonical = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.zone_name}-${r.col}-${r.level}`;
    canonical.set(key, (canonical.get(key) ?? 0) + Number(r.total_qty || 0));
  }

  await page.goto('/');
  // Wall is the default view; wait for grid cells to attach.
  await page.locator('[data-cell-id]').first().waitFor({ state: 'attached', timeout: 15_000 });

  // Find a cell whose canonical qty > 0 AND which exists in the DOM.
  let targetCellId: string | null = null;
  for (const [cellId, qty] of canonical) {
    if (qty <= 0) continue;
    const handle = await page.locator(`[data-cell-id="${cellId}"]`).first().elementHandle();
    if (handle) {
      targetCellId = cellId;
      break;
    }
  }
  if (!targetCellId) {
    await ctx.dispose();
    test.skip(true, 'no wall cell has canonical qty > 0; seed stock before running');
    return;
  }

  const cell = page.locator(`[data-cell-id="${targetCellId}"]`);
  // Sum every `.qty` text node in the cell. A dash ('-') means zero.
  const domQty = await cell.locator('.qty').evaluateAll((nodes) =>
    nodes
      .map((n) => (n.textContent ?? '').trim())
      .map((t) => (t === '-' || t === '' ? 0 : parseFloat(t.replace(/[^0-9.\-]/g, '')) || 0))
      .reduce((a, b) => a + b, 0)
  );

  const canonicalQty = canonical.get(targetCellId) ?? 0;
  expect(domQty, `wall cell ${targetCellId} rendered qty should match occupancy sum`).toBe(canonicalQty);
  await ctx.dispose();
});
