import { test, expect, request } from '@playwright/test';

test('app loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Interwall/i);
  const nav = page.locator('aside.sidebar, nav.sidebar-nav').first();
  await expect(nav).toBeAttached();
});

test('health endpoint reachable', async ({ baseURL }) => {
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.get('/api/health/ping');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('status');
  await ctx.dispose();
});
