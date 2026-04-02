import type { OrderLedgerEntryView } from '@interwall/shared';

function formatMoney(value: number | null): string {
    if (value === null) {
        return 'Pending';
    }

    return `$${value.toFixed(2)}`;
}

function deltaLabel(value: number): string {
    return value > 0 ? `+${value}` : String(value);
}

function deltaClasses(value: number): string {
    if (value > 0) {
        return 'bg-[#166534]/20 text-[#bbf7d0] border-[#166534]/40';
    }

    if (value < 0) {
        return 'bg-[#dc2626]/15 text-[#fecaca] border-[#dc2626]/40';
    }

    return 'bg-white/5 text-slate-200 border-white/10';
}

export interface OrderLedgerTableProps {
    entries: OrderLedgerEntryView[];
}

export function OrderLedgerTable({
    entries,
}: OrderLedgerTableProps): JSX.Element {
    return (
        <section className="rounded-[1.5rem] border border-white/10 bg-[#102131]/85 p-5">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#14b8a6]">
                        View ledger
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Ledger history</h2>
                </div>
                <p className="text-sm text-slate-300">sticky</p>
            </div>
            <div className="mt-4 overflow-x-auto">
                <table
                    aria-label="Order ledger"
                    className="min-w-full border-separate border-spacing-0 text-left text-sm text-slate-200"
                >
                    <thead>
                        <tr>
                            <th className="sticky top-0 bg-[#09111f] px-4 py-3 font-semibold text-white">
                                Time
                            </th>
                            <th className="sticky top-0 bg-[#09111f] px-4 py-3 font-semibold text-white">
                                Delta
                            </th>
                            <th className="sticky top-0 bg-[#09111f] px-4 py-3 font-semibold text-white">
                                Entry
                            </th>
                            <th className="sticky top-0 bg-[#09111f] px-4 py-3 font-semibold text-white">
                                Order ref
                            </th>
                            <th className="sticky top-0 bg-[#09111f] px-4 py-3 font-semibold text-white">
                                Lot ref
                            </th>
                            <th className="sticky top-0 bg-[#09111f] px-4 py-3 font-semibold text-white">
                                Unit cost
                            </th>
                            <th className="sticky top-0 bg-[#09111f] px-4 py-3 font-semibold text-white">
                                Cost snapshot
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.length === 0 ? (
                            <tr>
                                <td
                                    className="px-4 py-4 text-slate-300"
                                    colSpan={7}
                                >
                                    No immutable ledger entries yet.
                                </td>
                            </tr>
                        ) : (
                            entries.map((entry) => (
                                <tr key={entry.id} className="odd:bg-white/[0.03]">
                                    <td className="px-4 py-3">{entry.createdAt}</td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-flex min-h-8 items-center rounded-full border px-3 font-semibold ${deltaClasses(entry.quantityDelta)}`}
                                        >
                                            {deltaLabel(entry.quantityDelta)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-white">
                                            {entry.entryType}
                                        </div>
                                        <div className="text-slate-300">{entry.reason}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {entry.orderNumber ?? 'Not linked'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {entry.lotReference ?? 'Unassigned'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {formatMoney(entry.unitCost)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {entry.entryType === 'receipt'
                                            ? `${formatMoney(entry.costBasisTotal)} received`
                                            : formatMoney(entry.costBasisTotal)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
