You are the operator for Interwall in `/Users/ottogen/interwall` on
branch `v2`.

Read only:
- `CLAUDE.md`
- `.project/operator-runs/T-C02c/PLAN.md`

Then execute exactly `T-C02c` as defined in the packet.

Rules:
- stay in `/Users/ottogen/interwall`
- stay on branch `v2`
- do not read broad planning docs unless the packet explicitly tells you
- do not expand scope beyond this handshake slice
- do not edit backend code
- do not commit

Your allowed edits are only:
- `inventory-interwall/frontend/api.js`
- `inventory-interwall/frontend/handshake.js`
- `inventory-interwall/frontend/catalog-detail.js`
- `inventory-interwall/frontend/t_c02c_handshake_verify.mjs`
- `.project/operator-runs/T-C02c/REPORT.yaml`

Required output:
- land the scoped `T-C02c` handshake cleanup
- write your file-based report to
  `.project/operator-runs/T-C02c/REPORT.yaml`

Stop after the report file is written.
