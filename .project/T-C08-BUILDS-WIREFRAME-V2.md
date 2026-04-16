# T-C08 Builds Page Wireframe V2

## Concept summary
- This variant keeps the existing Interwall sidebar + header shell, but treats add/manage Build as a focused in-page workspace that opens as a centered, squared floating popup over the normal Builds page.
- The popup is not a generic modal. It behaves like a calm operations canvas: left rail for Build context, center rail for the active selected Build composition, right rail for searchable candidate entries sourced from `Models`.
- Visual language stays Interwall: dense cards, muted helper text, restrained accent color, compact badges, thin borders, and operational wording. The only atmospheric flourish is a very quiet page-dim + soft orb blur behind the floating workspace.
- The center floating container is the primary object on screen. It should feel like “the currently selected Build” is physically lifted above the list and ready to edit.
- The right rail is explicitly a `Models` library, not a stock-only availability tray. Operators choose component lines from `Models/item_groups`, then add them into the selected Build composition.
- Pricing controls live in the top-right zone of the workspace as guided widgets for aggregated values: fixed overhead, commission %, and formula-builder chips/tokens. Default UX is assisted composition, not raw code typing.
- `SKU mapping` visibility remains first-class. Missing mapping signals per marketplace stay visible in both summary and detail states so operators can answer “is this Build ready for marketplace use?” without leaving the workspace.

## Spatial model

### Base page layer
- Standard Interwall `Builds` page remains visible underneath with page title, one-line helper copy, search, and saved Build cards.
- Clicking `New Build` or `Manage` on an existing card fades the page into a subdued inactive layer.
- Background blur is light and centered behind the workspace; avoid dramatic glow, color bloom, or deep translucency that would break readability.

### Floating workspace layer
- Centered on desktop, nearly full-height but clearly inset from viewport edges.
- Squared geometry: 16-20px radius maximum, stronger than a normal card but less rounded than current modals.
- Three internal zones:
  1. Left context rail: Build identity, saved Build switching, mapping health summary
  2. Center active Build box: selected composition, reorder/remove/edit quantities, save actions
  3. Right utility rail: `Models` library plus top-right pricing-control widgets
- The central box is visually the most elevated surface. Side rails are quieter and slightly recessed.

### Motion / transition contract
- Open: page fades down 10-15%, workspace scales from 98% to 100% and slides upward 8-12px.
- Close: reverse of open, under 180ms.
- Add-from-library: selected card on right briefly highlights, then lands as a new row in the center box with a short slide/fade.
- Avoid bouncy motion. This is operations UI, not consumer UI.

## Desktop ASCII wireframe
```text
+------------------------------------------------------------------------------------------------------+
| Builds                                                                                 [New Build]  |
| Create, review, and complete Build setup using Models, pricing controls, and marketplace SKU mapping |
+------------------------------------------------------------------------------------------------------+
| Search builds / build_code ....................................................... [Attention only] |
|                                                                                                      |
|  BLD-100245  TV wall bundle 55"     2 Models   [bol Missing] [mediamarkt Mapped] [boulanger Missing]|
|  BLD-100246  Soundbar bundle        3 Models   [All clear]                                           |
|                                                                                                      |
|  Page stays visible but subdued when workspace opens.                                               |
+------------------------------------------------------------------------------------------------------+

                             ::::: quiet dim + faint orb/blur behind workspace ::::

        +------------------------------------------------------------------------------------------+
        | Builds workspace                                                          [Close]        |
        | Editing BLD-100245                                                         Smooth in-page |
        +--------------------------+----------------------------------+----------------------------+
        | LEFT CONTEXT RAIL        | CENTER SELECTED-BUILD BOX       | RIGHT UTILITY RAIL         |
        |--------------------------|----------------------------------|----------------------------|
        | Build                    | BLD-100245                       | Pricing controls           |
        | [ build_code.......... ] | TV wall bundle 55"               | [ Fixed overhead  € 12.50] |
        | [ Internal note....... ] | Active composition               | [ Commission      12.0 % ] |
        |                          |----------------------------------| Formula builder            |
        | Mapping readiness        | Lines added from Models          | [ + subtotal ] [ + VAT ]  |
        | [bol     Missing     ! ] |                                  | [ + fee ] [ + overhead ]  |
        | [mediamarkt Mapped    ] | 1. Samsung 55 panel              | [ Multiply ] [ Percent ]  |
        | [boulanger Missing  ! ] |    Model: OLED-55-GEN4           | Formula preview           |
        | [manual   Mapped      ] |    Qty [ 2 ]     [Remove]        | ((subtotal+overhead)      |
        |                          |----------------------------------|  * commission%) + VAT     |
        | Saved Builds             | 2. Mount bracket set             | [Guided mode] [Raw text]  |
        | [Search current list.. ] |    Model: BRACKET-SET-L         |                            |
        |                          |    Qty [ 1 ]     [Remove]        | Models library            |
        | > BLD-100245             |----------------------------------| [Search Models......... ] |
        |   TV wall bundle 55"     |                                  | [Filter: brand v]         |
        |   2/4 mappings complete  | [ Drop zone / add area ]         |----------------------------|
        |                          | Add a Model from the right rail  | [Card] OLED-55-GEN4       |
        |   BLD-100246             | or click an existing line to     | Samsung 55 panel          |
        |   Soundbar bundle        | adjust quantity.                 | Members: 4 Parts          |
        |   4/4 mappings complete  |                                  | Used in 6 Builds          |
        |                          | SKU mapping strip                | [Add to Build]            |
        | Health cues              | [bol Missing] [mediamarkt OK]    |----------------------------|
        | Missing mappings are     | [boulanger Missing] [manual OK]  | [Card] BRACKET-SET-L      |
        | always shown here even   |                                  | Mount bracket set         |
        | if pricing tab is active.| Footer actions                   | Members: 2 Parts          |
        |                          | [Cancel] [Save draft] [Save Build]| [Add to Build]            |
        +--------------------------+----------------------------------+----------------------------+
```

## Mobile ASCII wireframe
```text
+-----------------------------------------------+
| Builds                            [New Build] |
| Manage Build setup and mapping readiness.     |
+-----------------------------------------------+
| Search builds...............................   |
| BLD-100245  [Attention]                       |
| TV wall bundle 55"                            |
| 2 Models · bol + boulanger missing            |
+-----------------------------------------------+

        +---------------------------------------+
        | Builds workspace               [Close]|
        +---------------------------------------+
        | BLD-100245                            |
        | TV wall bundle 55"                    |
        | [Mappings 2/4] [Pricing ready]        |
        +---------------------------------------+
        | Tabs: [Build] [Composition] [Models]  |
        |       [Pricing] [SKU mapping]         |
        +---------------------------------------+

        | Composition                           |
        | 1. Samsung 55 panel                   |
        | Model: OLED-55-GEN4                   |
        | Qty [ 2 ]                    [Remove] |
        |---------------------------------------|
        | 2. Mount bracket set                  |
        | Model: BRACKET-SET-L                  |
        | Qty [ 1 ]                    [Remove] |
        |---------------------------------------|
        | Add from Models tab                   |
        +---------------------------------------+

        | Models                                |
        | [Search Models......................] |
        | [Card] OLED-55-GEN4                   |
        | Samsung 55 panel                      |
        | Members: 4 Parts                      |
        | [Add to Build]                        |
        |---------------------------------------|
        | [Card] BRACKET-SET-L                  |
        | Mount bracket set                     |
        | Members: 2 Parts                      |
        | [Add to Build]                        |
        +---------------------------------------+

        | Pricing                               |
        | Fixed overhead [ € 12.50 ]            |
        | Commission     [ 12.0 % ]             |
        | Tokens: [subtotal] [VAT] [fee]        |
        | Ops:    [+] [×] [%]                   |
        | Preview: ((subtotal+overhead)... )    |
        +---------------------------------------+

        | SKU mapping                           |
        | bol.com        [Missing]      [Edit]  |
        | mediamarkt     [Mapped]       [Edit]  |
        | boulanger      [Missing]      [Edit]  |
        | manual         [Mapped]       [Edit]  |
        +---------------------------------------+

        | [Cancel]           [Save draft]       |
        |                      [Save Build]     |
        +---------------------------------------+
```

## Panel responsibilities

### Left context rail
- Anchors the operator in the current `Builds` workflow.
- Holds `build_code`, short descriptive name/note, and a compact saved-Build switcher.
- Shows persistent marketplace `SKU mapping` readiness chips for each marketplace, including explicit missing-state markers.
- Surfaces “attention” summary before the operator saves, so missing mappings are never hidden behind a secondary tab.

### Center selected-Build box
- Owns the active Build composition.
- Displays selected `Models` as line items with quantity, resolved model label, and remove action.
- Serves as the destination area when the operator clicks `Add to Build` on the right.
- Keeps the final save actions physically attached to the composition so the operator understands this center box is the thing being edited and committed.

### Right utility rail
- Top area is pricing control, not code editor.
- Fixed overhead and commission widgets are compact numeric controls with helper labels, designed like Interwall settings inputs rather than finance software.
- Guided formula composition uses token chips and simple operators first, with optional raw text fallback tucked behind a secondary mode switch.
- Lower area is the searchable selectable `Models` library. Every candidate card represents a `Model/item_group`, with enough metadata to help selection without becoming a full detail drawer.

## States
- Closed/default page: standard Builds list in normal page context.
- Workspace opening: page dims, floating squared workspace enters smoothly, existing selected Build preloads if launched from `Manage`.
- New Build empty: center composition shows instructional empty state, right rail library becomes the primary call to action.
- Existing Build loaded: center shows composition rows, left rail shows mapping health, right rail remains available for additions.
- `SKU mapping` healthy: all marketplace chips show mapped/ready styling and summary reads `All clear`.
- `SKU mapping` incomplete: one or more marketplaces show `Missing` with warning badge and subtle icon marker; summary reads `Attention needed`.
- Models search empty: right rail shows `No Models match this search`.
- Composition empty after removals: center box returns to `Select a Model from the right rail to start this Build`.
- Pricing formula incomplete: guided builder area shows a muted warning summary, but remains readable and non-blocking in layout.
- Save in progress: footer actions disable, center box keeps visible content to avoid disorientation.
- Save error: inline banner appears at top of center box, not as a detached toast only.

## Interactions
- `New Build` opens the centered workspace with empty composition and focus on `build_code`.
- `Manage` on a saved Build opens the same workspace but preloaded, with the selected Build card highlighted in the left rail.
- Clicking `Add to Build` on a `Models` card inserts that entry into the center composition immediately and scrolls the center rail only if needed.
- Selecting an already-present `Model` should increase emphasis on the existing line instead of silently duplicating it; the wireframe can show either quantity bump affordance or “already included” treatment, but the center box must remain the source of truth.
- Marketplace `SKU mapping` statuses remain visible in two places:
  - left-rail readiness list
  - dedicated `SKU mapping` section/tab for per-marketplace edit access
- Formula creation starts with tokens and operator buttons:
  - variables like `subtotal`, `VAT`, `commission`, `fixed overhead`
  - simple actions like add, multiply, percent-of
- Raw formula text is secondary and hidden behind an explicit mode switch so operators are not forced into cryptic syntax first.
- Mobile uses segmented tabs to swap between Composition, Models, Pricing, and `SKU mapping`; desktop keeps all three rails visible together.

## Risks / tradeoffs
- Stronger focus comes with more visual weight. If the dim layer is too dark or the popup too glossy, it will feel detached from Interwall. Keep contrast conservative.
- Three-rail desktop layout is more powerful than the original stacked editor, but it risks crowding if metadata density grows. The right rail should stay curated and concise.
- The n8n-inspired side-panel feel is useful for “compose from a library,” but Interwall is an operations tool. Avoid node-graph styling, floating connectors, or neon accents.
- Guided pricing widgets reduce syntax fear, but if too many tokens are shown at once, the top-right area becomes noisy. Keep only the most operator-relevant variables visible by default.
- Always-visible `SKU mapping` health improves readiness scanning, but duplicate signals across left rail and detail section can feel repetitive. Use the left side for summary and the detail view for editing depth.
- Mobile cannot preserve the full dual-rail feeling at once. The compromise is a tabbed single-column workspace that preserves the same mental model rather than shrinking desktop literally.
- This document is UI-only. It frames layout, emphasis, and interaction expectations without making API, validation, or data-model decisions.
