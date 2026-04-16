You are the operator for Interwall in `/Users/ottogen/interwall` on
branch `v2`.

Read only:
- `CLAUDE.md`
- `.project/operator-runs/T-C08/PLAN.md`

Then execute exactly `T-C08` as defined in the packet.

Rules:
- stay in `/Users/ottogen/interwall`
- stay on branch `v2`
- do not read broad planning docs unless the packet explicitly tells you
- do not expand scope beyond this Builds frontend packet
- do not edit backend code
- do not edit `inventory-interwall/frontend/compositions.js`
- do not commit

Your allowed edits are only:
- `inventory-interwall/frontend/index.html`
- `inventory-interwall/frontend/style.css`
- `inventory-interwall/frontend/router.js`
- `inventory-interwall/frontend/app-init.js`
- `inventory-interwall/frontend/api.js`
- `inventory-interwall/frontend/builds.js`
- `inventory-interwall/frontend/t_c08_builds_verify.mjs`
- `inventory-interwall/e2e/playwright.config.ts`
- `inventory-interwall/e2e/tests/builds-truth.spec.ts`
- `.project/operator-runs/T-C08/REPORT.yaml`

Required output:
- land the scoped `Builds` frontend implementation around the V2
  floating-workspace wireframe
- use real `/api/builds`, `/api/item-groups`, and
  `/api/external-xref` data surfaces
- keep pricing controls UI-only
- write your file-based report to
  `.project/operator-runs/T-C08/REPORT.yaml`

Stop after the report file is written.
