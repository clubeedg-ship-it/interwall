'use client';

import type { ScanDraftResult } from '@/app/(app)/workspace/actions';

export type StockActionMode = 'create' | 'adjust' | 'relocate';

export interface StockActionDialogProps {
    mode: StockActionMode;
    open: boolean;
    onClose: () => void;
    onSubmit: (data: Record<string, string>) => void;
    draft?: ScanDraftResult['draft'] | null;
    stockLotId?: string | null;
}

const MODE_HEADINGS: Record<StockActionMode, string> = {
    create: 'Create stock lot',
    adjust: 'Adjust lot',
    relocate: 'Relocate lot',
};

export function StockActionDialog({
    mode,
    open,
    onClose,
    onSubmit,
    draft,
    stockLotId: _stockLotId,
}: StockActionDialogProps): JSX.Element | null {
    if (!open) {
        return null;
    }

    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const data: Record<string, string> = {};

        for (const [key, value] of formData.entries()) {
            data[key] = String(value);
        }

        onSubmit(data);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div
                role="dialog"
                aria-label={MODE_HEADINGS[mode]}
                className="mx-4 w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#102131] p-6 shadow-2xl"
            >
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold text-white">
                        {MODE_HEADINGS[mode]}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-colors duration-150 hover:bg-white/10 hover:text-white"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        >
                            <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                        <label
                            htmlFor="stock-barcode"
                            className="block text-xs uppercase tracking-[0.22em] text-white/50"
                        >
                            Barcode
                        </label>
                        <input
                            id="stock-barcode"
                            name="barcode"
                            type="text"
                            defaultValue={draft?.barcode ?? ''}
                            className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-white/30 focus:border-[#14b8a6] focus:outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label
                                htmlFor="stock-quantity"
                                className="block text-xs uppercase tracking-[0.22em] text-white/50"
                            >
                                Quantity
                            </label>
                            <input
                                id="stock-quantity"
                                name="quantity"
                                type="number"
                                defaultValue={draft?.quantity ?? ''}
                                className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-white/30 focus:border-[#14b8a6] focus:outline-none"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="stock-unit-cost"
                                className="block text-xs uppercase tracking-[0.22em] text-white/50"
                            >
                                Unit cost
                            </label>
                            <input
                                id="stock-unit-cost"
                                name="unitCost"
                                type="number"
                                step="0.01"
                                defaultValue={draft?.unitCost ?? ''}
                                className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-white/30 focus:border-[#14b8a6] focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label
                                htmlFor="stock-sku"
                                className="block text-xs uppercase tracking-[0.22em] text-white/50"
                            >
                                SKU
                            </label>
                            <input
                                id="stock-sku"
                                name="sku"
                                type="text"
                                defaultValue={draft?.sku ?? ''}
                                className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-white/30 focus:border-[#14b8a6] focus:outline-none"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="stock-ean"
                                className="block text-xs uppercase tracking-[0.22em] text-white/50"
                            >
                                EAN
                            </label>
                            <input
                                id="stock-ean"
                                name="ean"
                                type="text"
                                defaultValue={draft?.ean ?? ''}
                                className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-white/30 focus:border-[#14b8a6] focus:outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="stock-lot-reference"
                            className="block text-xs uppercase tracking-[0.22em] text-white/50"
                        >
                            Lot reference
                        </label>
                        <input
                            id="stock-lot-reference"
                            name="lotReference"
                            type="text"
                            defaultValue={draft?.lotReference ?? ''}
                            className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-white/30 focus:border-[#14b8a6] focus:outline-none"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="stock-supplier-reference"
                            className="block text-xs uppercase tracking-[0.22em] text-white/50"
                        >
                            Supplier reference
                        </label>
                        <input
                            id="stock-supplier-reference"
                            name="supplierReference"
                            type="text"
                            defaultValue={draft?.supplierReference ?? ''}
                            className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-white/30 focus:border-[#14b8a6] focus:outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label
                                htmlFor="stock-marketplace-name"
                                className="block text-xs uppercase tracking-[0.22em] text-white/50"
                            >
                                Marketplace name
                            </label>
                            <input
                                id="stock-marketplace-name"
                                name="marketplaceName"
                                type="text"
                                defaultValue={draft?.marketplaceName ?? ''}
                                className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-white/30 focus:border-[#14b8a6] focus:outline-none"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="stock-marketplace-ref"
                                className="block text-xs uppercase tracking-[0.22em] text-white/50"
                            >
                                Marketplace ref
                            </label>
                            <input
                                id="stock-marketplace-ref"
                                name="marketplaceReference"
                                type="text"
                                defaultValue={draft?.marketplaceReference ?? ''}
                                className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-white/30 focus:border-[#14b8a6] focus:outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="stock-shelf"
                            className="block text-xs uppercase tracking-[0.22em] text-white/50"
                        >
                            Shelf
                        </label>
                        <input
                            id="stock-shelf"
                            name="shelfId"
                            type="text"
                            defaultValue={draft?.shelfId ?? ''}
                            className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-white/30 focus:border-[#14b8a6] focus:outline-none"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-medium text-white/80 transition-colors duration-150 hover:bg-white/10"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[#14b8a6] bg-[#14b8a6]/15 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#14b8a6]/25"
                        >
                            {MODE_HEADINGS[mode]}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
