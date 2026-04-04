#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const ENV_PATH = new URL('../../apps/web/.env.local', import.meta.url);

const DEMO_EMAIL = process.env.INTERWALL_DEMO_EMAIL ?? 'demo@interwall.local';
const DEMO_PASSWORD = process.env.INTERWALL_DEMO_PASSWORD ?? 'Demo123!';
const DEMO_FULL_NAME = process.env.INTERWALL_DEMO_FULL_NAME ?? 'Interwall Demo';
const DEMO_TENANT_SLUG = process.env.INTERWALL_DEMO_TENANT_SLUG ?? 'demo-factory';
const DEMO_TENANT_NAME = process.env.INTERWALL_DEMO_TENANT_NAME ?? 'Demo Factory';
const DEMO_WAREHOUSE_CODE = 'MAIN';
const DEMO_WAREHOUSE_NAME = 'Main Warehouse';
const DEMO_ZONE_LABEL = 'A';
const DEMO_PRODUCT_SKU = 'FRAME-001';
const DEMO_PRODUCT_NAME = 'Frame Rail';
const DEMO_PURCHASE_ORDER_NUMBER = 'PO-1001';
const DEMO_SALES_ORDER_NUMBER = 'SO-1001';
const DEMO_LOT_REFERENCE = 'DEMO-LOT-001';

function parseEnvFile(content) {
    const values = {};

    for (const line of content.split(/\r?\n/u)) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        values[key] = value;
    }

    return values;
}

async function loadEnv() {
    const content = await readFile(ENV_PATH, 'utf8');
    const values = parseEnvFile(content);

    if (!values.NEXT_PUBLIC_SUPABASE_URL) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing from apps/web/.env.local');
    }

    if (!values.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing from apps/web/.env.local');
    }

    return values;
}

async function findUserByEmail(adminClient, email) {
    let page = 1;

    for (;;) {
        const { data, error } = await adminClient.auth.admin.listUsers({
            page,
            perPage: 200,
        });

        if (error) {
            throw error;
        }

        const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
        if (match) {
            return match;
        }

        if (data.users.length < 200) {
            return null;
        }

        page += 1;
    }
}

async function ensureUser(adminClient) {
    const { data, error } = await adminClient.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: {
            full_name: DEMO_FULL_NAME,
        },
    });

    if (!error && data.user) {
        return data.user;
    }

    const existingUser = await findUserByEmail(adminClient, DEMO_EMAIL);
    if (!existingUser) {
        throw error ?? new Error(`Unable to create or locate ${DEMO_EMAIL}.`);
    }

    const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(
        existingUser.id,
        {
            password: DEMO_PASSWORD,
            email_confirm: true,
            user_metadata: {
                full_name: DEMO_FULL_NAME,
            },
        },
    );

    if (updateError) {
        throw updateError;
    }

    return updatedUser.user;
}

async function upsertSingle(adminClient, table, values, onConflict) {
    const query = adminClient
        .from(table)
        .upsert(values, {
            onConflict,
        })
        .select()
        .single();

    const { data, error } = await query;

    if (error) {
        throw error;
    }

    return data;
}

async function recreateChildRows(adminClient, input) {
    const {
        stockLotId,
        purchaseOrderId,
        salesOrderId,
        tenantId,
        productId,
        shelfId,
    } = input;

    await adminClient
        .from('stock_lots')
        .delete()
        .eq('id', stockLotId);

    await adminClient
        .from('purchase_order_lines')
        .delete()
        .eq('purchase_order_id', purchaseOrderId);

    await adminClient
        .from('sales_order_lines')
        .delete()
        .eq('sales_order_id', salesOrderId);

    const { error: stockLotError } = await adminClient.from('stock_lots').insert({
        id: stockLotId,
        tenant_id: tenantId,
        product_id: productId,
        shelf_id: shelfId,
        original_quantity: 5,
        quantity_on_hand: 5,
        received_at: '2026-04-01T09:00:00Z',
        unit_cost: 12.5,
        lot_reference: DEMO_LOT_REFERENCE,
        supplier_reference: 'SUP-RAIL-42',
        notes: 'Local demo lot for FIFO testing.',
    });

    if (stockLotError) {
        throw stockLotError;
    }

    const { error: purchaseLineError } = await adminClient
        .from('purchase_order_lines')
        .insert({
            tenant_id: tenantId,
            purchase_order_id: purchaseOrderId,
            product_id: productId,
            quantity_ordered: 20,
            quantity_received: 0,
            unit_cost: 12.5,
            notes: 'Inbound demo replenishment.',
        });

    if (purchaseLineError) {
        throw purchaseLineError;
    }

    const { error: salesLineError } = await adminClient
        .from('sales_order_lines')
        .insert({
            tenant_id: tenantId,
            sales_order_id: salesOrderId,
            product_id: productId,
            quantity_ordered: 8,
            quantity_shipped: 0,
            unit_price: 24.99,
            cost_basis_total: null,
            notes: 'Intentional shortfall demo order.',
        });

    if (salesLineError) {
        throw salesLineError;
    }
}

async function main() {
    const env = await loadEnv();
    const adminClient = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        },
    );

    const user = await ensureUser(adminClient);

    const tenant = await upsertSingle(
        adminClient,
        'tenants',
        {
            slug: DEMO_TENANT_SLUG,
            name: DEMO_TENANT_NAME,
            created_by: user.id,
        },
        'slug',
    );

    await upsertSingle(
        adminClient,
        'tenant_settings',
        {
            tenant_id: tenant.id,
            timezone: 'Europe/Amsterdam',
            currency_code: 'EUR',
            settings: {
                seededBy: 'scripts/local/bootstrap-demo.mjs',
            },
        },
        'tenant_id',
    );

    await upsertSingle(
        adminClient,
        'tenant_memberships',
        {
            tenant_id: tenant.id,
            user_id: user.id,
            role: 'owner',
            status: 'active',
        },
        'tenant_id,user_id',
    );

    const warehouse = await upsertSingle(
        adminClient,
        'warehouses',
        {
            tenant_id: tenant.id,
            name: DEMO_WAREHOUSE_NAME,
            code: DEMO_WAREHOUSE_CODE,
            display_code: DEMO_WAREHOUSE_CODE,
            sort_order: 0,
            is_active: true,
            notes: 'Seeded local demo warehouse.',
        },
        'tenant_id,code',
    );

    const zone = await upsertSingle(
        adminClient,
        'inventory_zones',
        {
            tenant_id: tenant.id,
            warehouse_id: warehouse.id,
            label: DEMO_ZONE_LABEL,
            display_code: DEMO_ZONE_LABEL,
            sort_order: 0,
            is_active: true,
            notes: 'Seeded local demo zone.',
        },
        'warehouse_id,label',
    );

    const shelf = await upsertSingle(
        adminClient,
        'shelves',
        {
            tenant_id: tenant.id,
            warehouse_id: warehouse.id,
            zone_id: zone.id,
            label: 'A-01-01',
            column_position: 1,
            level_position: 1,
            display_code: 'A-01-01',
            sort_order: 0,
            capacity_units: 25,
            reorder_display_threshold: 3,
            is_active: true,
            notes: 'Seeded local demo shelf.',
        },
        'zone_id,column_position,level_position',
    );

    const product = await upsertSingle(
        adminClient,
        'products',
        {
            tenant_id: tenant.id,
            sku: DEMO_PRODUCT_SKU,
            barcode: 'INT-DEMO-001',
            name: DEMO_PRODUCT_NAME,
            description: 'Seeded demo product for wall and orders testing.',
            unit_of_measure: 'each',
            reorder_point: 4,
            safety_stock: 2,
            lead_time_days: 5,
            reorder_enabled: true,
            preferred_storage_note: 'Keep on front demo shelf.',
            default_cost_basis: 12.5,
            tracking_mode: 'lot',
            status: 'active',
            archived_at: null,
        },
        'tenant_id,sku',
    );

    const purchaseOrder = await upsertSingle(
        adminClient,
        'purchase_orders',
        {
            tenant_id: tenant.id,
            order_number: DEMO_PURCHASE_ORDER_NUMBER,
            warehouse_id: warehouse.id,
            supplier_name: 'Nordic Metals',
            supplier_reference: 'SUP-PO-1001',
            status: 'confirmed',
            order_date: '2026-04-01',
            expected_date: '2026-04-05',
            received_date: null,
            notes: 'Seeded inbound order for local testing.',
        },
        'tenant_id,order_number',
    );

    const salesOrder = await upsertSingle(
        adminClient,
        'sales_orders',
        {
            tenant_id: tenant.id,
            order_number: DEMO_SALES_ORDER_NUMBER,
            warehouse_id: warehouse.id,
            customer_name: 'Atlas Assembly',
            customer_reference: 'CUS-SO-1001',
            status: 'confirmed',
            order_date: '2026-04-02',
            shipped_date: null,
            notes: 'Seeded shortfall order for shipment preview testing.',
        },
        'tenant_id,order_number',
    );

    const stockLotId = `${tenant.id.slice(0, 8)}-0000-4000-8000-000000000001`;

    await recreateChildRows(adminClient, {
        stockLotId,
        purchaseOrderId: purchaseOrder.id,
        salesOrderId: salesOrder.id,
        tenantId: tenant.id,
        productId: product.id,
        shelfId: shelf.id,
    });

    console.log(`Demo user: ${DEMO_EMAIL}`);
    console.log(`Demo password: ${DEMO_PASSWORD}`);
    console.log(`Tenant: ${DEMO_TENANT_NAME}`);
    console.log('Seeded records: warehouse, zone, shelf, product, stock lot, purchase order, sales order');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
