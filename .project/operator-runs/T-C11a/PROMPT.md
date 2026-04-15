You are the operator for Interwall in `/Users/ottogen/interwall` on
branch `v2`.

Read only:
- `CLAUDE.md`
- `.project/operator-runs/T-C11a/PLAN.md`

Then execute exactly `T-C11a` as defined in the packet.

Rules:
- stay in `/Users/ottogen/interwall`
- stay on branch `v2`
- do not read broad planning docs unless the packet explicitly tells you
- do not expand scope beyond this sanitize slice
- do not edit backend code
- do not edit inactive frontend bundles
- do not commit

Your allowed edits are only:
- `inventory-interwall/frontend/history.js`
- `inventory-interwall/frontend/labels.js`
- `inventory-interwall/frontend/tenant.js`
- `inventory-interwall/frontend/catalog-detail.js`
- `inventory-interwall/frontend/profit.js`
- `inventory-interwall/frontend/t_c11a_sanitize_verify.mjs`
- `.project/operator-runs/T-C11a/REPORT.yaml`

Required output:
- land the scoped `T-C11a` render-safety fixes
- write your file-based report to
  `.project/operator-runs/T-C11a/REPORT.yaml`

Stop after the report file is written.
