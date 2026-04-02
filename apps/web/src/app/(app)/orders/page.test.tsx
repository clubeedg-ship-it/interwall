import '@testing-library/jest-dom/vitest';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async () => import('@/test/mocks/next-navigation'));

import { renderApp, screen } from '@/test/render';

import OrdersPage from './page';

const {
    mockRequireUserSession,
    mockCreateServerSupabaseClient,
    mockListMembershipsForUser,
    mockCookieStore,
    mockListOrders,
    mockGetPurchaseOrderDetail,
} = vi.hoisted(() => ({
    mockRequireUserSession: vi.fn(),
    mockCreateServerSupabaseClient: vi.fn(),
    mockListMembershipsForUser: vi.fn(),
    mockCookieStore: {
        get: vi.fn(),
    },
    mockListOrders: vi.fn(),
    mockGetPurchaseOrderDetail: vi.fn(),
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

vi.mock('@/lib/server/repositories/orders', () => ({
    listOrders: mockListOrders,
    getPurchaseOrderDetail: mockGetPurchaseOrderDetail,
    getSalesOrderDetail: vi.fn(),
}));

vi.mock('next/headers', () => ({
    cookies: vi.fn(() => mockCookieStore),
}));

describe('OrdersPage', () => {
    beforeEach(() => {
        mockRequireUserSession.mockReset();
        mockCreateServerSupabaseClient.mockReset();
        mockListMembershipsForUser.mockReset();
        mockCookieStore.get.mockReset();
        mockListOrders.mockReset();
        mockGetPurchaseOrderDetail.mockReset();

        mockRequireUserSession.mockResolvedValue({
            id: 'user-1',
            email: 'owner@example.com',
        });
        mockCreateServerSupabaseClient.mockReturnValue({});
        mockListMembershipsForUser.mockResolvedValue([
            {
                tenantId: 'tenant-a',
                tenantSlug: 'alpha',
                tenantName: 'Alpha Industries',
                role: 'owner',
                isActive: true,
            },
        ]);
        mockCookieStore.get.mockReturnValue({
            value: 'tenant-a',
        });
        mockListOrders.mockResolvedValue([
            {
                id: 'purchase-1',
                orderType: 'purchase',
                orderNumber: 'PO-001',
                counterpartyName: 'Supplier A',
                warehouseName: 'Main Warehouse',
                status: 'draft',
                orderDate: '2026-04-02',
                outstandingQuantity: 8,
                valueSummary: '$80.00 ordered',
                nextAction: 'Confirm order',
            },
        ]);
        mockGetPurchaseOrderDetail.mockResolvedValue({
            id: 'purchase-1',
            orderType: 'purchase',
            orderNumber: 'PO-001',
            counterpartyName: 'Supplier A',
            counterpartyReference: 'SUP-A',
            warehouseId: 'warehouse-1',
            warehouseName: 'Main Warehouse',
            status: 'draft',
            linkedDates: {
                orderDate: '2026-04-02',
                expectedDate: '2026-04-04',
                receivedDate: null,
                shippedDate: null,
                createdAt: '2026-04-02T08:00:00.000Z',
            },
            valueSummary: '$80.00 ordered',
            nextAction: 'Confirm order',
            note: 'Restock brackets',
            lines: [],
            fifoPreview: null,
            ledgerEntries: [],
        });
    });

    it('renders the orders workspace inside WallShell with the orders destination active', async () => {
        const page = await OrdersPage();

        renderApp(page);

        const orderLinks = screen.getAllByRole('link', { name: /orders/i });

        expect(orderLinks).toHaveLength(2);
        expect(orderLinks[0]).toHaveAttribute('href', '/orders');
        expect(orderLinks[0]).toHaveAttribute('aria-current', 'page');
        expect(screen.getAllByText('Alpha Industries').length).toBeGreaterThan(0);
        expect(screen.getAllByText('PO-001').length).toBeGreaterThan(0);
        expect(mockListOrders).toHaveBeenCalledWith(expect.anything(), {
            tenantId: 'tenant-a',
        });
        expect(mockGetPurchaseOrderDetail).toHaveBeenCalledWith(expect.anything(), {
            tenantId: 'tenant-a',
            purchaseOrderId: 'purchase-1',
        });
    });

    it('redirects back to organization selection when no active tenant has been chosen', async () => {
        mockCookieStore.get.mockReturnValue(undefined);

        await expect(OrdersPage()).rejects.toThrow('NEXT_REDIRECT:/select-organization');
    });
});
