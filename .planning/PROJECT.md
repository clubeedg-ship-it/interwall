# Omiximo Inventory OS — Minimal MVP

## What This Is

A cleanup and rewiring of the existing Omiximo inventory management system for a small PC assembly business. The legacy vanilla JS frontend stays as-is; the backend moves from InvenTree API + localStorage to a direct PostgreSQL database. Email-driven stock management and FIFO profit calculation are the core value loop.

## Core Value

When a sale email arrives, the system auto-deducts component stock via EAN compositions, computes FIFO-based profit including fixed costs, and records everything durably in the database — no manual intervention, no browser cache dependency.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] EAN composition management (parent → component mappings with quantities)
- [ ] Email-driven purchase processing (parse email → stock IN with EAN, qty, unit cost, marketplace, date)
- [ ] Email-driven sale processing (parse email → FIFO component deduction via EAN compositions → profit calculation)
- [ ] Profit engine fed from database transactions (COGS from FIFO + fixed costs → margin)
- [ ] Wall UI rendering from database (zones, shelves, stock levels with health colors)
- [ ] Zone/shelf configuration persisted in database (not localStorage)
- [ ] Scanner maps EAN to shelf location in database
- [ ] Product catalog CRUD from database
- [ ] All business data in PostgreSQL — zero localStorage for business state
- [ ] InvenTree backend fully removed
- [ ] Frontend code cleanup (split app.js monolith, fix XSS, batch queries)

### Out of Scope

- Multi-tenant / organizations / memberships / RLS — single tenant, single business
- User roles and permissions — single user is sufficient
- Reorder point automation — manual reorder for now
- Label printing — not needed for MVP
- Camera-based barcode scanning — USB scanner only
- React/Next.js rewrite — keep vanilla JS
- Real-time WebSocket updates — polling is fine
- CI/CD pipeline — manual deploy
- Migration from old InvenTree data — fresh start
- Review queue UI for low-confidence emails — log and fix manually
- Drag-and-drop shelf rearrangement — manual config

## Context

**Legacy system:** Two separate codebases — `inventory-omiximo` (vanilla JS + InvenTree) and `omiximo-email-automation` (Python IMAP poller). The frontend stores zones, transactions, shelf config, and cost config in browser localStorage, causing cross-device data loss and sync failures.

**Business model:** Small PC assembly company (Omiximo). Buys components from marketplaces (MediaMarktSaturn, Bol.com, Boulanger). Assembles PCs. Sells assembled PCs on same marketplaces. Profit = sale price − component FIFO costs − fixed costs (VAT 21%, commission ~6.2%, overhead ~€95).

**EAN composition ("piece builder"):** A finished PC (EAN1) is composed of CPU (EAN2) + RAM (EAN3) ×2 + GPU (EAN4) + SSD (EAN5). When EAN1 is sold, all components are deducted from stock. This is the core data structure.

**Email is the primary input:** Most stock movement happens through email parsing — purchase confirmations create stock IN, sale confirmations trigger component deduction. The barcode scanner is secondary — used for physically placing items on shelves.

**Existing parsers:** MediaMarktSaturn (Dutch), Bol.com (Dutch), Boulanger (French) email parsers exist in Python and work. They need rewiring from InvenTree API calls to direct database writes.

## Constraints

- **Frontend**: Keep existing vanilla JS SPA — only touch localStorage→DB wiring, XSS fixes, and code organization
- **Database**: PostgreSQL (Supabase or self-hosted) — single source of truth for all business data
- **Email service**: Keep existing Python IMAP service — rewire output to new database
- **No InvenTree**: System must run without InvenTree containers (no Django, Celery, Redis dependency)
- **Single tenant**: No multi-tenant complexity — one business, one database
- **Spec**: SPECS-MVP.md is the authoritative scope document

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep vanilla JS frontend | Working UI, pivot is about persistence not aesthetics | — Pending |
| Remove InvenTree entirely | Eliminate dependency on second infrastructure stack | — Pending |
| PostgreSQL direct (not InvenTree API) | Single source of truth, simpler architecture | — Pending |
| Keep Python email service | Parsers work, just need rewiring | — Pending |
| Single tenant | Reduce complexity for MVP | — Pending |
| EAN compositions as core data model | Maps directly to business workflow (assembled product → components) | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-02 after initialization*
