import type {
    WallInventoryViewModel,
    WallShelfState,
} from '@interwall/shared';

const HEALTH_STYLES: Record<WallShelfState['health'], string> = {
    healthy: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
    warning: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
    critical: 'border-red-500/40 bg-red-500/10 text-red-100',
    empty: 'border-slate-500/40 bg-slate-500/10 text-slate-100',
};

export interface WallCanvasSectionProps {
    wall: WallInventoryViewModel;
}

function renderCapacityLabel(shelf: WallShelfState): string {
    if (shelf.capacityUnits === null) {
        return `${shelf.quantityOnHand} on hand`;
    }

    return `${shelf.quantityOnHand}/${shelf.capacityUnits} units`;
}

export function WallCanvasSection({
    wall,
}: WallCanvasSectionProps): JSX.Element {
    const selectedZone =
        wall.zones.find((zone) => zone.id === wall.selectedZoneId) ??
        wall.zones[0] ??
        null;

    return (
        <section
            aria-label="Wall canvas section"
            className="flex min-h-[32rem] flex-1 flex-col rounded-[2rem] border border-white/10 bg-[#09111f] p-6 shadow-[var(--shadow-shell)] lg:p-8"
        >
            <div className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.32em] text-[#14b8a6]">
                        Wall
                    </p>
                    <h1 className="mt-3 font-serif text-4xl text-white">
                        {wall.warehouseName}
                    </h1>
                </div>
                <div className="flex flex-wrap gap-2">
                    {wall.zones.map((zone) => {
                        const isActive = zone.id === selectedZone?.id;

                        return (
                            <span
                                key={zone.id}
                                className={[
                                    'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium',
                                    isActive
                                        ? 'border-[#14b8a6] bg-[#14b8a6]/15 text-white'
                                        : 'border-white/10 bg-white/5 text-[var(--text-secondary)]',
                                ].join(' ')}
                            >
                                {zone.label}
                            </span>
                        );
                    })}
                </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {selectedZone?.shelves.map((shelf) => {
                    const isSelected = shelf.id === wall.selectedShelfId;

                    return (
                        <article
                            key={shelf.id}
                            className={[
                                'rounded-[1.5rem] border p-5 transition-colors',
                                HEALTH_STYLES[shelf.health],
                                isSelected ? 'ring-2 ring-[#14b8a6]' : '',
                            ].join(' ')}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.24em] text-white/70">
                                        {shelf.displayCode}
                                    </p>
                                    <h2 className="mt-2 text-lg font-semibold text-white">
                                        {shelf.label}
                                    </h2>
                                </div>
                                <span className="rounded-full border border-current/30 px-3 py-1 text-xs uppercase tracking-[0.22em]">
                                    {shelf.health}
                                </span>
                            </div>
                            <p className="mt-5 text-sm text-white/80">
                                {shelf.productName ?? 'Open capacity for incoming stock'}
                            </p>
                            <div className="mt-5 flex items-center justify-between text-sm text-white/75">
                                <span>{renderCapacityLabel(shelf)}</span>
                                <span>{shelf.lotCount} lots</span>
                            </div>
                            <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/60">
                                <span>{shelf.reorderCount} reorder signals</span>
                                <span>{isSelected ? 'selected' : 'wall view'}</span>
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
