import '@testing-library/jest-dom/vitest';

import { describe, expect, it } from 'vitest';

import type {
    OrderDetailViewModel,
    OrderWorkspaceListItem,
} from '@interwall/shared';

import { renderApp, screen } from '@/test/render';

import { OrderWorkspaceScreen } from './order-workspace-screen';

const orders: OrderWorkspaceListItem[] = [
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
    {
        id: 'sales-1',
        orderType: 'sales',
        orderNumber: 'SO-001',
        counterpartyName: 'Customer A',
        warehouseName: 'Overflow Warehouse',
        status: 'confirmed',
        orderDate: '2026-04-03',
        outstandingQuantity: 3,
        valueSummary: '$120.00 ordered',
        nextAction: 'Ship items',
    },
];

const selectedOrder: OrderDetailViewModel = {
    id: 'purchase-1',
    orderType: 'purchase',
    orderNumber: 'PO-001',
    counterpartyName: 'Supplier A',
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
};

describe('OrderWorkspaceScreen', () => {
    it('renders a split-pane workspace with the list and active detail regions', () => {
        renderApp(
            <OrderWorkspaceScreen
                orders={orders}
                selectedOrder={selectedOrder}
            />,
        );

        expect(
            screen.getByRole('region', { name: /orders list/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('complementary', { name: /order detail/i }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('orders-workspace-layout')).toHaveClass('xl:grid-cols-[22rem_minmax(0,1fr)]');
        expect(screen.getByText('PO-001')).toBeInTheDocument();
        expect(screen.getByText('SO-001')).toBeInTheDocument();
    });

    it('renders the exact row fields required by the orders workspace contract', () => {
        renderApp(
            <OrderWorkspaceScreen
                orders={orders}
                selectedOrder={selectedOrder}
            />,
        );

        expect(screen.getByText('Supplier A')).toBeInTheDocument();
        expect(screen.getByText('Draft')).toBeInTheDocument();
        expect(screen.getByText('2026-04-02')).toBeInTheDocument();
        expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
        expect(screen.getByText('8 open')).toBeInTheDocument();
        expect(screen.getByText('$80.00 ordered')).toBeInTheDocument();
    });
});
