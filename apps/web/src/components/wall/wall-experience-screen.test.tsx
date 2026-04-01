import '@testing-library/jest-dom/vitest';

import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WallShelfDetailState } from '@interwall/shared';

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

    it('renders ShelfDetailPanel when a shelf is selected and detail is loaded', async () => {
        const mockDetail: WallShelfDetailState = {
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
        };

        const mockGetShelfDetail = vi.fn().mockResolvedValue(mockDetail);

        renderApp(
            <WallExperienceScreen
                {...wallExperienceProps}
                onGetShelfDetail={mockGetShelfDetail}
            />,
        );

        const shelfCard = screen.getByRole('button', { name: /shelf a1/i });
        await act(async () => {
            fireEvent.click(shelfCard);
        });

        expect(mockGetShelfDetail).toHaveBeenCalledWith('shelf-a1');
        const detailPanel = screen.getByRole('complementary', { name: /shelf detail panel/i });
        expect(detailPanel).toBeInTheDocument();
        expect(detailPanel).toHaveTextContent('Shelf A1');
    });

    it('closes ShelfDetailPanel and returns to scanner when close button is clicked', async () => {
        const mockDetail: WallShelfDetailState = {
            shelfId: 'shelf-a1',
            shelfLabel: 'Shelf A1',
            shelfDisplayCode: 'A-01',
            health: 'healthy',
            quantityOnHand: 18,
            capacityUnits: 24,
            reorderThreshold: 4,
            stockValue: 240,
            primaryProductName: 'Anchor Bracket',
            lots: [],
        };

        const mockGetShelfDetail = vi.fn().mockResolvedValue(mockDetail);

        renderApp(
            <WallExperienceScreen
                {...wallExperienceProps}
                onGetShelfDetail={mockGetShelfDetail}
            />,
        );

        const shelfCard = screen.getByRole('button', { name: /shelf a1/i });
        await act(async () => {
            fireEvent.click(shelfCard);
        });

        expect(
            screen.getByRole('complementary', { name: /shelf detail panel/i }),
        ).toBeInTheDocument();

        const closeButton = screen.getByRole('button', { name: /close/i });
        await act(async () => {
            fireEvent.click(closeButton);
        });

        expect(
            screen.queryByRole('complementary', { name: /shelf detail panel/i }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('complementary', { name: /scanner command surface/i }),
        ).toBeInTheDocument();
    });

    it('opens StockActionDialog in create mode when shelf detail create button is clicked', async () => {
        const mockDetail: WallShelfDetailState = {
            shelfId: 'shelf-a1',
            shelfLabel: 'Shelf A1',
            shelfDisplayCode: 'A-01',
            health: 'healthy',
            quantityOnHand: 18,
            capacityUnits: 24,
            reorderThreshold: 4,
            stockValue: 240,
            primaryProductName: 'Anchor Bracket',
            lots: [],
        };

        const mockGetShelfDetail = vi.fn().mockResolvedValue(mockDetail);

        renderApp(
            <WallExperienceScreen
                {...wallExperienceProps}
                onGetShelfDetail={mockGetShelfDetail}
            />,
        );

        const shelfCard = screen.getByRole('button', { name: /shelf a1/i });
        await act(async () => {
            fireEvent.click(shelfCard);
        });

        const createButton = screen.getByRole('button', { name: /create stock lot/i });
        await act(async () => {
            fireEvent.click(createButton);
        });

        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});
