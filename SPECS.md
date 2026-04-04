Omiximo Inventory Management System — Project Specification
Purpose and Vision

The existing inventory‑omiximo prototype was built quickly on top of an external backend (InvenTree API) and a plugin for email automation. It relies heavily on client‑side storage for configuration, causing data loss across devices and limited extensibility. This project aims to rebuild the system from the ground up as a stand‑alone, enterprise‑grade inventory management platform for small‑to‑medium manufacturing and assembly businesses. The refactor will unify all features into a single codebase, incorporate multi‑tenant support, and provide intuitive dashboards and automation to streamline operations.

The new system will allow businesses to manage raw materials and assembled kits, automatically track purchases and sales via email parsing, compute reorder points, and analyse profitability — all within a secure, multi‑tenant environment.

High‑Level Objectives
Unify and internalise all functionality – Eliminate dependence on external backends and plugins. The system should implement its own backend for inventory, configuration and email ingestion, removing the dual‑storage architecture that causes sync inconsistencies.
Support multiple tenants – Organisations should have isolated data with the ability to manage users and roles. The database will include a tenant_id column on all multi‑tenant tables and enforce row‑level security (RLS) to restrict queries to the current tenant. Users may belong to multiple organisations through a memberships table.
Replicate and improve the intuitive warehouse UI – Keep the popular “wall” grid of shelves and zones, the orbball sidebar and blurred backgrounds, but implement them using a modern React/Next.js stack. The UI should visually indicate reorder points using colour coding (green/yellow/red) based on stock relative to reorder thresholds.
Automate inventory transactions – Introduce a built‑in email ingestion service to read purchase and sales confirmation emails from configured mailboxes, extract product identifiers (EANs), quantities, prices, dates and marketplaces, and create corresponding orders in the system. This replaces the separate omiximo-email-automation plugin.
Allow kit (Bill‑of‑Materials) definitions – Users should define kits (e.g., a finished product comprises multiple components plus fixed costs). When a kit is sold, the system automatically decrements the stock of its component parts.
Compute reorder points and JIT alerts – Implement the reorder point formula: ROP = Demand During Lead Time + Safety Stock. Demand during lead time is Average Daily Sales × Lead Time, and safety stock is derived from order and lead‑time variability. When inventory falls below the ROP, the system should flag the product for replenishment.
Generate profitability and stock value dashboards – Provide analytical dashboards comparing cost prices against sold prices, summarising profit per product, kit, marketplace and time period. Show total stock value across warehouses.
Ensure security, performance and maintainability – Use secure authentication, follow best practices for database policies, design with scalability in mind and write maintainable TypeScript code with tests.
Reuse existing code intelligently – The repository will contain both the original inventory‑omiximo and omiximo-email-automation directories. Identify reusable modules (e.g., UI components, email parsing logic) and migrate or adapt them into the new codebase where appropriate.
Scope of Work
1. Core Backend and Database
Set up Supabase or equivalent PostgreSQL backend with multi‑tenant architecture. Define tables for tenants, users (managed by Clerk or similar), memberships, warehouses, zones, shelves, products, stocks, kits, kit_components, purchase orders, purchase items, sales orders, sales items, email messages and email mapping rules.
Enable row‑level security (RLS) on all tables. Policies should filter rows by tenant_id and user membership. RLS is essential because exposing the database via PostgREST without RLS allows unrestricted access. Index columns used in policies to maintain performance.
Integrate authentication using Clerk (preferred) or another auth provider that supports user accounts, organisations and role management. Use JWT claims to identify the current tenant; apply RLS policies accordingly.
Implement multi‑tenant API layer using Supabase Edge Functions or serverless functions to handle privileged operations (e.g., reorder logic, email processing) without exposing service keys. Provide REST or GraphQL endpoints for the frontend.
2. Data Model and Business Rules
Product and stock management – Allow creation of products with EANs/SKUs, barcodes, default reorder points and safety stock. Stock entries should track quantities, cost price and lot metadata. FIFO consumption is required for cost valuation.
Warehouse structure – Represent locations as warehouses → zones → shelves. Each shelf stores multiple products; shelves have capacity, reorder point and safety stock parameters. UI should display a grid of shelves and their status (available, low, reorder). Persist zone and shelf configuration in the database, not localStorage.
Kits/Bill of Materials – Define kits with component products and required quantities. Maintain a kits table mapping kit products to component lines. When a kit order is processed, automatically create stock consumption records for each component. Additional fixed costs can be stored on the kit for profit analysis.
Order handling – Implement purchase orders and sales orders with line items. Purchase orders increase stock at the receiving warehouse; sales orders decrease stock. Support statuses (draft, confirmed, received/shipped) and allow manual editing when necessary.
Reorder point logic – Provide functions to calculate reorder points using average daily sales and safety stock formulas. Evaluate stock levels daily (or on change) and mark items below ROP as requiring replenishment. Optionally auto‑generate draft purchase orders for such items.
Profit and stock value computation – For each sale, compute cost of goods sold (COGS) from FIFO stock consumption plus kit fixed costs. Profit equals revenue minus COGS. Stock value equals the sum of current stock quantity × cost price for all items. Provide aggregated queries for dashboards.
Audit logging – Record all inventory transactions (receipts, sales, adjustments), kit updates, reorder events and configuration changes in an audit table. Ensure this table is included in RLS policies but may be accessible to administrators for cross‑tenant reporting.
3. Email Ingestion and Automation
Inbox connection – Support IMAP/SMTP connection to user‑configured mailboxes. Tenants can specify email credentials and mapping rules for different marketplaces (e.g., Amazon, eBay). Store these configurations in an email_mappings table.
Parsing engine – Use natural language processing or pattern matching to extract data from incoming emails: order reference, product codes (EAN/SKU), quantities, unit prices, total cost, order date and marketplace. Use the existing omiximo-email-automation logic as a starting point and integrate its AI classifier into the new service. Provide a review queue for low‑confidence extractions.
Order creation – Create purchase or sales orders and associated line items when emails are parsed. If the order references a kit product, automatically handle kit consumption. Link each created order to the original email for traceability.
Scheduled polling and notifications – Implement scheduled tasks (cron jobs) that poll mailboxes periodically. Provide notification settings per tenant for success/failure events. Include metrics on processed emails and error rates in admin dashboards.
4. Frontend and User Experience
Framework – Use Next.js and React (with TypeScript). Leverage Tailwind CSS and the shadcn/ui component library. Create a coherent design system (spacing, typography, colours) to match the current Omiximo look but implement it with modern, maintainable code. Use server components where appropriate for improved performance.
Responsive design – Ensure the UI works on desktop, tablet and mobile devices. Implement barcode scanning using device cameras for quick product lookup and stock operations.
Navigation – Provide pages for Dashboard, Inventory, Orders, Kits, Email Automation, Settings and Reports. The orbball sidebar and blur effect from the existing prototype should be reproduced.
Inventory wall – Visualise shelves as a grid; each shelf card shows the product name, current quantity, reorder point and a colour-coded status. Clicking a shelf opens details and actions (move stock, record sale, adjust quantities). Users can drag and drop products to rearrange their location.
Order management UI – Forms for creating purchase and sales orders, selecting products/kits, specifying quantities and prices, and setting statuses. Provide search, filters and sorting on orders.
Kits UI – Interfaces for defining kits, adding/removing components and editing costs. Show BOM hierarchy and update reorder points accordingly.
Email wizard – UI wizard for configuring mailboxes, defining mapping rules, testing parsing and reviewing extracted orders.
Dashboards – Visual dashboards with charts and tables for profit analysis, stock value and reorder status. Provide date range and category filters.
Admin features – Tenants with admin role can manage users, assign roles, adjust system settings (email configuration, reorder calculation schedules) and view audit logs.
5. Reuse of Existing Repositories

Both omiximo‑inventory and omiximo‑email-automation directories will be available. The new system should:

Extract reusable UI components and styling from inventory-omiximo, such as the orbball sidebar, shelf grid layout and modal dialogs. Refactor these into a modern component library compatible with Next.js and shadcn/ui.
Reuse business logic for barcode scanning, FIFO calculations and kit handling as a foundation. The logic currently resides in front‑end code and Python scripts; migrate algorithms into TypeScript for the new backend/API and adapt them to the new schema.
Incorporate email parsing routines from the omiximo-email-automation plugin. Extract the AI classification model or heuristics used to recognise order emails and integrate them into the new email ingestion service. Replace any direct file/database access with calls to the new backend.
Analyse data flow issues documented in the original system (e.g., unsynced localStorage, inconsistent sales data) and ensure the new design addresses them by using a single source of truth (the database) and proper caching strategies.
6. Non‑Functional Requirements
Security – Enforce RLS and never expose service keys to the client. Use secure storage for email credentials and secrets. Rate‑limit API endpoints and validate all inputs to prevent injection attacks.
Performance and scalability – Index critical columns (tenant_id, product SKUs, timestamps). Use efficient queries and caching (e.g., React Query). The system should support thousands of products and orders without noticeable lag.
Reliability – Implement comprehensive automated tests (unit, integration, end‑to‑end). Ensure idempotency for email ingestion to avoid duplicate orders. Provide transactional operations to maintain consistency.
Maintainability – Use a modular, monorepo structure with clear separation between frontend, backend and shared logic. Apply consistent coding standards and documentation. Provide migration scripts and seed data.
User experience – Provide friendly error messages, empty states, loading indicators and accessibility features (keyboard navigation, proper colour contrast). Include support for internationalisation and localisation.
7. Deliverables
Database schema and migration scripts implementing the multi‑tenant model with RLS policies and triggers for kit consumption and FIFO cost calculation.
API layer or edge functions exposing CRUD operations for all domain entities, reorder point evaluation and email ingestion endpoints.
Email ingestion service capable of connecting to external mailboxes, parsing emails and creating orders, with a configuration UI and review queue.
Next.js application with responsive pages for all major features (inventory wall, orders, kits, email settings, dashboards, admin). Include a reusable component library reflecting Omiximo’s aesthetic.
Profitability and stock value dashboards with filters and date ranges.
Documentation covering system architecture, setup instructions, database schema, API usage and development guidelines. Include a runbook for deploying the system to production (e.g., using Docker and environment variables).
Test suite ensuring correct behaviour of core features (stock movements, kit consumption, reorder alerts, email parsing). Use CI to run tests on each commit.
Migration guidance for existing users of the prototype, detailing how to move configuration, products and orders into the new system.
Acceptance Criteria
The system must allow multiple organisations to coexist without data leakage and support role‑based access to features.
Inventory visualisation must show real‑time status of shelves and clearly indicate when products need replenishment based on the reorder point formula.
Kit definitions must automatically adjust component stock and cost during sales.
Incoming emails from configured marketplaces must be parsed with high accuracy, and resulting purchase/sales orders must be created in the system without manual intervention (except for low‑confidence cases).
Dashboards must accurately report profit and stock value; results should be consistent with FIFO and kit cost calculations.
The UI must meet accessibility standards and work across devices.
Tests must cover all critical business logic and pass consistently.
