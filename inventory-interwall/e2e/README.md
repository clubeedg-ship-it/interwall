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

## Add a spec

Drop a new `*.spec.ts` file in `tests/`. Keep tests serial
(the stack is shared state — `workers: 1`). Follow the pattern in
`parts-stock-truth.spec.ts` for "DOM vs canonical" checks: fetch the
API truth via a request context, read the rendered value from the
DOM, assert equality.

This package is independent of the frontend bundle — do not import
from `../frontend`.
