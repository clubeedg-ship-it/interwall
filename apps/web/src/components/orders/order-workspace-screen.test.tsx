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
    mockReceivePurchaseOrderLineAction,
    mockLoadShipmentPreviewAction,
    mockShipSalesOrderLineAction,
    mockCancelPurchaseOrderAction,
} = vi.hoisted(() => ({
    mockCreatePurchaseOrderAction: vi.fn(),
    mockUpdatePurchaseOrderAction: vi.fn(),
    mockCreateSalesOrderAction: vi.fn(),
    mockUpdateSalesOrderAction: vi.fn(),
    mockConfirmPurchaseOrderAction: vi.fn(),
    mockReceivePurchaseOrderLineAction: vi.fn(),
    mockLoadShipmentPreviewAction: vi.fn(),
    mockShipSalesOrderLineAction: vi.fn(),
    mockCancelPurchaseOrderAction: vi.fn(),
}));

vi.mock('@/app/(app)/orders/actions', () => ({
    createPurchaseOrderAction: mockCreatePurchaseOrderAction,
    updatePurchaseOrderAction: mockUpdatePurchaseOrderAction,
    createSalesOrderAction: mockCreateSalesOrderAction,
    updateSalesOrderAction: mockUpdateSalesOrderAction,
    confirmPurchaseOrderAction: mockConfirmPurchaseOrderAction,
    receivePurchaseOrderLineAction: mockReceivePurchaseOrderLineAction,
    confirmSalesOrderAction: vi.fn(),
    loadShipmentPreviewAction: mockLoadShipmentPreviewAction,
    shipSalesOrderLineAction: mockShipSalesOrderLineAction,
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

const salesOrder: OrderDetailViewModel = {
    ...selectedOrder,
    id: 'sales-1',
    orderType: 'sales',
    orderNumber: 'SO-001',
    counterpartyName: 'Customer A',
    counterpartyReference: 'CUST-A',
    warehouseId: 'warehouse-2',
    warehouseName: 'Overflow Warehouse',
    status: 'confirmed',
    nextAction: 'Ship items',
    linkedDates: {
        orderDate: '2026-04-03',
        expectedDate: '2026-04-05',
        receivedDate: null,
        shippedDate: null,
        createdAt: '2026-04-03T08:00:00.000Z',
    },
    valueSummary: '$120.00 ordered',
    lines: [
        {
            id: 'sales-line-1',
            productId: 'product-1',
            productName: 'Anchor Bracket',
            sku: 'AB-001',
            quantityOrdered: 6,
            quantityReceived: 0,
            quantityShipped: 0,
            outstandingQuantity: 6,
            unitCost: null,
            unitPrice: 30,
            note: 'Rush shipment',
        },
    ],
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
        mockReceivePurchaseOrderLineAction.mockResolvedValue(undefined);
        mockLoadShipmentPreviewAction.mockResolvedValue({
            lineItemId: 'sales-line-1',
            productId: 'product-1',
            productName: 'Anchor Bracket',
            requestedQuantity: 6,
            remainingDemand: 0,
            shortfallMessage: null,
            totalCost: 45,
            lots: [
                {
                    stockLotId: 'lot-1',
                    lotReference: 'LOT-001',
                    receivedAt: '2026-03-01T10:00:00.000Z',
                    quantityAvailable: 4,
                    quantityConsumed: 4,
                    unitCost: 7.5,
                },
            ],
        });
        mockShipSalesOrderLineAction.mockResolvedValue(undefined);
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

    it('opens a focused receive task surface with remaining quantity, destination context, and receive submission', async () => {
        const receivingOrder: OrderDetailViewModel = {
            ...selectedOrder,
            status: 'confirmed',
            nextAction: 'Receive stock',
            lines: [
                {
                    id: 'purchase-line-1',
                    productId: 'product-1',
                    productName: 'Anchor Bracket',
                    sku: 'AB-001',
                    quantityOrdered: 10,
                    quantityReceived: 4,
                    quantityShipped: 0,
                    outstandingQuantity: 6,
                    unitCost: 2.5,
                    unitPrice: null,
                    note: 'Dock intake',
                },
            ],
        };
        const { user } = renderApp(
            <OrderWorkspaceScreen
                orders={orders}
                selectedOrder={receivingOrder}
            />,
        );

        await user.click(screen.getByTestId('primary-order-action'));

        expect(screen.getByText('Receive stock')).toBeInTheDocument();
        expect(screen.getByText('6 units remaining')).toBeInTheDocument();
        expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
        expect(screen.getByLabelText('Destination shelf')).toBeInTheDocument();

        await user.type(screen.getByLabelText('Quantity to receive'), '5');
        await user.type(screen.getByLabelText('Destination shelf'), 'shelf-1');
        fireEvent.change(screen.getByLabelText('Received at'), {
            target: { value: '2026-04-05T10:00' },
        });
        await user.click(screen.getByRole('button', { name: 'Receive stock' }));

        expect(mockReceivePurchaseOrderLineAction).toHaveBeenCalledWith(
            expect.objectContaining({
                purchaseOrderId: 'purchase-1',
                purchaseOrderLineId: 'purchase-line-1',
                quantityReceived: 5,
                shelfId: 'shelf-1',
            }),
        );
    });

    it('loads a FIFO preview before ship confirmation and enables shipping only when there is no shortfall', async () => {
        const { user } = renderApp(
            <OrderWorkspaceScreen
                orders={orders}
                selectedOrder={salesOrder}
            />,
        );

        await user.click(screen.getByTestId('primary-order-action'));
        await user.clear(screen.getByLabelText('Quantity to ship'));
        await user.type(screen.getByLabelText('Quantity to ship'), '6');
        await user.click(screen.getByRole('button', { name: 'Review shipment' }));

        expect(mockLoadShipmentPreviewAction).toHaveBeenCalledWith({
            salesOrderId: 'sales-1',
            salesOrderLineId: 'sales-line-1',
            quantityShipped: 6,
        });
        expect(screen.getByText('Total cost basis')).toBeInTheDocument();
        expect(screen.getByText('LOT-001')).toBeInTheDocument();

        const shipButton = screen.getByRole('button', { name: 'Ship items' });
        expect(shipButton).toBeEnabled();

        await user.click(shipButton);

        expect(mockShipSalesOrderLineAction).toHaveBeenCalledWith({
            salesOrderId: 'sales-1',
            salesOrderLineId: 'sales-line-1',
            quantityShipped: 6,
            note: '',
        });
    });

    it('renders the exact backend shortfall message inline and blocks shipment when stock is insufficient', async () => {
        mockLoadShipmentPreviewAction.mockResolvedValueOnce({
            lineItemId: 'sales-line-1',
            productId: 'product-1',
            productName: 'Anchor Bracket',
            requestedQuantity: 6,
            remainingDemand: 2,
            shortfallMessage: 'Insufficient stock for Anchor Bracket. Short by 2 units.',
            totalCost: 30,
            lots: [
                {
                    stockLotId: 'lot-1',
                    lotReference: 'LOT-001',
                    receivedAt: '2026-03-01T10:00:00.000Z',
                    quantityAvailable: 4,
                    quantityConsumed: 4,
                    unitCost: 7.5,
                },
            ],
        });
        const { user } = renderApp(
            <OrderWorkspaceScreen
                orders={orders}
                selectedOrder={salesOrder}
            />,
        );

        await user.click(screen.getByTestId('primary-order-action'));
        await user.clear(screen.getByLabelText('Quantity to ship'));
        await user.type(screen.getByLabelText('Quantity to ship'), '6');
        await user.click(screen.getByRole('button', { name: 'Review shipment' }));

        expect(
            screen.getByText('Insufficient stock for Anchor Bracket. Short by 2 units.'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Ship items' })).toBeDisabled();
    });
});
