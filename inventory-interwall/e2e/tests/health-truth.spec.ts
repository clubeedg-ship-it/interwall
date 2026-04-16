import { test, expect, request } from '@playwright/test';

test('health page renders sections and matches /api/health orphan count', async ({ page, baseURL, context }) => {
  const ctx = await request.newContext({ baseURL, storageState: await context.storageState() });

  const healthResp = await ctx.get('/api/health');
  expect(healthResp.status(), 'GET /api/health should succeed with auth').toBe(200);
  const health = await healthResp.json() as {
    orphans?: { parts_without_shelf?: number };
  };

  await page.goto('/#health');

  await expect(page.locator('#healthIngestionSection')).toBeVisible();
  await expect(page.locator('#healthDeadLetterSection')).toBeVisible();
  await expect(page.locator('#healthInvariantsSection')).toBeVisible();
  await expect(page.locator('#healthOrphansSection')).toBeVisible();

  const badge = page.locator('[data-health-orphan="parts-without-shelf"] [data-health-badge="count"]').first();
  await expect(badge).toBeVisible({ timeout: 15_000 });
  const domCount = parseInt((await badge.innerText()).trim(), 10);
  const apiCount = Number(health?.orphans?.parts_without_shelf) || 0;

  expect(domCount, 'Parts-without-shelf count should match /api/health').toBe(apiCount);
  await ctx.dispose();
});
