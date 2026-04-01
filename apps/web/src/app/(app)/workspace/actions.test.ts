import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockGetProductByBarcodeOrSku,
    mockListStockLotsByProduct,
    mockCreateStockLot,
    mockAdjustStockLot,
    mockRelocateStockLot,
    mockRequireUserSession,
    mockCreateServerSupabaseClient,
    mockListMembershipsForUser,
    mockCookieStore,
} = vi.hoisted(() => ({
    mockGetProductByBarcodeOrSku: vi.fn(),
    mockListStockLotsByProduct: vi.fn(),
    mockCreateStockLot: vi.fn(),
    mockAdjustStockLot: vi.fn(),
    mockRelocateStockLot: vi.fn(),
    mockRequireUserSession: vi.fn(),
    mockCreateServerSupabaseClient: vi.fn(),
    mockListMembershipsForUser: vi.fn(),
    mockCookieStore: {
        get: vi.fn(),
    },
}));

vi.mock('@/lib/server/repositories/inventory', () => ({
    getProductByBarcodeOrSku: mockGetProductByBarcodeOrSku,
    listStockLotsByProduct: mockListStockLotsByProduct,
}));

vi.mock('@/lib/server/inventory-mutations', () => ({
    createStockLot: mockCreateStockLot,
    adjustStockLot: mockAdjustStockLot,
    relocateStockLot: mockRelocateStockLot,
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

import {
    scanBarcodeAction,
    createStockLotAction,
    adjustStockLotAction,
    relocateStockLotAction,
} from './actions';

function setupActiveTenant() {
    mockRequireUserSession.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
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

describe('scanBarcodeAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupActiveTenant();
    });

    it('returns a product match with lot inventory when the barcode matches an existing product', async () => {
        mockGetProductByBarcodeOrSku.mockResolvedValue({
            id: 'product-1',
            tenant_id: 'tenant-1',
            sku: 'AB-001',
            barcode: '1234567890',
            name: 'Anchor Bracket',
            description: null,
            unit_of_measure: 'ea',
            reorder_point: 10,
            safety_stock: 2,
            lead_time_days: 5,
            reorder_enabled: true,
            preferred_storage_note: null,
            default_cost_basis: 12,
            tracking_mode: 'lot',
            status: 'active',
            archived_at: null,
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
        });
        mockListStockLotsByProduct.mockResolvedValue([
            {
                id: 'lot-1',
                tenant_id: 'tenant-1',
                product_id: 'product-1',
                shelf_id: 'shelf-1',
                original_quantity: 20,
                quantity_on_hand: 15,
                received_at: '2026-03-15T00:00:00.000Z',
                unit_cost: 12,
                lot_reference: 'LOT-001',
                supplier_reference: 'SUP-A',
                notes: null,
                created_at: '2026-03-15T00:00:00.000Z',
                updated_at: '2026-03-15T00:00:00.000Z',
            },
        ]);

        const result = await scanBarcodeAction({ code: '1234567890' });

        expect(result.outcome).toBe('match');
        if (result.outcome === 'match') {
            expect(result.product.id).toBe('product-1');
            expect(result.product.name).toBe('Anchor Bracket');
            expect(result.lots).toHaveLength(1);
            expect(result.lots[0].id).toBe('lot-1');
        }
    });

    it('returns a create-stock draft when the barcode does not match any product', async () => {
        mockGetProductByBarcodeOrSku.mockResolvedValue(null);

        const result = await scanBarcodeAction({ code: 'NEW-BARCODE-123' });

        expect(result.outcome).toBe('draft');
        if (result.outcome === 'draft') {
            expect(result.draft.barcode).toBe('NEW-BARCODE-123');
            expect(result.draft.sku).toBeNull();
            expect(result.draft.ean).toBeNull();
            expect(result.draft.shelfId).toBeNull();
        }
    });

    it('returns a create-stock draft with shelf context when provided', async () => {
        mockGetProductByBarcodeOrSku.mockResolvedValue(null);

        const result = await scanBarcodeAction({
            code: 'SHELF-SCAN-123',
            shelfId: 'shelf-a1',
        });

        expect(result.outcome).toBe('draft');
        if (result.outcome === 'draft') {
            expect(result.draft.barcode).toBe('SHELF-SCAN-123');
            expect(result.draft.shelfId).toBe('shelf-a1');
        }
    });

    it('rejects empty or whitespace-only barcode input', async () => {
        const result = await scanBarcodeAction({ code: '   ' });

        expect(result.outcome).toBe('error');
        if (result.outcome === 'error') {
            expect(result.message).toBeTruthy();
        }
    });

    it('trims whitespace from wedge input before lookup', async () => {
        mockGetProductByBarcodeOrSku.mockResolvedValue(null);

        await scanBarcodeAction({ code: '  TRIMMED-CODE  ' });

        expect(mockGetProductByBarcodeOrSku).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ code: 'TRIMMED-CODE' }),
        );
    });
});

describe('createStockLotAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupActiveTenant();
    });

    it('delegates to the inventory mutation wrapper with tenant context', async () => {
        const mockResult = {
            stockLot: {
                id: 'lot-new',
                tenant_id: 'tenant-1',
                product_id: 'product-1',
                shelf_id: 'shelf-1',
                original_quantity: 10,
                quantity_on_hand: 10,
                received_at: '2026-04-01T00:00:00.000Z',
                unit_cost: 5.0,
                lot_reference: 'LOT-NEW',
                supplier_reference: null,
                notes: null,
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-01T00:00:00.000Z',
            },
            tenantId: 'tenant-1',
        };
        mockCreateStockLot.mockResolvedValue(mockResult);

        const result = await createStockLotAction({
            product_id: 'product-1',
            shelf_id: 'shelf-1',
            original_quantity: 10,
            quantity_on_hand: 10,
            received_at: '2026-04-01T00:00:00.000Z',
            unit_cost: 5.0,
            lot_reference: 'LOT-NEW',
            supplier_reference: null,
            notes: null,
        });

        expect(result.stockLot.id).toBe('lot-new');
        expect(mockCreateStockLot).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
            }),
        );
    });
});

describe('adjustStockLotAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupActiveTenant();
    });

    it('delegates to the adjust mutation wrapper with tenant context and stock lot id', async () => {
        const mockResult = {
            stockLot: {
                id: 'lot-1',
                tenant_id: 'tenant-1',
                product_id: 'product-1',
                shelf_id: 'shelf-1',
                original_quantity: 10,
                quantity_on_hand: 7,
                received_at: '2026-04-01T00:00:00.000Z',
                unit_cost: 5.0,
                lot_reference: null,
                supplier_reference: null,
                notes: null,
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-01T00:00:00.000Z',
            },
            tenantId: 'tenant-1',
        };
        mockAdjustStockLot.mockResolvedValue(mockResult);

        const result = await adjustStockLotAction({
            stockLotId: 'lot-1',
            input: {
                quantity_delta: -3,
                reason: 'damaged',
                note: null,
            },
        });

        expect(result.stockLot.quantity_on_hand).toBe(7);
        expect(mockAdjustStockLot).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                stockLotId: 'lot-1',
            }),
        );
    });
});

describe('relocateStockLotAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupActiveTenant();
    });

    it('delegates to the relocate mutation wrapper with tenant context and stock lot id', async () => {
        const mockResult = {
            stockLot: {
                id: 'lot-1',
                tenant_id: 'tenant-1',
                product_id: 'product-1',
                shelf_id: 'shelf-2',
                original_quantity: 10,
                quantity_on_hand: 10,
                received_at: '2026-04-01T00:00:00.000Z',
                unit_cost: 5.0,
                lot_reference: null,
                supplier_reference: null,
                notes: null,
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-01T00:00:00.000Z',
            },
            tenantId: 'tenant-1',
        };
        mockRelocateStockLot.mockResolvedValue(mockResult);

        const result = await relocateStockLotAction({
            stockLotId: 'lot-1',
            input: {
                destination_shelf_id: 'shelf-2',
                reason: 'reorganization',
                note: null,
            },
        });

        expect(result.stockLot.shelf_id).toBe('shelf-2');
        expect(mockRelocateStockLot).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                stockLotId: 'lot-1',
            }),
        );
    });
});
