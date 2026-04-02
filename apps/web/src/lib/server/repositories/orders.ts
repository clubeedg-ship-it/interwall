import type {
    OrderDetailLineItem,
    OrderDetailViewModel,
    OrderLedgerEntryView,
    OrderWorkspaceListItem,
    ProductRow,
    PurchaseOrderLineRow,
    PurchaseOrderRow,
    ShipmentFifoPreview,
    ShipmentFifoPreviewLot,
    ShelfRow,
    StockLotRow,
    WarehouseRow,
} from '@interwall/shared';

import { computeFifoConsumption, type FifoCandidateLot } from '../fifo';

type SalesOrderLineRow = {
    id: string;
    tenant_id: string;
    sales_order_id: string;
    product_id: string;
    quantity_ordered: number;
    quantity_shipped: number;
    unit_price: number | null;
    cost_basis_total: number | null;
    note: string | null;
    created_at: string;
    updated_at: string;
};

type SalesOrderRow = {
    id: string;
    tenant_id: string;
    order_number: string;
    warehouse_id: string;
    customer_name: string | null;
    customer_reference: string | null;
    status: 'draft' | 'confirmed' | 'partially_shipped' | 'shipped' | 'cancelled';
    order_date: string;
    expected_date: string | null;
    shipped_date: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
};

type StockLedgerEntryRow = {
    id: string;
    tenant_id: string;
    stock_lot_id: string | null;
    product_id: string;
    shelf_id: string | null;
    entry_type: 'receipt' | 'shipment' | 'adjustment' | 'relocation';
    quantity_delta: number;
    unit_cost_at_time: number | null;
    purchase_order_id: string | null;
    purchase_order_line_id: string | null;
    sales_order_id: string | null;
    sales_order_line_id: string | null;
    reason: string;
    note: string | null;
    created_at: string;
};

type QueryResult<T> = Promise<{
    data: T;
    error: { message: string } | null;
}>;

type SelectQueryBuilder<Row> = {
    eq(column: string, value: string): SelectQueryBuilder<Row>;
    in(column: string, values: string[]): SelectQueryBuilder<Row>;
    order(
        column: string,
        options?: { ascending?: boolean },
    ): QueryResult<Row[] | null>;
    single(): QueryResult<Row | null>;
    maybeSingle(): QueryResult<Row | null>;
};

type OrdersTableMap = {
    products: ProductRow;
    warehouses: WarehouseRow;
    shelves: ShelfRow;
    stock_lots: StockLotRow;
    purchase_orders: PurchaseOrderRow;
    purchase_order_lines: PurchaseOrderLineRow;
    sales_orders: SalesOrderRow;
    sales_order_lines: SalesOrderLineRow;
    stock_ledger_entries: StockLedgerEntryRow;
};

export type OrdersRepositoryClient = {
    from<Table extends keyof OrdersTableMap>(table: Table): {
        select(columns?: string): SelectQueryBuilder<OrdersTableMap[Table]>;
    };
};

export type ShipmentPreviewResult = ShipmentFifoPreview & {
    productName: string;
    shortfallMessage: string | null;
};

function requireRows<T>(
    action: string,
    result: { data: T[] | null; error: { message: string } | null },
): T[] {
    if (result.error) {
        throw new Error(`${action}: ${result.error.message}`);
    }

    return result.data ?? [];
}

function requireRow<T>(
    action: string,
    result: { data: T | null; error: { message: string } | null },
): T {
    if (result.error) {
        throw new Error(`${action}: ${result.error.message}`);
    }

    if (!result.data) {
        throw new Error(`${action}: no row was returned.`);
    }

    return result.data;
}

function formatCurrency(value: number | null): string {
    if (value === null) {
        return 'Value pending';
    }

    return `$${value.toFixed(2)}`;
}

function buildValueSummary(input: {
    quantityOrdered: number;
    unitValue: number | null;
}): string {
    if (input.unitValue === null) {
        return 'Value pending';
    }

    return `${formatCurrency(input.quantityOrdered * input.unitValue)} ordered`;
}

function buildNextPurchaseAction(status: PurchaseOrderRow['status']): string | null {
    if (status === 'draft') {
        return 'Confirm order';
    }

    if (status === 'confirmed' || status === 'partially_received') {
        return 'Receive stock';
    }

    return null;
}

function buildNextSalesAction(status: SalesOrderRow['status']): string | null {
    if (status === 'draft') {
        return 'Confirm order';
    }

    if (status === 'confirmed' || status === 'partially_shipped') {
        return 'Ship items';
    }

    return null;
}

function toOrderLedgerEntryView(input: {
    entry: StockLedgerEntryRow;
    stockLotsById: Map<string, StockLotRow>;
    orderNumber: string | null;
}): OrderLedgerEntryView {
    return {
        id: input.entry.id,
        entryType: input.entry.entry_type,
        createdAt: input.entry.created_at,
        quantityDelta: input.entry.quantity_delta,
        unitCost: input.entry.unit_cost_at_time,
        costBasisTotal:
            input.entry.unit_cost_at_time === null
                ? null
                : input.entry.unit_cost_at_time * Math.abs(input.entry.quantity_delta),
        lotReference: input.entry.stock_lot_id
            ? input.stockLotsById.get(input.entry.stock_lot_id)?.lot_reference ?? null
            : null,
        reason: input.entry.reason,
        note: input.entry.note,
        orderNumber: input.orderNumber,
    };
}

function toPurchaseLineItem(input: {
    line: PurchaseOrderLineRow;
    product: ProductRow;
}): OrderDetailLineItem {
    return {
        id: input.line.id,
        productId: input.line.product_id,
        productName: input.product.name,
        sku: input.product.sku,
        quantityOrdered: input.line.quantity_ordered,
        quantityReceived: input.line.quantity_received,
        quantityShipped: 0,
        outstandingQuantity: input.line.quantity_ordered - input.line.quantity_received,
        unitCost: input.line.unit_cost,
        unitPrice: null,
        note: input.line.note,
    };
}

function toSalesLineItem(input: {
    line: SalesOrderLineRow;
    product: ProductRow;
}): OrderDetailLineItem {
    return {
        id: input.line.id,
        productId: input.line.product_id,
        productName: input.product.name,
        sku: input.product.sku,
        quantityOrdered: input.line.quantity_ordered,
        quantityReceived: 0,
        quantityShipped: input.line.quantity_shipped,
        outstandingQuantity: input.line.quantity_ordered - input.line.quantity_shipped,
        unitCost: null,
        unitPrice: input.line.unit_price,
        note: input.line.note,
    };
}

async function listProductsByTenant(
    client: OrdersRepositoryClient,
    tenantId: string,
): Promise<ProductRow[]> {
    return requireRows(
        'Unable to list products for the active tenant',
        await client.from('products').select('*').eq('tenant_id', tenantId).order('sku'),
    );
}

async function listWarehousesByTenant(
    client: OrdersRepositoryClient,
    tenantId: string,
): Promise<WarehouseRow[]> {
    return requireRows(
        'Unable to list warehouses for the active tenant',
        await client
            .from('warehouses')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('sort_order'),
    );
}

async function listStockLotsByTenant(
    client: OrdersRepositoryClient,
    tenantId: string,
): Promise<StockLotRow[]> {
    return requireRows(
        'Unable to list stock lots for the active tenant',
        await client
            .from('stock_lots')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('received_at', { ascending: true }),
    );
}

async function listShelvesByTenant(
    client: OrdersRepositoryClient,
    tenantId: string,
): Promise<ShelfRow[]> {
    return requireRows(
        'Unable to list shelves for the active tenant',
        await client.from('shelves').select('*').eq('tenant_id', tenantId).order('sort_order'),
    );
}

async function listPurchaseOrdersByTenant(
    client: OrdersRepositoryClient,
    tenantId: string,
): Promise<PurchaseOrderRow[]> {
    return requireRows(
        'Unable to list purchase orders for the active tenant',
        await client
            .from('purchase_orders')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('updated_at', { ascending: false }),
    );
}

async function listPurchaseOrderLinesByTenant(
    client: OrdersRepositoryClient,
    tenantId: string,
): Promise<PurchaseOrderLineRow[]> {
    return requireRows(
        'Unable to list purchase order lines for the active tenant',
        await client
            .from('purchase_order_lines')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true }),
    );
}

async function listSalesOrdersByTenant(
    client: OrdersRepositoryClient,
    tenantId: string,
): Promise<SalesOrderRow[]> {
    return requireRows(
        'Unable to list sales orders for the active tenant',
        await client
            .from('sales_orders')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('updated_at', { ascending: false }),
    );
}

async function listSalesOrderLinesByTenant(
    client: OrdersRepositoryClient,
    tenantId: string,
): Promise<SalesOrderLineRow[]> {
    return requireRows(
        'Unable to list sales order lines for the active tenant',
        await client
            .from('sales_order_lines')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true }),
    );
}

async function listLedgerEntriesByTenant(
    client: OrdersRepositoryClient,
    tenantId: string,
): Promise<StockLedgerEntryRow[]> {
    return requireRows(
        'Unable to list stock ledger entries for the active tenant',
        await client
            .from('stock_ledger_entries')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true }),
    );
}

export async function listOrders(
    client: OrdersRepositoryClient,
    input: { tenantId: string },
): Promise<OrderWorkspaceListItem[]> {
    const [warehouses, purchaseOrders, purchaseLines, salesOrders, salesLines] = await Promise.all([
        listWarehousesByTenant(client, input.tenantId),
        listPurchaseOrdersByTenant(client, input.tenantId),
        listPurchaseOrderLinesByTenant(client, input.tenantId),
        listSalesOrdersByTenant(client, input.tenantId),
        listSalesOrderLinesByTenant(client, input.tenantId),
    ]);

    const warehousesById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    const purchaseLinesByOrderId = new Map<string, PurchaseOrderLineRow[]>();
    const salesLinesByOrderId = new Map<string, SalesOrderLineRow[]>();

    for (const line of purchaseLines) {
        purchaseLinesByOrderId.set(line.purchase_order_id, [
            ...(purchaseLinesByOrderId.get(line.purchase_order_id) ?? []),
            line,
        ]);
    }

    for (const line of salesLines) {
        salesLinesByOrderId.set(line.sales_order_id, [
            ...(salesLinesByOrderId.get(line.sales_order_id) ?? []),
            line,
        ]);
    }

    const purchaseItems: Array<OrderWorkspaceListItem & { updatedAt: string }> = purchaseOrders.map(
        (order) => {
            const lines = purchaseLinesByOrderId.get(order.id) ?? [];
            const quantityOrdered = lines.reduce((sum, line) => sum + line.quantity_ordered, 0);
            const quantityReceived = lines.reduce((sum, line) => sum + line.quantity_received, 0);
            const unitValues = lines.map((line) => line.unit_cost);
            const summaryValue =
                unitValues.some((value) => value === null)
                    ? null
                    : lines.reduce(
                          (sum, line) => sum + line.quantity_ordered * (line.unit_cost ?? 0),
                          0,
                      );

            return {
                id: order.id,
                orderType: 'purchase',
                orderNumber: order.order_number,
                counterpartyName: order.supplier_name,
                warehouseName: warehousesById.get(order.warehouse_id)?.name ?? 'Unknown warehouse',
                status: order.status,
                orderDate: order.order_date,
                outstandingQuantity: quantityOrdered - quantityReceived,
                valueSummary: buildValueSummary({
                    quantityOrdered: 1,
                    unitValue: summaryValue,
                }),
                nextAction: buildNextPurchaseAction(order.status),
                updatedAt: order.updated_at,
            };
        },
    );

    const salesItems: Array<OrderWorkspaceListItem & { updatedAt: string }> = salesOrders.map(
        (order) => {
            const lines = salesLinesByOrderId.get(order.id) ?? [];
            const quantityOrdered = lines.reduce((sum, line) => sum + line.quantity_ordered, 0);
            const quantityShipped = lines.reduce((sum, line) => sum + line.quantity_shipped, 0);
            const unitValues = lines.map((line) => line.unit_price);
            const summaryValue =
                unitValues.some((value) => value === null)
                    ? null
                    : lines.reduce(
                          (sum, line) => sum + line.quantity_ordered * (line.unit_price ?? 0),
                          0,
                      );

            return {
                id: order.id,
                orderType: 'sales',
                orderNumber: order.order_number,
                counterpartyName: order.customer_name,
                warehouseName: warehousesById.get(order.warehouse_id)?.name ?? 'Unknown warehouse',
                status: order.status,
                orderDate: order.order_date,
                outstandingQuantity: quantityOrdered - quantityShipped,
                valueSummary: buildValueSummary({
                    quantityOrdered: 1,
                    unitValue: summaryValue,
                }),
                nextAction: buildNextSalesAction(order.status),
                updatedAt: order.updated_at,
            };
        },
    );

    return [...purchaseItems, ...salesItems]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(({ updatedAt: _updatedAt, ...item }) => item);
}

export async function listOrderLedgerEntries(
    client: OrdersRepositoryClient,
    input: {
        tenantId: string;
        purchaseOrderId?: string;
        salesOrderId?: string;
    },
): Promise<OrderLedgerEntryView[]> {
    const [ledgerEntries, stockLots, purchaseOrders, salesOrders] = await Promise.all([
        listLedgerEntriesByTenant(client, input.tenantId),
        listStockLotsByTenant(client, input.tenantId),
        listPurchaseOrdersByTenant(client, input.tenantId),
        listSalesOrdersByTenant(client, input.tenantId),
    ]);

    const stockLotsById = new Map(stockLots.map((stockLot) => [stockLot.id, stockLot]));
    const purchaseOrdersById = new Map(purchaseOrders.map((order) => [order.id, order]));
    const salesOrdersById = new Map(salesOrders.map((order) => [order.id, order]));

    return ledgerEntries
        .filter((entry) =>
            input.purchaseOrderId
                ? entry.purchase_order_id === input.purchaseOrderId
                : entry.sales_order_id === input.salesOrderId,
        )
        .sort((left, right) => left.created_at.localeCompare(right.created_at))
        .map((entry) =>
            toOrderLedgerEntryView({
                entry,
                stockLotsById,
                orderNumber:
                    entry.purchase_order_id
                        ? purchaseOrdersById.get(entry.purchase_order_id)?.order_number ?? null
                        : salesOrdersById.get(entry.sales_order_id ?? '')?.order_number ?? null,
            }),
        );
}

export async function getPurchaseOrderDetail(
    client: OrdersRepositoryClient,
    input: { tenantId: string; purchaseOrderId: string },
): Promise<OrderDetailViewModel> {
    const [order, warehouses, products, purchaseLines, ledgerEntries] = await Promise.all([
        requireRow(
            'Unable to load the requested purchase order',
            await client
                .from('purchase_orders')
                .select('*')
                .eq('tenant_id', input.tenantId)
                .eq('id', input.purchaseOrderId)
                .maybeSingle(),
        ),
        listWarehousesByTenant(client, input.tenantId),
        listProductsByTenant(client, input.tenantId),
        listPurchaseOrderLinesByTenant(client, input.tenantId),
        listOrderLedgerEntries(client, {
            tenantId: input.tenantId,
            purchaseOrderId: input.purchaseOrderId,
        }),
    ]);

    const warehousesById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    const productsById = new Map(products.map((product) => [product.id, product]));
    const lines = purchaseLines
        .filter((line) => line.purchase_order_id === order.id)
        .map((line) => toPurchaseLineItem({ line, product: productsById.get(line.product_id)! }));
    const summaryValue =
        lines.some((line) => line.unitCost === null)
            ? null
            : lines.reduce(
                  (sum, line) => sum + line.quantityOrdered * (line.unitCost ?? 0),
                  0,
              );

    return {
        id: order.id,
        orderType: 'purchase',
        orderNumber: order.order_number,
        counterpartyName: order.supplier_name,
        warehouseName: warehousesById.get(order.warehouse_id)?.name ?? 'Unknown warehouse',
        status: order.status,
        linkedDates: {
            orderDate: order.order_date,
            expectedDate: order.expected_date,
            receivedDate: order.received_date,
            shippedDate: null,
            createdAt: order.created_at,
        },
        valueSummary: buildValueSummary({
            quantityOrdered: 1,
            unitValue: summaryValue,
        }),
        nextAction: buildNextPurchaseAction(order.status),
        note: order.note,
        lines,
        fifoPreview: null,
        ledgerEntries,
    };
}

export async function getSalesOrderDetail(
    client: OrdersRepositoryClient,
    input: { tenantId: string; salesOrderId: string },
): Promise<OrderDetailViewModel> {
    const [order, warehouses, products, salesLines, ledgerEntries] = await Promise.all([
        requireRow(
            'Unable to load the requested sales order',
            await client
                .from('sales_orders')
                .select('*')
                .eq('tenant_id', input.tenantId)
                .eq('id', input.salesOrderId)
                .maybeSingle(),
        ),
        listWarehousesByTenant(client, input.tenantId),
        listProductsByTenant(client, input.tenantId),
        listSalesOrderLinesByTenant(client, input.tenantId),
        listOrderLedgerEntries(client, {
            tenantId: input.tenantId,
            salesOrderId: input.salesOrderId,
        }),
    ]);

    const warehousesById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    const productsById = new Map(products.map((product) => [product.id, product]));
    const lines = salesLines
        .filter((line) => line.sales_order_id === order.id)
        .map((line) => toSalesLineItem({ line, product: productsById.get(line.product_id)! }));
    const summaryValue =
        lines.some((line) => line.unitPrice === null)
            ? null
            : lines.reduce(
                  (sum, line) => sum + line.quantityOrdered * (line.unitPrice ?? 0),
                  0,
              );

    return {
        id: order.id,
        orderType: 'sales',
        orderNumber: order.order_number,
        counterpartyName: order.customer_name,
        warehouseName: warehousesById.get(order.warehouse_id)?.name ?? 'Unknown warehouse',
        status: order.status,
        linkedDates: {
            orderDate: order.order_date,
            expectedDate: null,
            receivedDate: null,
            shippedDate: order.shipped_date,
            createdAt: order.created_at,
        },
        valueSummary: buildValueSummary({
            quantityOrdered: 1,
            unitValue: summaryValue,
        }),
        nextAction: buildNextSalesAction(order.status),
        note: order.note,
        lines,
        fifoPreview: null,
        ledgerEntries,
    };
}

export async function getShipmentPreview(
    client: OrdersRepositoryClient,
    input: {
        tenantId: string;
        salesOrderLineId: string;
        quantityShipped: number;
    },
): Promise<ShipmentPreviewResult> {
    const [line, salesOrders, products, stockLots, shelves] = await Promise.all([
        requireRow(
            'Unable to load the requested sales order line',
            await client
                .from('sales_order_lines')
                .select('*')
                .eq('tenant_id', input.tenantId)
                .eq('id', input.salesOrderLineId)
                .maybeSingle(),
        ),
        listSalesOrdersByTenant(client, input.tenantId),
        listProductsByTenant(client, input.tenantId),
        listStockLotsByTenant(client, input.tenantId),
        listShelvesByTenant(client, input.tenantId),
    ]);

    const order = salesOrders.find((candidate) => candidate.id === line.sales_order_id);

    if (!order) {
        throw new Error('Unable to load the sales order for shipment preview.');
    }

    const product = products.find((candidate) => candidate.id === line.product_id);

    if (!product) {
        throw new Error('Unable to load the product for shipment preview.');
    }

    const shelvesById = new Map(shelves.map((shelf) => [shelf.id, shelf]));
    const fifoLots: Array<FifoCandidateLot & { quantityAvailable: number }> = stockLots
        .filter((stockLot) => stockLot.product_id === line.product_id)
        .filter((stockLot) => stockLot.quantity_on_hand > 0)
        .filter((stockLot) => {
            const shelf = shelvesById.get(stockLot.shelf_id);
            return shelf?.warehouse_id === order.warehouse_id;
        })
        .sort((left, right) => left.received_at.localeCompare(right.received_at))
        .map((stockLot) => ({
            id: stockLot.id,
            quantity_on_hand: stockLot.quantity_on_hand,
            quantityAvailable: stockLot.quantity_on_hand,
            received_at: stockLot.received_at,
            unit_cost: stockLot.unit_cost,
            lot_reference: stockLot.lot_reference,
        }));

    const fifoResult = computeFifoConsumption(fifoLots, input.quantityShipped);
    const lotsById = new Map(fifoLots.map((lot) => [lot.id, lot]));
    const lots: ShipmentFifoPreviewLot[] = fifoResult.consumed.map((slice) => {
        const lot = lotsById.get(slice.stockLotId);

        if (!lot) {
            throw new Error('Unable to map shipment preview lot details.');
        }

        return {
            stockLotId: slice.stockLotId,
            lotReference: lot.lot_reference,
            receivedAt: lot.received_at,
            quantityAvailable: lot.quantityAvailable,
            quantityConsumed: slice.quantityConsumed,
            unitCost: slice.unitCost,
        };
    });

    return {
        lineItemId: line.id,
        productId: line.product_id,
        requestedQuantity: input.quantityShipped,
        productName: product.name,
        totalCost: fifoResult.totalCost,
        remainingDemand: fifoResult.remainingDemand,
        shortfallMessage:
            fifoResult.remainingDemand > 0
                ? `Insufficient stock for ${product.name}. Short by ${fifoResult.remainingDemand} units.`
                : null,
        lots,
    };
}
