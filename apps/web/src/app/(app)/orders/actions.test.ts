import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockCreatePurchaseOrder,
    mockUpdatePurchaseOrder,
    mockConfirmPurchaseOrder,
    mockCreateSalesOrder,
    mockUpdateSalesOrder,
    mockConfirmSalesOrder,
    mockCancelPurchaseOrder,
    mockCancelSalesOrder,
    mockRequireUserSession,
    mockCreateServerSupabaseClient,
    mockListMembershipsForUser,
    mockCookieStore,
} = vi.hoisted(() => ({
    mockCreatePurchaseOrder: vi.fn(),
    mockUpdatePurchaseOrder: vi.fn(),
    mockConfirmPurchaseOrder: vi.fn(),
    mockCreateSalesOrder: vi.fn(),
    mockUpdateSalesOrder: vi.fn(),
    mockConfirmSalesOrder: vi.fn(),
    mockCancelPurchaseOrder: vi.fn(),
    mockCancelSalesOrder: vi.fn(),
    mockRequireUserSession: vi.fn(),
    mockCreateServerSupabaseClient: vi.fn(),
    mockListMembershipsForUser: vi.fn(),
    mockCookieStore: {
        get: vi.fn(),
    },
}));

vi.mock('@/lib/server/order-mutations', () => ({
    createPurchaseOrder: mockCreatePurchaseOrder,
    updatePurchaseOrder: mockUpdatePurchaseOrder,
    confirmPurchaseOrder: mockConfirmPurchaseOrder,
    createSalesOrder: mockCreateSalesOrder,
    updateSalesOrder: mockUpdateSalesOrder,
    confirmSalesOrder: mockConfirmSalesOrder,
    cancelPurchaseOrder: mockCancelPurchaseOrder,
    cancelSalesOrder: mockCancelSalesOrder,
}));

vi.mock('@/lib/server/auth', () => ({
    requireUserSession: mockRequireUserSession,
}));

vi.mock('@/lib/server/supabase', () => ({
    createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

vi.mock('@/lib/server/repositories/memberships', () => ({
    listMembershipsForUser: mockListMembershipsForUser,
}));

vi.mock('next/headers', () => ({
    cookies: vi.fn(() => mockCookieStore),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

import {
    cancelPurchaseOrderAction,
    cancelSalesOrderAction,
    confirmPurchaseOrderAction,
    confirmSalesOrderAction,
    createPurchaseOrderAction,
    createSalesOrderAction,
    updatePurchaseOrderAction,
    updateSalesOrderAction,
} from './actions';

function setupActiveTenant() {
    mockRequireUserSession.mockResolvedValue({
        id: 'user-1',
        email: 'owner@example.com',
    });
    mockCreateServerSupabaseClient.mockReturnValue({});
    mockListMembershipsForUser.mockResolvedValue([
        {
            tenantId: 'tenant-1',
            tenantSlug: 'acme',
            tenantName: 'Acme Corp',
            role: 'owner',
            isActive: true,
        },
    ]);
    mockCookieStore.get.mockReturnValue({ value: 'tenant-1' });
}

describe('orders server actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupActiveTenant();
    });

    it('delegates purchase order create and update actions with tenant-scoped header fields', async () => {
        await createPurchaseOrderAction({
            orderNumber: 'PO-100',
            supplierName: 'Supplier A',
            supplierReference: 'SUP-A',
            warehouseId: 'warehouse-1',
            orderDate: '2026-04-02',
            expectedDate: '2026-04-04',
            note: 'Restock brackets',
            lines: [],
        });

        await updatePurchaseOrderAction({
            purchaseOrderId: 'purchase-1',
            orderNumber: 'PO-100',
            supplierName: 'Supplier B',
            supplierReference: 'SUP-B',
            warehouseId: 'warehouse-2',
            orderDate: '2026-04-03',
            expectedDate: '2026-04-05',
            note: 'Updated draft',
            lines: [],
        });

        expect(mockCreatePurchaseOrder).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            input: {
                order_number: 'PO-100',
                supplier_name: 'Supplier A',
                supplier_reference: 'SUP-A',
                warehouse_id: 'warehouse-1',
                order_date: '2026-04-02',
                expected_date: '2026-04-04',
                note: 'Restock brackets',
                lines: [],
            },
        });
        expect(mockUpdatePurchaseOrder).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            input: {
                purchase_order_id: 'purchase-1',
                order_number: 'PO-100',
                supplier_name: 'Supplier B',
                supplier_reference: 'SUP-B',
                warehouse_id: 'warehouse-2',
                order_date: '2026-04-03',
                expected_date: '2026-04-05',
                note: 'Updated draft',
                lines: [],
            },
        });
    });

    it('delegates sales order create and update actions with tenant-scoped header fields', async () => {
        await createSalesOrderAction({
            orderNumber: 'SO-200',
            customerName: 'Customer A',
            customerReference: 'CUST-A',
            warehouseId: 'warehouse-1',
            orderDate: '2026-04-02',
            expectedDate: null,
            note: 'Priority order',
            lines: [],
        });

        await updateSalesOrderAction({
            salesOrderId: 'sales-1',
            orderNumber: 'SO-200',
            customerName: 'Customer B',
            customerReference: 'CUST-B',
            warehouseId: 'warehouse-2',
            orderDate: '2026-04-03',
            expectedDate: null,
            note: 'Updated draft',
            lines: [],
        });

        expect(mockCreateSalesOrder).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            input: {
                order_number: 'SO-200',
                customer_name: 'Customer A',
                customer_reference: 'CUST-A',
                warehouse_id: 'warehouse-1',
                order_date: '2026-04-02',
                expected_date: null,
                note: 'Priority order',
                lines: [],
            },
        });
        expect(mockUpdateSalesOrder).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            input: {
                sales_order_id: 'sales-1',
                order_number: 'SO-200',
                customer_name: 'Customer B',
                customer_reference: 'CUST-B',
                warehouse_id: 'warehouse-2',
                order_date: '2026-04-03',
                expected_date: null,
                note: 'Updated draft',
                lines: [],
            },
        });
    });

    it('delegates confirm and cancel actions with the active tenant resolved on the server', async () => {
        await confirmPurchaseOrderAction({ purchaseOrderId: 'purchase-1' });
        await confirmSalesOrderAction({ salesOrderId: 'sales-1' });
        await cancelPurchaseOrderAction({
            purchaseOrderId: 'purchase-1',
            reason: 'duplicate',
            note: 'Cancelled draft',
        });
        await cancelSalesOrderAction({
            salesOrderId: 'sales-1',
            reason: 'customer_changed_mind',
            note: 'Cancelled before ship',
        });

        expect(mockConfirmPurchaseOrder).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            input: {
                purchase_order_id: 'purchase-1',
            },
        });
        expect(mockConfirmSalesOrder).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            input: {
                sales_order_id: 'sales-1',
            },
        });
        expect(mockCancelPurchaseOrder).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            input: {
                purchase_order_id: 'purchase-1',
                reason: 'duplicate',
                note: 'Cancelled draft',
            },
        });
        expect(mockCancelSalesOrder).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            input: {
                sales_order_id: 'sales-1',
                reason: 'customer_changed_mind',
                note: 'Cancelled before ship',
            },
        });
    });
});
