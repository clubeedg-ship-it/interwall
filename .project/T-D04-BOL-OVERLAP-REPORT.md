# T-D04 Bol.com Ingestion Overlap Report

- Generated at: 2026-04-16T10:39:22.912605+00:00
- Reliability objective: zero email-only orders, zero API-only orders, and zero quantity/value mismatches inside the comparison window.
- Comparison window analyzed: 2026-04-16T05:20:58.443818+00:00 to 2026-04-16T10:21:21.612430+00:00 (50 distinct orders; gate 50-order threshold hit first)
- Distinct Bol.com orders observed in window: 50
- Orders seen by email only: 49
- Orders seen by API only: 1
- Orders seen by both: 0
- Timing differences: not derivable (no orders seen by both paths in the comparison window).
- Field mismatches: not derivable (no orders seen by both paths in the comparison window).
- Exit decision: not ready to close `T-D04`.
- Remaining gate: zero missed orders is not yet satisfied; all orders in the comparison window must appear on both paths.
