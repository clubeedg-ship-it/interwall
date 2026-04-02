# Supabase Edge Functions

Privileged tenant and auth logic lives here.

For the interwall rebuild, `supabase/functions` is the first-class home for backend behavior that must run with trusted credentials or reusable tenant-aware guards. That includes:

- authenticated backend user resolution
- active-tenant validation
- tenant membership and role checks
- privileged membership administration
- trusted inventory stock mutation semantics (`inventory-stock`)
- trusted order CRUD, receiving, shipping, cancellation, and FIFO-backed ledger writes (`inventory-orders`)
- other server-only tenant and auth flows added in later phases

`apps/web` is not the home for this logic. The web app should stay focused on UI, session orchestration, and thin request handoff into the backend surface defined here.

## Shared Helpers

- `_shared/auth.ts`: creates request-scoped Supabase clients and resolves the authenticated backend user
- `_shared/tenant-context.ts`: enforces active tenant, membership, and admin requirements
- `_shared/errors.ts`: provides consistent JSON error responses for functions

## Current Functions

- `tenant-memberships`: lists and administers tenant memberships behind membership-aware guards
- `inventory-stock`: owns create, update, adjust, and relocate stock-lot mutations after validating the caller and active tenant
- `inventory-orders`: owns order CRUD, confirmation, cancellation, purchase receiving, and sales shipping through the `apply_purchase_order_receipt` and `apply_sales_order_shipment` SQL RPC helpers

## Edge Function Contract

Each function should:

1. Resolve the caller through `_shared/auth.ts`
2. Validate the active tenant through `_shared/tenant-context.ts`
3. Perform any privileged mutation with a backend-only client
4. Return stable JSON responses through `_shared/errors.ts`

This keeps privileged rules under `supabase/functions` instead of scattering them across app actions or route handlers.
