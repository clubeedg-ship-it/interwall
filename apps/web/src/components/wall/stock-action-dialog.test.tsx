import '@testing-library/jest-dom/vitest';

import { describe, expect, it, vi } from 'vitest';

import { renderApp, screen } from '@/test/render';

import {
    StockActionDialog,
    type StockActionDialogProps,
} from './stock-action-dialog';

function createProps(
    overrides?: Partial<StockActionDialogProps>,
): StockActionDialogProps {
    return {
        mode: 'create',
        open: true,
        onClose: vi.fn(),
        onSubmit: vi.fn(),
        draft: {
            barcode: '1234567890',
            sku: null,
            ean: null,
            quantity: null,
            unitCost: null,
            lotReference: null,
            supplierReference: null,
            marketplaceName: null,
            marketplaceReference: null,
            shelfId: null,
        },
        ...overrides,
    };
}

describe('StockActionDialog', () => {
    it('renders the create stock lot heading when mode is create', () => {
        renderApp(<StockActionDialog {...createProps()} />);

        expect(
            screen.getByRole('dialog', { name: /create stock lot/i }),
        ).toBeInTheDocument();
    });

    it('renders the adjust lot heading when mode is adjust', () => {
        renderApp(
            <StockActionDialog
                {...createProps({ mode: 'adjust' })}
            />,
        );

        expect(
            screen.getByRole('dialog', { name: /adjust lot/i }),
        ).toBeInTheDocument();
    });

    it('renders the relocate lot heading when mode is relocate', () => {
        renderApp(
            <StockActionDialog
                {...createProps({ mode: 'relocate' })}
            />,
        );

        expect(
            screen.getByRole('dialog', { name: /relocate lot/i }),
        ).toBeInTheDocument();
    });

    it('prefills the barcode field from the draft', () => {
        renderApp(<StockActionDialog {...createProps()} />);

        const barcodeInput = screen.getByLabelText(/barcode/i);

        expect(barcodeInput).toHaveValue('1234567890');
    });

    it('shows all required D-09 fields for create mode', () => {
        renderApp(<StockActionDialog {...createProps()} />);

        expect(screen.getByLabelText(/barcode/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/unit cost/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/sku/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/ean/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/lot reference/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/supplier/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/marketplace name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/marketplace ref/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/shelf/i)).toBeInTheDocument();
    });

    it('calls onClose when cancel is clicked', async () => {
        const onClose = vi.fn();
        const { user } = renderApp(
            <StockActionDialog {...createProps({ onClose })} />,
        );

        await user.click(
            screen.getByRole('button', { name: /cancel/i }),
        );

        expect(onClose).toHaveBeenCalled();
    });

    it('does not render when open is false', () => {
        renderApp(<StockActionDialog {...createProps({ open: false })} />);

        expect(screen.queryByText(/create stock lot/i)).not.toBeInTheDocument();
    });
});
