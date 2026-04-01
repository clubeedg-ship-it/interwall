import '@testing-library/jest-dom/vitest';

import { describe, expect, it, vi } from 'vitest';

import type { WallInventoryViewModel } from '@interwall/shared';

import { renderApp, screen } from '@/test/render';

import { WallCanvasSection } from './wall-canvas-section';

function createWallModel(
    overrides?: Partial<WallInventoryViewModel>,
): WallInventoryViewModel {
    return {
        warehouseName: 'Main Warehouse',
        zones: [
            {
                id: 'zone-a',
                label: 'Zone A',
                displayCode: 'A',
                shelfCount: 2,
                shelves: [
                    {
                        id: 'shelf-a1',
                        label: 'Shelf A1',
                        displayCode: 'A-01',
                        health: 'healthy',
                        productName: 'Hex Bolt M10',
                        quantityOnHand: 20,
                        capacityUnits: 30,
                        reorderCount: 0,
                        lotCount: 2,
                        notes: null,
                    },
                    {
                        id: 'shelf-a2',
                        label: 'Shelf A2',
                        displayCode: 'A-02',
                        health: 'critical',
                        productName: 'Flat Washer',
                        quantityOnHand: 3,
                        capacityUnits: 20,
                        reorderCount: 1,
                        lotCount: 1,
                        notes: null,
                    },
                ],
            },
            {
                id: 'zone-b',
                label: 'Zone B',
                displayCode: 'B',
                shelfCount: 1,
                shelves: [
                    {
                        id: 'shelf-b1',
                        label: 'Shelf B1',
                        displayCode: 'B-01',
                        health: 'empty',
                        productName: null,
                        quantityOnHand: 0,
                        capacityUnits: 16,
                        reorderCount: 0,
                        lotCount: 0,
                        notes: null,
                    },
                ],
            },
        ],
        selectedZoneId: null,
        selectedShelfId: null,
        detail: null,
        ...overrides,
    };
}

describe('WallCanvasSection', () => {
    it('renders the warehouse name and zone tabs', () => {
        renderApp(<WallCanvasSection wall={createWallModel()} />);

        expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
        expect(screen.getByText('Zone A')).toBeInTheDocument();
        expect(screen.getByText('Zone B')).toBeInTheDocument();
    });

    it('renders shelf cards in a grid with display codes and health badges', () => {
        renderApp(
            <WallCanvasSection
                wall={createWallModel({ selectedZoneId: 'zone-a' })}
            />,
        );

        expect(screen.getByText('A-01')).toBeInTheDocument();
        expect(screen.getByText('A-02')).toBeInTheDocument();
        expect(screen.getByText('healthy')).toBeInTheDocument();
        expect(screen.getByText('critical')).toBeInTheDocument();
    });

    it('shows shelf product name and on-hand quantity', () => {
        renderApp(
            <WallCanvasSection
                wall={createWallModel({ selectedZoneId: 'zone-a' })}
            />,
        );

        expect(screen.getByText('Hex Bolt M10')).toBeInTheDocument();
        expect(screen.getByText('Flat Washer')).toBeInTheDocument();
        expect(screen.getByText(/20\/30 units/)).toBeInTheDocument();
    });

    it('switches zones when a zone tab is clicked', async () => {
        const { user } = renderApp(
            <WallCanvasSection wall={createWallModel()} />,
        );

        // Initially shows Zone A (first zone as default)
        expect(screen.getByText('Hex Bolt M10')).toBeInTheDocument();

        // Click Zone B tab
        await user.click(screen.getByRole('tab', { name: /zone b/i }));

        // Now shows Zone B shelves
        expect(screen.getByText('B-01')).toBeInTheDocument();
    });

    it('fires onSelectShelf callback when a shelf card is clicked', async () => {
        const onSelectShelf = vi.fn();
        const { user } = renderApp(
            <WallCanvasSection
                wall={createWallModel({ selectedZoneId: 'zone-a' })}
                onSelectShelf={onSelectShelf}
            />,
        );

        await user.click(screen.getByText('Shelf A1'));

        expect(onSelectShelf).toHaveBeenCalledWith('shelf-a1');
    });

    it('highlights the selected shelf with an accent ring', () => {
        renderApp(
            <WallCanvasSection
                wall={createWallModel({
                    selectedZoneId: 'zone-a',
                    selectedShelfId: 'shelf-a1',
                })}
            />,
        );

        const selectedCard = screen
            .getByText('Shelf A1')
            .closest('article');
        expect(selectedCard?.className).toMatch(/ring/);
    });
});
