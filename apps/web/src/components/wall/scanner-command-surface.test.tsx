import '@testing-library/jest-dom/vitest';

import { describe, expect, it, vi } from 'vitest';

import { renderApp, screen } from '@/test/render';

import {
    ScannerCommandSurface,
    type ScannerCommandSurfaceProps,
} from './scanner-command-surface';

function createProps(
    overrides?: Partial<ScannerCommandSurfaceProps>,
): ScannerCommandSurfaceProps {
    return {
        scanner: {
            query: '',
            status: 'ready',
            activeModeLabel: 'Keyboard scanner',
            pendingDraft: null,
            matches: [],
        },
        onScan: vi.fn(),
        ...overrides,
    };
}

describe('ScannerCommandSurface', () => {
    it('renders a visible scan input with 72px height', () => {
        renderApp(<ScannerCommandSurface {...createProps()} />);

        const input = screen.getByRole('textbox', { name: /scan/i });

        expect(input).toBeInTheDocument();
        expect(input).toBeVisible();
    });

    it('shows ready status label when scanner is ready', () => {
        renderApp(<ScannerCommandSurface {...createProps()} />);

        expect(screen.getByText(/scanner ready/i)).toBeInTheDocument();
    });

    it('shows match found status when scanner has match status', () => {
        renderApp(
            <ScannerCommandSurface
                {...createProps({
                    scanner: {
                        query: '1234567890',
                        status: 'matched',
                        activeModeLabel: 'Keyboard scanner',
                        pendingDraft: null,
                        matches: [
                            {
                                id: 'match-1',
                                type: 'product',
                                title: 'Anchor Bracket',
                                subtitle: 'AB-001',
                                barcode: '1234567890',
                                shelfLabel: null,
                            },
                        ],
                    },
                })}
            />,
        );

        expect(screen.getByText(/match found/i)).toBeInTheDocument();
    });

    it('shows create stock lot status when scanner has create status', () => {
        renderApp(
            <ScannerCommandSurface
                {...createProps({
                    scanner: {
                        query: 'NEW-CODE',
                        status: 'create',
                        activeModeLabel: 'Keyboard scanner',
                        pendingDraft: {
                            barcode: 'NEW-CODE',
                            sku: null,
                            quantity: null,
                            unitCost: null,
                            lotReference: null,
                            supplierReference: null,
                            shelfId: null,
                        },
                        matches: [],
                    },
                })}
            />,
        );

        expect(screen.getByText(/create stock/i)).toBeInTheDocument();
    });

    it('calls onScan with the input value on form submit', async () => {
        const onScan = vi.fn();
        const { user } = renderApp(
            <ScannerCommandSurface {...createProps({ onScan })} />,
        );

        const input = screen.getByRole('textbox', { name: /scan/i });
        await user.type(input, '1234567890{enter}');

        expect(onScan).toHaveBeenCalledWith('1234567890');
    });

    it('clears the input after successful submit for rapid successive scans', async () => {
        const onScan = vi.fn();
        const { user } = renderApp(
            <ScannerCommandSurface {...createProps({ onScan })} />,
        );

        const input = screen.getByRole('textbox', { name: /scan/i });
        await user.type(input, 'RAPID-SCAN{enter}');

        expect(input).toHaveValue('');
    });
});
