import '@testing-library/jest-dom/vitest';

import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    OrderDetailViewModel,
    OrderWorkspaceListItem,
} from '@interwall/shared';

import { renderApp, screen } from '@/test/render';

const {
    mockCreatePurchaseOrderAction,
    mockUpdatePurchaseOrderAction,
    mockCreateSalesOrderAction,
    mockUpdateSalesOrderAction,
    mockConfirmPurchaseOrderAction,
    mockCancelPurchaseOrderAction,
} = vi.hoisted(() => ({
    mockCreatePurchaseOrderAction: vi.fn(),
    mockUpdatePurchaseOrderAction: vi.fn(),
    mockCreateSalesOrderAction: vi.fn(),
    mockUpdateSalesOrderAction: vi.fn(),
    mockConfirmPurchaseOrderAction: vi.fn(),
    mockCancelPurchaseOrderAction: vi.fn(),
}));

vi.mock('@/app/(app)/orders/actions', () => ({
    createPurchaseOrderAction: mockCreatePurchaseOrderAction,
    updatePurchaseOrderAction: mockUpdatePurchaseOrderAction,
    createSalesOrderAction: mockCreateSalesOrderAction,
    updateSalesOrderAction: mockUpdateSalesOrderAction,
    confirmPurchaseOrderAction: mockConfirmPurchaseOrderAction,
    confirmSalesOrderAction: vi.fn(),
    cancelPurchaseOrderAction: mockCancelPurchaseOrderAction,
    cancelSalesOrderAction: vi.fn(),
}));

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
};

describe('OrderWorkspaceScreen', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreatePurchaseOrderAction.mockResolvedValue(undefined);
        mockUpdatePurchaseOrderAction.mockResolvedValue(undefined);
        mockCreateSalesOrderAction.mockResolvedValue(undefined);
        mockUpdateSalesOrderAction.mockResolvedValue(undefined);
        mockConfirmPurchaseOrderAction.mockResolvedValue(undefined);
        mockCancelPurchaseOrderAction.mockResolvedValue(undefined);
    });

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
        expect(screen.getAllByText('PO-001')).toHaveLength(2);
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
        expect(screen.getAllByText('Draft')).toHaveLength(2);
        expect(screen.getAllByText('2026-04-02').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Main Warehouse').length).toBeGreaterThan(0);
        expect(screen.getByText('8 open')).toBeInTheDocument();
        expect(screen.getAllByText('$80.00 ordered').length).toBeGreaterThan(0);
    });

    it('shows exactly one primary next action in the detail header for a draft order', () => {
        renderApp(
            <OrderWorkspaceScreen
                orders={orders}
                selectedOrder={selectedOrder}
            />,
        );

        expect(screen.getByTestId('primary-order-action')).toHaveTextContent('Confirm order');
        expect(screen.getByText('Purchase order')).toBeInTheDocument();
        expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
        expect(screen.getByDisplayValue('2026-04-04')).toBeInTheDocument();
        expect(screen.getByText('Cancel order')).toBeInTheDocument();
    });

    it('submits purchase order create and update flows through the matching server actions', async () => {
        const { user } = renderApp(
            <OrderWorkspaceScreen
                orders={orders}
                selectedOrder={selectedOrder}
            />,
        );

        await user.click(screen.getByRole('button', { name: /new purchase order/i }));
        await user.type(screen.getByLabelText('Order number'), 'PO-500');
        await user.type(screen.getByLabelText('Supplier name'), 'Supplier New');
        await user.type(screen.getByLabelText('Supplier reference'), 'SUP-500');
        await user.type(screen.getByLabelText('Warehouse ID'), 'warehouse-9');
        fireEvent.change(screen.getByLabelText('Order date'), {
            target: { value: '2026-04-10' },
        });
        fireEvent.change(screen.getByLabelText('Expected date'), {
            target: { value: '2026-04-12' },
        });
        await user.click(screen.getByRole('button', { name: 'Create order' }));

        expect(mockCreatePurchaseOrderAction).toHaveBeenCalledWith(
            expect.objectContaining({
                orderNumber: 'PO-500',
                supplierName: 'Supplier New',
                supplierReference: 'SUP-500',
                warehouseId: 'warehouse-9',
                orderDate: '2026-04-10',
                expectedDate: '2026-04-12',
            }),
        );

        await user.clear(screen.getByLabelText('Supplier name'));
        await user.type(screen.getByLabelText('Supplier name'), 'Supplier Updated');
        await user.click(screen.getByRole('button', { name: 'Save draft' }));

        expect(mockUpdatePurchaseOrderAction).toHaveBeenCalledWith(
            expect.objectContaining({
                purchaseOrderId: 'purchase-1',
                supplierName: 'Supplier Updated',
            }),
        );
    });

    it('submits sales order create and update flows through the matching server actions', async () => {
        const salesDraft: OrderDetailViewModel = {
            ...selectedOrder,
            id: 'sales-1',
            orderType: 'sales',
            orderNumber: 'SO-001',
            counterpartyName: 'Customer A',
            counterpartyReference: 'CUST-A',
            warehouseId: 'warehouse-2',
            warehouseName: 'Overflow Warehouse',
            status: 'draft',
            nextAction: 'Confirm order',
        };
        const { user } = renderApp(
            <OrderWorkspaceScreen
                orders={orders}
                selectedOrder={salesDraft}
            />,
        );

        await user.click(screen.getByRole('button', { name: /new sales order/i }));
        await user.type(screen.getByLabelText('Order number'), 'SO-700');
        await user.type(screen.getByLabelText('Customer name'), 'Customer New');
        await user.type(screen.getByLabelText('Customer reference'), 'CUST-700');
        await user.type(screen.getByLabelText('Warehouse ID'), 'warehouse-7');
        fireEvent.change(screen.getByLabelText('Order date'), {
            target: { value: '2026-04-11' },
        });
        await user.click(screen.getByRole('button', { name: 'Create order' }));

        expect(mockCreateSalesOrderAction).toHaveBeenCalledWith(
            expect.objectContaining({
                orderNumber: 'SO-700',
                customerName: 'Customer New',
                customerReference: 'CUST-700',
                warehouseId: 'warehouse-7',
                orderDate: '2026-04-11',
            }),
        );

        await user.clear(screen.getByLabelText('Customer name'));
        await user.type(screen.getByLabelText('Customer name'), 'Customer Updated');
        await user.click(screen.getByRole('button', { name: 'Save draft' }));

        expect(mockUpdateSalesOrderAction).toHaveBeenCalledWith(
            expect.objectContaining({
                salesOrderId: 'sales-1',
                customerName: 'Customer Updated',
            }),
        );
    });

    it('allows draft line editing while keeping non-draft fulfilled quantities read-only', async () => {
        const { user, rerender } = renderApp(
            <OrderWorkspaceScreen
                orders={orders}
                selectedOrder={selectedOrder}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Add line item' }));
        expect(screen.getByLabelText('Product ID 1')).toBeInTheDocument();

        await user.type(screen.getByLabelText('Product ID 1'), 'product-2');
        await user.click(screen.getByRole('button', { name: 'Remove line item 1' }));
        expect(screen.queryByLabelText('Product ID 1')).not.toBeInTheDocument();

        rerender(
            <OrderWorkspaceScreen
                orders={orders}
                selectedOrder={{
                    ...selectedOrder,
                    status: 'confirmed',
                    nextAction: 'Cancel order',
                    lines: [
                        {
                            id: 'line-1',
                            productId: 'product-1',
                            productName: 'Anchor Bracket',
                            sku: 'AB-001',
                            quantityOrdered: 10,
                            quantityReceived: 4,
                            quantityShipped: 0,
                            outstandingQuantity: 6,
                            unitCost: 2.5,
                            unitPrice: null,
                            note: 'Received partially',
                        },
                    ],
                }}
            />,
        );

        expect(screen.getByText('Fulfilled quantity')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /remove line item/i }),
        ).not.toBeInTheDocument();
    });
});
