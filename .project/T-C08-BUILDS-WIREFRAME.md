# T-C08 Builds Page Wireframe

## Page goal
- Give an operator one place to create, edit, and review `Builds` using component lines sourced from `Models`.
- Let the operator answer, at a glance, "do I have this build configured on X?" from the build detail view via marketplace `SKU mapping` status.
- Preserve the current Interwall SPA pattern used by `EAN Compositions`: dense page header, stacked card sections, muted helper copy, compact tables, and inline status badges.

## Top-level layout
- Keep the existing left nav + header shell unchanged. Page title in header: `Builds`.
- Main content stays single-page and vertically stacked, matching Compositions rather than introducing a new split app shell.
- Page body order:
  1. Page header with title, one-sentence helper text
  2. Build editor card stack
  3. Saved Builds list section below the editor
- Build editor uses a stepped card flow:
  1. `Build`
  2. `Components`
  3. `Save`
- When a build is loaded or created, show a compact detail sub-nav inside the editor:
  - `Components`
  - `SKU mappings`

## Desktop wireframe
```text
+----------------------------------------------------------------------------------+
| Builds                                                                           |
| Create and maintain build_code records and verify marketplace SKU mapping        |
| coverage before operators rely on them.                                          |
+----------------------------------------------------------------------------------+

+----------------------------------------------------------------------------------+
| [1] Build                                                                        |
| Choose or define the build identity before editing its details.                  |
|                                                                                  |
| [ build_code................. ] [ Build name / note.............. ] [ Next ]     |
|                                                                                  |
| After load:                                                                      |
| +------------------------------------------------------------------------------+ |
| | build_code: BLD-100245      Build name: TV wall bundle 55"                  | |
| | Mapping status: [bol.com Missing] [mediamarkt Mapped] [boulanger Missing]   | |
| |                [manual Mapped]                                               | |
| +------------------------------------------------------------------------------+ |
+----------------------------------------------------------------------------------+

+----------------------------------------------------------------------------------+
| [2] Build detail                                                                 |
| [ Components ] [ SKU mappings ]                                                  |
|                                                                                  |
| Components tab                                                                   |
| +------------------------------------------------------------------------------+ |
| | Model search / picker drives each row                                         | |
| |------------------------------------------------------------------------------| |
| | Model                          Qty      Notes / resolved label        [x]     | |
| | [ Type model name or code... ] [ 1 ]   Samsung 55 panel              [x]     | |
| | [ Type model name or code... ] [ 2 ]   Mount bracket set             [x]     | |
| |------------------------------------------------------------------------------| |
| | [+ Add Model]                                                                 | |
| +------------------------------------------------------------------------------+ |
|                                                                                  |
| SKU mappings tab                                                                 |
| +------------------------------------------------------------------------------+ |
| | Marketplace      Status        External SKU / mapping                 Action  | |
| | bol.com          Missing       No mapping configured                  [Edit]  | |
| | mediamarkt       Mapped        MM-INT-BLD-100245                      [Edit]  | |
| | boulanger        Missing       No mapping configured                  [Edit]  | |
| | manual           Mapped        TV-BUNDLE-55                           [Edit]  | |
| +------------------------------------------------------------------------------+ |
| Missing rows use the existing warning/critical badge treatment.                  |
+----------------------------------------------------------------------------------+

+----------------------------------------------------------------------------------+
| [3] Save                                                                         |
| Store the build and its current component lines.                                 |
|                                                          [Cancel] [Save Build]   |
+----------------------------------------------------------------------------------+

+----------------------------------------------------------------------------------+
| Saved Builds                                                                     |
| [ search build_code / name................................. ]                    |
|                                                                                  |
| +------------------------------------------------------------------------------+ |
| | BLD-100245   TV wall bundle 55"      2 Models     2/4 mapped marketplaces   | |
| | Quick status: [Attention] missing bol.com, boulanger                         | |
| |                                                                   [Edit]     | |
| +------------------------------------------------------------------------------+ |
| +------------------------------------------------------------------------------+ |
| | BLD-100246   Soundbar bundle         3 Models     4/4 mapped marketplaces   | |
| | Quick status: [All clear]                                                    | |
| |                                                                   [Edit]     | |
| +------------------------------------------------------------------------------+ |
+----------------------------------------------------------------------------------+
```

## Mobile wireframe
```text
+----------------------------------------------+
| Builds                                       |
| Create and review build setup.               |
+----------------------------------------------+

+----------------------------------------------+
| [1] Build                                    |
| [ build_code................. ]              |
| [ Build name / note.......... ]              |
| [ Next ]                                     |
|                                              |
| build_code: BLD-100245                       |
| [bol.com Missing] [mediamarkt Mapped]        |
| [boulanger Missing] [manual Mapped]          |
+----------------------------------------------+

+----------------------------------------------+
| [ Components ] [ SKU mappings ]              |
+----------------------------------------------+

+----------------------------------------------+
| Components                                   |
| [ Type model name or code........ ]          |
| [ Qty ] [ 1 ]                                |
| Resolved: Samsung 55 panel              [x]  |
|----------------------------------------------|
| [ Type model name or code........ ]          |
| [ Qty ] [ 2 ]                                |
| Resolved: Mount bracket set             [x]  |
|----------------------------------------------|
| [+ Add Model]                                |
+----------------------------------------------+

+----------------------------------------------+
| SKU mappings                                 |
| bol.com                                      |
| [Missing] No mapping configured        [Edit]|
|----------------------------------------------|
| mediamarkt                                   |
| [Mapped] MM-INT-BLD-100245             [Edit]|
|----------------------------------------------|
| boulanger                                    |
| [Missing] No mapping configured        [Edit]|
|----------------------------------------------|
| manual                                       |
| [Mapped] TV-BUNDLE-55                  [Edit]|
+----------------------------------------------+

+----------------------------------------------+
| [Cancel]                     [Save Build]    |
+----------------------------------------------+

+----------------------------------------------+
| Saved Builds                                 |
| [ search................................. ]  |
| BLD-100245                                  |
| TV wall bundle 55"                          |
| 2 Models · 2/4 mapped                       |
| [Attention] bol.com, boulanger missing      |
| [Edit]                                      |
+----------------------------------------------+
```

## Primary states
- Empty/new: step 1 active, detail tabs hidden, component area disabled with helper text.
- Existing build loaded: build summary card shown, detail tabs enabled, saved list remains below.
- Components empty: show inline empty row text, `No Models added yet. Click "+ Add Model" to start.`
- SKU mappings healthy: all marketplaces show mapped badge; summary chips read as all clear.
- SKU mappings incomplete: any missing marketplace shows warning/critical badge and plain text `Missing`.
- Saved list empty: `No Builds saved yet.`
- Load/save error: inline card-level error message inside the affected section; do not use modal-only feedback.

## Key components
- Page header: same title/subtitle treatment as Compositions.
- Step cards: same compact stacked card pattern and numbering used in Compositions.
- Build identity row: `build_code`, optional descriptive label, primary action.
- Build summary strip: monospace `build_code`, descriptive text, marketplace status chips.
- Detail sub-nav: two simple in-card tabs, not route-level navigation.
- Components table/list: searchable `Models` picker per row, quantity field, remove action, add-row action.
- SKU mappings table/list: marketplace, status badge, mapped external SKU value or missing text, edit action.
- Saved Builds list: compact list cards with counts and mapping coverage summary.

## Interaction notes
- Clicking `Edit` from the saved list loads that build into the editor and scrolls the page to the top of the Builds view, matching current Compositions behavior.
- `Components` is the default active detail tab after a build is loaded; `SKU mappings` is secondary but always available once the build exists in context.
- Missing marketplace mappings must be visible in two places:
  - build summary strip near the top
  - dedicated `SKU mappings` tab rows
- Status wording should stay operational and direct:
  - `Mapped`
  - `Missing`
  - `All clear`
  - `Attention`
- Use existing Interwall compact badge language and table density; no new visual metaphors, drawers, or full-screen editors.
- Mobile keeps the same content order as desktop; tables collapse into stacked cards/rows, not sideways-only layouts.
- This wireframe is UI-only and does not imply API, validation, or product-logic changes.
