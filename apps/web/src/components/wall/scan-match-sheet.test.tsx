import '@testing-library/jest-dom/vitest';

import { describe, expect, it, vi } from 'vitest';

import type { ProductRow, StockLotRow } from '@interwall/shared';

import { renderApp, screen } from '@/test/render';

import { ScanMatchSheet, type ScanMatchSheetProps } from './scan-match-sheet';

function createProduct(overrides?: Partial<ProductRow>): ProductRow {
    return {
        id: 'product-1',
        tenant_id: 'tenant-1',
        sku: 'AB-001',
        barcode: '1234567890',
        name: 'Anchor Bracket',
        description: 'Heavy-duty anchor bracket',
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
        ...overrides,
    };
}

function createLot(overrides?: Partial<StockLotRow>): StockLotRow {
    return {
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
        ...overrides,
    };
}

function createProps(
    overrides?: Partial<ScanMatchSheetProps>,
): ScanMatchSheetProps {
    return {
        product: createProduct(),
        lots: [createLot()],
        onClose: vi.fn(),
        onCreateStockLot: vi.fn(),
        ...overrides,
    };
}

describe('ScanMatchSheet', () => {
    it('displays the matched product name and barcode metadata', () => {
        renderApp(<ScanMatchSheet {...createProps()} />);

        expect(screen.getByText('Anchor Bracket')).toBeInTheDocument();
        expect(screen.getByText(/1234567890/)).toBeInTheDocument();
        expect(screen.getByText(/AB-001/)).toBeInTheDocument();
    });

    it('lists lot rows with quantity, received date, and cost', () => {
        renderApp(<ScanMatchSheet {...createProps()} />);

        expect(screen.getByText('15')).toBeInTheDocument();
        expect(screen.getByText(/LOT-001/)).toBeInTheDocument();
    });

    it('provides a create stock lot handoff button', () => {
        renderApp(<ScanMatchSheet {...createProps()} />);

        expect(
            screen.getByRole('button', { name: /create stock lot/i }),
        ).toBeInTheDocument();
    });

    it('calls onCreateStockLot when the create button is clicked', async () => {
        const onCreateStockLot = vi.fn();
        const { user } = renderApp(
            <ScanMatchSheet {...createProps({ onCreateStockLot })} />,
        );

        await user.click(
            screen.getByRole('button', { name: /create stock lot/i }),
        );

        expect(onCreateStockLot).toHaveBeenCalled();
    });

    it('calls onClose when the close button is clicked', async () => {
        const onClose = vi.fn();
        const { user } = renderApp(
            <ScanMatchSheet {...createProps({ onClose })} />,
        );

        await user.click(
            screen.getByRole('button', { name: /close/i }),
        );

        expect(onClose).toHaveBeenCalled();
    });
});
