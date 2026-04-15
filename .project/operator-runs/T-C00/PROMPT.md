You are the operator for Interwall in `/Users/ottogen/interwall` on
branch `v2`.

Read only:
- `CLAUDE.md`
- `.project/operator-runs/T-C00/PLAN.md`

Then execute exactly `T-C00` as defined in the packet.

Rules:
- stay in `/Users/ottogen/interwall`
- stay on branch `v2`
- do not read broad planning docs unless the packet explicitly tells you
- do not expand scope beyond this audit refresh
- do not edit product code
- do not commit

Your allowed edits are only:
- `.project/C00-UI-STATE-AUDIT.md`
- `.project/operator-runs/T-C00/REPORT.yaml`

Required output:
- refresh `.project/C00-UI-STATE-AUDIT.md` against current branch truth
- write your file-based report to
  `.project/operator-runs/T-C00/REPORT.yaml`

Stop after the report file is written.
