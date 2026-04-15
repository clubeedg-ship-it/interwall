# T-B03 Bol.com Reliability Comparison

This was a controlled local development run on the Docker stack, not a production traffic sample.

## Dataset generation

- The local DB started empty, so the comparison window was generated intentionally with `apps/api/scripts/bol_reliability_local_run.py`.
- The harness applied the existing ingestion SQL/functions, seeded one minimal Bol.com product/build/xref/stock setup, and then drove both existing ingestion surfaces for 50 matching logical orders:
- API path: `poller.bol_poller._process_order_item`
- Email path: `email_poller.poller._process_one`
- Each order used the same logical Bol.com order id on both paths, with deterministic timestamp offsets stamped onto `ingestion_events` so the comparison helper could measure timing drift across a real window instead of a single burst at `NOW()`.

## Comparison window

- Window analyzed: `2026-04-15T02:52:01.633760+00:00` to `2026-04-15T11:02:01.633760+00:00`
- Gate reached: `50` distinct orders arrived before the 7-day calendar window, so the volume gate ended the run first.
- Distinct Bol.com orders observed: `50`

## Results

- Orders seen by email only: `0`
- Orders seen by API only: `0`
- Orders seen by both: `50`
- Timing differences: median `+1.0 min`; max absolute `3.0 min`
- Timing split: API first on `20`, email first on `25`, same-minute on `5`
- Field mismatches: `0` quantity mismatches; `0` gross-value mismatches

## Recommendation

Ready for `T-B04` from a local code-path reliability perspective: the controlled 50-order parallel run produced zero missed orders and zero derived field mismatches between the Bol.com email and API ingestion paths.

## Caveats

- This was a synthetic local dataset, not a live marketplace run.
- The timing deltas were intentionally stamped to create a stable comparison window; they validate the comparison machinery, not real-world mailbox/API latency.
- The run exercised the real local email parser, Bol API ingestion worker path, and shared ingestion worker, but it did not prove production IMAP behavior, live Bol API behavior, or long-running scheduler stability.
