---
phase: 01-foundation
plan: 02
subsystem: database
tags: [plpgsql, fifo, cogs, sale-processing, business-logic]
dependency_graph:
  requires: [01-01]
  provides: [deduct_fifo_stock, resolve_composition, process_sale]
  affects: [email-service, fastapi-rpc-calls]
tech_stack:
  added: []
  patterns: [pl/pgsql-stored-functions, select-for-update-fifo, accurate-cogs-pre-deduction]
key_files:
  modified:
    - apps/api/sql/init.sql
decisions:
  - "Plain FOR UPDATE (not SKIP LOCKED) used in deduct_fifo_stock to serialize concurrent callers and maintain strict FIFO order"
  - "COGS computed by reading lot unit_costs BEFORE deduction (accurate) not after — avoids the simplified-but-wrong post-deduction pattern"
  - "process_sale validates stock sufficiency first (raises EXCEPTION on failure) then calls deduct_fifo_stock in same transaction"
metrics:
  duration_minutes: 3
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_modified: 1
---

# Phase 01 Plan 02: Business Logic Functions Summary

**One-liner:** Three PL/pgSQL functions implement atomic FIFO deduction, EAN composition resolution, and full sale processing with accurate pre-deduction COGS in a single transaction.

## What Was Built

Three PostgreSQL stored functions appended to `apps/api/sql/init.sql`:

1. **`deduct_fifo_stock(p_product_id UUID, p_quantity INTEGER, p_order_ref TEXT) RETURNS INTEGER`**
   - Iterates stock_lots for the product ordered by `received_at ASC` (FIFO)
   - Uses plain `FOR UPDATE` — concurrent callers serialize, no skipping
   - Returns actual units deducted (may be less than requested if insufficient stock)
   - Returns 0 immediately for zero-quantity requests

2. **`resolve_composition(p_parent_ean TEXT) RETURNS TABLE(component_ean, component_name, quantity)`**
   - Joins `ean_compositions` to `products` to return component rows with names
   - Returns empty result set (not an error) if parent has no compositions
   - Marked `STABLE` for planner optimization

3. **`process_sale(p_parent_ean TEXT, p_quantity INTEGER, p_sale_price NUMERIC, p_marketplace TEXT, p_order_ref TEXT, p_email_id UUID) RETURNS UUID`**
   - Validates parent product exists (RAISE EXCEPTION if not found)
   - For each component: reads lot costs pre-deduction for accurate COGS, validates sufficient stock, calls deduct_fifo_stock
   - Applies fixed_costs table (percentage and flat-amount variants)
   - Inserts one immutable `transactions` row, returns its UUID
   - Entire function runs in caller's transaction — rolls back on any exception

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files created:
- apps/api/sql/init.sql (modified) — FOUND

Commits:
- 4d18420 — deduct_fifo_stock and resolve_composition
- 8b4fe6e — process_sale with accurate COGS

## Self-Check: PASSED
