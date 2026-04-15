# Interwall — UI Component Catalog

STATUS: STUB. Populated during T-C00 (UI state audit), before any
C-stream primer references it.

Purpose: define the 6-8 canonical component types in the vanilla JS
SPA so that C-stream primers can reference components by name instead
of by file path. Prevents the "which file owns this behavior" problem
that partially drove the UI rebuild.

Expected content after T-C00:
- Component name
- Files that implement it
- Data contract (what DB view or endpoint feeds it)
- Allowed state (what may live client-side — should be near-zero per D-040)
- Sanitization surface (which inputs route through sanitize())
- Test path (Playwright spec location)

Do not populate this file before T-C00. The audit produces the list.
