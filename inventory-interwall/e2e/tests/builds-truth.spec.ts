import { test, expect, request } from '@playwright/test';
import { STATE_PATH, performLogin, hasAuthState } from '../fixtures/auth';

/**
 * T-C08 — Builds view truth test.
 *
 * Navigate to #builds. Verify the page loads and shows builds from the API.
 * If builds exist, open the workspace and verify the Models library loads.
 */

test.describe('builds view truth', () => {
  test.use({ storageState: STATE_PATH });

  test.beforeAll(async () => {
    if (!hasAuthState()) {
      await performLogin();
    }
  });

  test('#builds page loads and lists builds from API', async ({ page, baseURL, context }) => {
    const ctx = await request.newContext({ baseURL, storageState: await context.storageState() });

    // Verify API is accessible
    const buildsResp = await ctx.get('/api/builds');
    expect(buildsResp.status(), 'GET /api/builds should succeed').toBe(200);
    const buildsData = await buildsResp.json();
    const builds = buildsData.items || [];

    const modelsResp = await ctx.get('/api/item-groups');
    expect(modelsResp.status(), 'GET /api/item-groups should succeed').toBe(200);

    await ctx.dispose();

    // Navigate to builds view
    await page.goto('/#builds');
    await page.waitForTimeout(1500);

    // Verify the page title is set
    const viewTitle = page.locator('#viewTitle');
    await expect(viewTitle).toHaveText('Builds');

    // Verify builds section exists
    const buildsList = page.locator('#builds-list');
    await expect(buildsList).toBeVisible({ timeout: 10_000 });

    // Verify New Build button
    const newBuildBtn = page.locator('#builds-new-btn');
    await expect(newBuildBtn).toBeVisible();

    if (builds.length === 0) {
      // Empty state
      const emptyMsg = page.locator('.builds-empty');
      await expect(emptyMsg).toBeVisible();
    } else {
      // Cards should render
      const firstCard = page.locator('.builds-card').first();
      await firstCard.waitFor({ state: 'visible', timeout: 10_000 });
      const codeEl = firstCard.locator('.builds-card-code');
      await expect(codeEl).not.toBeEmpty();
    }

    // Open workspace via New Build
    await newBuildBtn.click();
    const workspace = page.locator('#builds-workspace');
    await expect(workspace).toBeVisible({ timeout: 5_000 });

    // Verify workspace has key elements
    await expect(page.locator('#ws-build-code')).toBeVisible();
    await expect(page.locator('#ws-composition')).toBeVisible();
    await expect(page.locator('#ws-models-list')).toBeVisible();

    // Close workspace
    await page.locator('#builds-workspace .modal-close').click();
    await expect(workspace).not.toBeVisible({ timeout: 3_000 });
  });
});
