import '@testing-library/jest-dom/vitest';

import { describe, expect, it } from 'vitest';

import { renderApp, screen } from '@/test/render';

import {
    WallExperienceScreen,
    type WallExperienceScreenProps,
} from './wall-experience-screen';

const wallExperienceProps: WallExperienceScreenProps = {
    wall: {
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
                        productName: 'Anchor Bracket',
                        quantityOnHand: 18,
                        capacityUnits: 24,
                        reorderCount: 0,
                        lotCount: 2,
                        notes: null,
                    },
                ],
            },
        ],
        selectedZoneId: 'zone-a',
        selectedShelfId: 'shelf-a1',
        detail: {
            shelfId: 'shelf-a1',
            shelfLabel: 'Shelf A1',
            shelfDisplayCode: 'A-01',
            health: 'healthy',
            quantityOnHand: 18,
            capacityUnits: 24,
            reorderThreshold: 4,
            stockValue: 240,
            primaryProductName: 'Anchor Bracket',
            lots: [
                {
                    id: 'lot-1',
                    productName: 'Anchor Bracket',
                    quantityOnHand: 10,
                    receivedAt: '2026-04-01T09:00:00.000Z',
                    unitCost: 12,
                    lotReference: 'LOT-001',
                    supplierReference: 'SUP-001',
                    notes: null,
                },
            ],
        },
    },
    scanner: {
        query: '123456789',
        status: 'ready',
        activeModeLabel: 'Keyboard scanner',
        pendingDraft: {
            barcode: '123456789',
            sku: 'AB-001',
            quantity: 5,
            unitCost: 12,
            lotReference: 'LOT-001',
            supplierReference: 'SUP-001',
            shelfId: 'shelf-a1',
        },
        matches: [
            {
                id: 'match-1',
                type: 'product',
                title: 'Anchor Bracket',
                subtitle: 'AB-001',
                barcode: '123456789',
                shelfLabel: 'Shelf A1',
            },
        ],
    },
};

describe('WallExperienceScreen', () => {
    it('renders the wall canvas and scanner command regions from explicit props', () => {
        renderApp(<WallExperienceScreen {...wallExperienceProps} />);

        expect(
            screen.getByRole('region', { name: /wall canvas section/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('complementary', { name: /scanner command surface/i }),
        ).toBeInTheDocument();
        expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
        expect(screen.getByText('Keyboard scanner')).toBeInTheDocument();
    });
});
