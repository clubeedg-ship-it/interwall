import type { ShelfOccupancy, Zone } from "../../lib/types";
import { BinCell, type CellBins } from "./BinCell";
import { fillFor, type StockHealth } from "../../config/wall";

export function ZoneGrid({
  zone,
  occupancy,
  activeShelfId,
  onPick,
  healthByEan,
}: {
  zone: Zone;
  occupancy: ShelfOccupancy[];
  activeShelfId: string | null;
  onPick: (shelf: ShelfOccupancy) => void;
  healthByEan: Map<string, StockHealth>;
}) {
  const byKey = indexOccupancy(occupancy);
  const cols = zone.cols;
  const levels = zone.levels;

  const summary = summarize(occupancy);
  const colDensity = densityByCol(occupancy, cols);

  // Levels rendered top→bottom so L1 ends up at the floor (like legacy / like a real rack).
  const levelRange = Array.from({ length: levels }, (_, i) => levels - i);
  const colRange = Array.from({ length: cols }, (_, i) => i + 1);

  return (
    <section className="rack mb-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[13px] font-semibold tracking-tight text-[var(--color-accent)]">
            ZONE {zone.name}
          </span>
          <span className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
            {zone.cols} × {zone.levels} · {zone.shelves_count} bays
          </span>
        </div>
        <ZoneReadout summary={summary} totalSlots={cols * levels} />
      </header>

      <div
        className="rack-grid"
        style={{
          gridTemplateColumns: `28px repeat(${cols}, minmax(52px, 1fr))`,
        }}
      >
        <div />
        {colRange.map((c) => {
          const d = colDensity[c - 1];
          const pct = d.capacity > 0
            ? Math.min(100, Math.round((d.qty / d.capacity) * 100))
            : d.qty > 0
              ? 70
              : 0;
          return (
            <div key={`col-h-${c}`} className="rack-col-label">
              <span>{zone.name}-{String(c).padStart(2, "0")}</span>
              <span className="rack-col-density" aria-hidden>
                <span style={{ width: `${pct}%` }} />
              </span>
            </div>
          );
        })}

        {levelRange.map((level, i) => (
          <GridRow
            key={`row-${level}`}
            zone={zone}
            level={level}
            cols={cols}
            byKey={byKey}
            activeShelfId={activeShelfId}
            onPick={onPick}
            isFloor={i === levelRange.length - 1}
            healthByEan={healthByEan}
          />
        ))}
      </div>
    </section>
  );
}

// ---- Zone metrics readout -------------------------------------------------

interface ZoneSummaryData {
  total_qty: number;
  total_value: number;
  critical: number;
  warning: number;
  empty: number;
  healthy: number;
}

function summarize(rows: ShelfOccupancy[]): ZoneSummaryData {
  const out: ZoneSummaryData = {
    total_qty: 0,
    total_value: 0,
    critical: 0,
    warning: 0,
    empty: 0,
    healthy: 0,
  };
  for (const r of rows) {
    out.total_qty += r.total_qty;
    out.total_value += r.total_value;
    const f = fillFor(r.total_qty, r.capacity);
    if (f === "critical") out.critical += 1;
    else if (f === "warning") out.warning += 1;
    else if (f === "empty") out.empty += 1;
    else if (f === "healthy") out.healthy += 1;
  }
  return out;
}

function densityByCol(rows: ShelfOccupancy[], cols: number) {
  const arr = Array.from({ length: cols }, () => ({ qty: 0, capacity: 0 }));
  for (const r of rows) {
    const i = r.col - 1;
    if (i < 0 || i >= cols) continue;
    arr[i].qty += r.total_qty;
    if (r.capacity && r.capacity > 0) arr[i].capacity += r.capacity;
  }
  return arr;
}

function ZoneReadout({
  summary,
  totalSlots,
}: {
  summary: ZoneSummaryData;
  totalSlots: number;
}) {
  const occupied = totalSlots - summary.empty;
  return (
    <div className="flex items-stretch gap-4">
      <Readout label="Units" value={formatK(summary.total_qty)} accent />
      <ReadoutDivider />
      <Readout
        label="Value"
        value={`€${formatK(summary.total_value)}`}
      />
      <ReadoutDivider />
      <Readout
        label="Occupied"
        value={`${occupied}/${totalSlots}`}
        tone={summary.critical > 0 ? "crit" : summary.warning > 0 ? "warn" : undefined}
      />
      {summary.critical > 0 && (
        <>
          <ReadoutDivider />
          <Readout label="Crit" value={String(summary.critical)} tone="crit" />
        </>
      )}
    </div>
  );
}

function Readout({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "crit" | "warn";
}) {
  const valueColor =
    tone === "crit"
      ? "text-[var(--color-crit-ink)]"
      : tone === "warn"
        ? "text-[var(--color-warn-ink)]"
        : accent
          ? "text-[var(--color-accent)]"
          : "text-[var(--color-text)]";
  return (
    <div className="flex flex-col items-end">
      <span
        className={`font-mono text-[16px] font-semibold tabular-nums leading-none ${valueColor}`}
      >
        {value}
      </span>
      <span className="mt-1 text-[9.5px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
        {label}
      </span>
    </div>
  );
}

function ReadoutDivider() {
  return <span className="w-px self-stretch bg-[var(--color-line)]" aria-hidden />;
}

function formatK(n: number): string {
  if (n >= 100_000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}

// ---- Grid body ------------------------------------------------------------

function GridRow({
  zone,
  level,
  cols,
  byKey,
  activeShelfId,
  onPick,
  isFloor,
  healthByEan,
}: {
  zone: Zone;
  level: number;
  cols: number;
  byKey: OccupancyIndex;
  activeShelfId: string | null;
  onPick: (s: ShelfOccupancy) => void;
  isFloor: boolean;
  healthByEan: Map<string, StockHealth>;
}) {
  return (
    <>
      <div className={`rack-level-label${isFloor ? " is-floor" : ""}`}>L{level}</div>
      {Array.from({ length: cols }, (_, i) => i + 1).map((col) => {
        const bins: CellBins = {
          base: byKey.base.get(key(zone.name, col, level)) ?? null,
          a: byKey.a.get(key(zone.name, col, level)) ?? null,
          b: byKey.b.get(key(zone.name, col, level)) ?? null,
        };
        return (
          <BinCell
            key={`cell-${col}-${level}`}
            bins={bins}
            activeShelfId={activeShelfId}
            onPick={onPick}
            isFloor={isFloor}
            healthByEan={healthByEan}
          />
        );
      })}
    </>
  );
}

interface OccupancyIndex {
  base: Map<string, ShelfOccupancy>;
  a: Map<string, ShelfOccupancy>;
  b: Map<string, ShelfOccupancy>;
}

function key(zoneName: string, col: number, level: number): string {
  return `${zoneName}:${col}:${level}`;
}

function indexOccupancy(rows: ShelfOccupancy[]): OccupancyIndex {
  const base = new Map<string, ShelfOccupancy>();
  const a = new Map<string, ShelfOccupancy>();
  const b = new Map<string, ShelfOccupancy>();
  for (const r of rows) {
    const k = key(r.zone_name, r.col, r.level);
    if (r.bin === "A") a.set(k, r);
    else if (r.bin === "B") b.set(k, r);
    else base.set(k, r);
  }
  return { base, a, b };
}
