# Interwall E2E Harness

Playwright harness for proving UI correctness against a live stack.

## Prerequisites

The app stack must be up at http://localhost:1441. Start via
`docker compose up -d` from the repo root if needed.

## Install

    cd inventory-interwall/e2e
    npm install
    npx playwright install chromium

## Run

    npm test

HTML report is written to `playwright-report/` (gitignored). Traces
for failed tests are retained.

## Projects

Tests run under two projects:

- `unauth` — smoke tests that exercise the public surface (app loads,
  health endpoint). No session.
- `authenticated` — feature-truth specs that need a logged-in session.
  Uses a `storageState` produced once per run by the auth fixture.

## Authenticated tests

`fixtures/auth.ts` runs as `globalSetup` before the suite. It POSTs
credentials to `/api/auth/login`, captures the session cookie, and
writes the resulting storageState to `.auth/state.json` (gitignored).
The `authenticated` project then loads that file so every spec starts
already logged in.

Credentials come from environment variables:

    INTERWALL_E2E_USER=<username> INTERWALL_E2E_PASS=<password> \
      npx playwright test

On the default seeded stack (see `apps/api/sql/init.sql`), the test
user is `admin` / `admin123`. In any shared or production-facing
environment use a dedicated non-privileged test account — never
commit credentials and never hardcode them in specs.

If the env vars are not set, global setup writes an empty storage
state and logs a warning; authenticated specs will hit 401 and fail
their assertions. Running only the smoke project still works:

    npx playwright test --project=unauth

## Adding a truth spec

1. Drop a new `*-truth.spec.ts` file in `tests/`.
2. Add its filename to the `authenticated` project's `testMatch`
   regex in `playwright.config.ts`.
3. Follow the "DOM vs canonical" pattern: fetch the API truth via a
   `request` context (reusing `context.storageState()` so the API
   call is authenticated with the same session), navigate to the view
   that renders the value, read the rendered text from the DOM, assert
   equality. Skip with a clear message only when the stack genuinely
   has no data to compare (e.g. zero seeded transactions).

Tests run serially (`workers: 1`) against shared stack state — avoid
mutating DB state from a spec. Read-only truth checks are the norm.

This package is independent of the frontend bundle — do not import
from `../frontend`.
