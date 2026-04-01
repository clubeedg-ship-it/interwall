import '@testing-library/jest-dom/vitest';

import { describe, expect, it, vi } from 'vitest';

import type { WallShelfDetailState } from '@interwall/shared';

import { renderApp, screen } from '@/test/render';

import { ShelfDetailPanel } from './shelf-detail-panel';

function createDetail(
    overrides?: Partial<WallShelfDetailState>,
): WallShelfDetailState {
    return {
        shelfId: 'shelf-a1',
        shelfLabel: 'Shelf A1',
        shelfDisplayCode: 'A-01',
        health: 'warning',
        quantityOnHand: 12,
        capacityUnits: 20,
        reorderThreshold: 5,
        stockValue: 240,
        primaryProductName: 'Hex Bolt M10',
        lots: [
            {
                id: 'lot-1',
                productName: 'Hex Bolt M10',
                quantityOnHand: 8,
                receivedAt: '2026-03-01T10:00:00Z',
                unitCost: 1.5,
                lotReference: 'LOT-001',
                supplierReference: 'SUP-001',
                notes: null,
            },
            {
                id: 'lot-2',
                productName: 'Hex Bolt M10',
                quantityOnHand: 4,
                receivedAt: '2026-03-15T10:00:00Z',
                unitCost: 1.6,
                lotReference: 'LOT-002',
                supplierReference: 'SUP-001',
                notes: null,
            },
        ],
        ...overrides,
    };
}

describe('ShelfDetailPanel', () => {
    it('renders shelf label, display code, and health badge', () => {
        renderApp(
            <ShelfDetailPanel detail={createDetail()} onClose={vi.fn()} />,
        );

        expect(screen.getByText('Shelf A1')).toBeInTheDocument();
        expect(screen.getByText('A-01')).toBeInTheDocument();
        expect(screen.getByText('warning')).toBeInTheDocument();
    });

    it('shows lot quantity, received date, unit cost, and references', () => {
        renderApp(
            <ShelfDetailPanel detail={createDetail()} onClose={vi.fn()} />,
        );

        expect(screen.getByText('LOT-001')).toBeInTheDocument();
        expect(screen.getAllByText('SUP-001').length).toBeGreaterThanOrEqual(1);
        // lot quantities
        expect(screen.getByText('8')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('displays action entry point buttons for create, adjust, and relocate', () => {
        renderApp(
            <ShelfDetailPanel detail={createDetail()} onClose={vi.fn()} />,
        );

        expect(
            screen.getByRole('button', { name: /create stock lot/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /adjust lot/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /relocate lot/i }),
        ).toBeInTheDocument();
    });

    it('calls onClose when the close button is clicked', async () => {
        const onClose = vi.fn();
        const { user } = renderApp(
            <ShelfDetailPanel detail={createDetail()} onClose={onClose} />,
        );

        await user.click(
            screen.getByRole('button', { name: /close/i }),
        );

        expect(onClose).toHaveBeenCalled();
    });

    it('shows stock value and primary product name', () => {
        renderApp(
            <ShelfDetailPanel
                detail={createDetail({ stockValue: 240 })}
                onClose={vi.fn()}
            />,
        );

        expect(screen.getAllByText('Hex Bolt M10').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/240/)).toBeInTheDocument();
    });
});
