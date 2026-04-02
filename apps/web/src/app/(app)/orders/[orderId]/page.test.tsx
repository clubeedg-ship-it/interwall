import '@testing-library/jest-dom/vitest';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async () => import('@/test/mocks/next-navigation'));

import { renderApp, screen } from '@/test/render';

import OrderDetailPage from './page';

const {
    mockRequireUserSession,
    mockCreateServerSupabaseClient,
    mockListMembershipsForUser,
    mockCookieStore,
    mockListOrders,
    mockGetSalesOrderDetail,
} = vi.hoisted(() => ({
    mockRequireUserSession: vi.fn(),
    mockCreateServerSupabaseClient: vi.fn(),
    mockListMembershipsForUser: vi.fn(),
    mockCookieStore: {
        get: vi.fn(),
    },
    mockListOrders: vi.fn(),
    mockGetSalesOrderDetail: vi.fn(),
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
    getPurchaseOrderDetail: vi.fn(),
    getSalesOrderDetail: mockGetSalesOrderDetail,
}));

vi.mock('next/headers', () => ({
    cookies: vi.fn(() => mockCookieStore),
}));

describe('OrderDetailPage', () => {
    beforeEach(() => {
        mockRequireUserSession.mockReset();
        mockCreateServerSupabaseClient.mockReset();
        mockListMembershipsForUser.mockReset();
        mockCookieStore.get.mockReset();
        mockListOrders.mockReset();
        mockGetSalesOrderDetail.mockReset();

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
                id: 'sales-1',
                orderType: 'sales',
                orderNumber: 'SO-001',
                counterpartyName: 'Customer A',
                warehouseName: 'Main Warehouse',
                status: 'confirmed',
                orderDate: '2026-04-02',
                outstandingQuantity: 3,
                valueSummary: '$120.00 ordered',
                nextAction: 'Ship items',
            },
        ]);
        mockGetSalesOrderDetail.mockResolvedValue({
            id: 'sales-1',
            orderType: 'sales',
            orderNumber: 'SO-001',
            counterpartyName: 'Customer A',
            counterpartyReference: 'CUST-A',
            warehouseId: 'warehouse-1',
            warehouseName: 'Main Warehouse',
            status: 'confirmed',
            linkedDates: {
                orderDate: '2026-04-02',
                expectedDate: null,
                receivedDate: null,
                shippedDate: null,
                createdAt: '2026-04-02T08:00:00.000Z',
            },
            valueSummary: '$120.00 ordered',
            nextAction: 'Ship items',
            note: 'Priority order',
            lines: [],
            fifoPreview: null,
            ledgerEntries: [],
        });
    });

    it('loads the requested order detail and keeps the orders workspace active in the shell', async () => {
        const page = await OrderDetailPage({
            params: { orderId: 'sales-1' },
        });

        renderApp(page);

        expect(screen.getAllByRole('link', { name: /orders/i })[0]).toHaveAttribute(
            'aria-current',
            'page',
        );
        expect(screen.getAllByText('SO-001').length).toBeGreaterThan(0);
        expect(mockListOrders).toHaveBeenCalledWith(expect.anything(), {
            tenantId: 'tenant-a',
        });
        expect(mockGetSalesOrderDetail).toHaveBeenCalledWith(expect.anything(), {
            tenantId: 'tenant-a',
            salesOrderId: 'sales-1',
        });
    });
});
