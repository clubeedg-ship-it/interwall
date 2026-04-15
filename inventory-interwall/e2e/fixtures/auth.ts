import { test as base, request, type FullConfig } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const STATE_PATH = join(__dirname, '..', '.auth', 'state.json');
export const BASE_URL = 'http://localhost:1441';

export async function performLogin(): Promise<void> {
  const username = process.env.INTERWALL_E2E_USER;
  const password = process.env.INTERWALL_E2E_PASS;

  mkdirSync(dirname(STATE_PATH), { recursive: true });

  if (!username || !password) {
    writeFileSync(STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    console.warn(
      '[auth] INTERWALL_E2E_USER / INTERWALL_E2E_PASS not set. ' +
        'Authenticated specs will see 401 and skip. ' +
        'Set both env vars to exercise the authenticated project.'
    );
    return;
  }

  const ctx = await request.newContext({ baseURL: BASE_URL });
  const resp = await ctx.post('/api/auth/login', {
    form: { username, password },
  });
  if (!resp.ok()) {
    const body = await resp.text();
    await ctx.dispose();
    throw new Error(
      `[auth] login POST /api/auth/login failed: ${resp.status()} ${body}`
    );
  }
  // Persist the session cookie to storageState for reuse across specs.
  await ctx.storageState({ path: STATE_PATH });
  await ctx.dispose();
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await performLogin();
}

// Re-export a `test` object for specs that want to import from the fixture.
// The storageState is applied via the "authenticated" project in
// playwright.config.ts, so importing from here is semantically equivalent
// to importing from '@playwright/test' — it just documents intent.
export const test = base;
export { expect } from '@playwright/test';

export function hasAuthState(): boolean {
  return existsSync(STATE_PATH);
}
