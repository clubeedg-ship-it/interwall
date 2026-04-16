import { Fragment, useCallback, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type {
  ProfitValuationRow,
  StockLotForProduct,
} from "../../lib/types";

interface InventoryTableProps {
  rows: ProfitValuationRow[];
  loading: boolean;
}

type SortKey = "name" | "qty" | "unit" | "total";

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

interface BatchState {
  status: "idle" | "loading" | "ready" | "error";
  lots: StockLotForProduct[];
  error: string | null;
}

export function InventoryTable({ rows, loading }: InventoryTableProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("total");
  const [desc, setDesc] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [batchState, setBatchState] = useState<Record<string, BatchState>>({});

  const { totalValue, totalQty, processed } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const enriched = rows.map((r) => {
      const qty = num(r.total_qty);
      const value = num(r.total_value);
      return {
        ean: r.ean,
        name: r.name ?? r.ean,
        qty,
        value,
        unit: qty > 0 ? value / qty : 0,
      };
    });

    const filtered = q
      ? enriched.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.ean.toLowerCase().includes(q)
        )
      : enriched;

    filtered.sort((a, b) => {
      const dir = desc ? -1 : 1;
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "qty":
          return (a.qty - b.qty) * dir;
        case "unit":
          return (a.unit - b.unit) * dir;
        case "total":
        default:
          return (a.value - b.value) * dir;
      }
    });

    const totalValue = enriched.reduce((s, r) => s + r.value, 0);
    const totalQty = enriched.reduce((s, r) => s + r.qty, 0);
    return { totalValue, totalQty, processed: filtered };
  }, [rows, query, sort, desc]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDesc((v) => !v);
    else {
      setSort(key);
      setDesc(true);
    }
  };

  const fetchBatches = useCallback(async (ean: string) => {
    setBatchState((s) => ({
      ...s,
      [ean]: { status: "loading", lots: [], error: null },
    }));
    try {
      const lots = await api.stockLots.byProduct(ean);
      setBatchState((s) => ({
        ...s,
        [ean]: { status: "ready", lots, error: null },
      }));
    } catch (err) {
      setBatchState((s) => ({
        ...s,
        [ean]: {
          status: "error",
          lots: [],
          error: err instanceof ApiError ? err.message : String(err),
        },
      }));
    }
  }, []);

  const toggleExpand = useCallback(
    (ean: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(ean)) {
          next.delete(ean);
        } else {
          next.add(ean);
          if (!batchState[ean] || batchState[ean].status === "error") {
            void fetchBatches(ean);
          }
        }
        return next;
      });
    },
    [batchState, fetchBatches]
  );

  if (loading && rows.length === 0) {
    return (
      <div className="h-40 animate-pulse rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-glass)]" />
    );
  }

  const topValue = processed[0]?.value ?? 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            Total inventory value
          </span>
          <span className="font-mono text-[22px] font-semibold tabular-nums text-[var(--color-text)]">
            €{totalValue.toFixed(2)}
          </span>
          <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
            · {totalQty} units · {rows.length} products
          </span>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by part or EAN…"
          className="min-w-[220px] rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 font-mono text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
        />
      </div>

      <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-line)]">
        <table className="w-full text-[12.5px]">
          <thead className="bg-[var(--color-glass)]">
            <tr className="text-left text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
              <th className="w-[32px] px-2 py-2" aria-label="Expand" />
              <SortHeader
                active={sort === "name"}
                desc={desc}
                onClick={() => toggleSort("name")}
                className="w-[46%]"
              >
                Part / EAN
              </SortHeader>
              <SortHeader
                active={sort === "qty"}
                desc={desc}
                onClick={() => toggleSort("qty")}
                className="text-right"
              >
                Qty
              </SortHeader>
              <SortHeader
                active={sort === "unit"}
                desc={desc}
                onClick={() => toggleSort("unit")}
                className="text-right"
              >
                Unit €
              </SortHeader>
              <SortHeader
                active={sort === "total"}
                desc={desc}
                onClick={() => toggleSort("total")}
                className="text-right"
              >
                Total €
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {processed.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-[var(--color-text-muted)]"
                >
                  No matching stock.
                </td>
              </tr>
            ) : (
              processed.map((r) => {
                const pct = topValue > 0 ? (r.value / topValue) * 100 : 0;
                const isOpen = expanded.has(r.ean);
                const batches = batchState[r.ean];
                return (
                  <Fragment key={r.ean}>
                    <tr
                      onClick={() => toggleExpand(r.ean)}
                      className="cursor-pointer border-t border-[var(--color-line)] transition hover:bg-[var(--color-glass)]"
                    >
                      <td className="px-2 py-2 text-center text-[var(--color-text-muted)]">
                        <span
                          aria-hidden
                          className={[
                            "inline-block text-[12px] transition-transform",
                            isOpen ? "rotate-90 text-[var(--color-accent)]" : "",
                          ].join(" ")}
                        >
                          ›
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text-dim)]">
                        <div className="truncate text-[var(--color-text)]">
                          {r.name}
                        </div>
                        <div className="font-mono text-[10.5px] text-[var(--color-text-muted)]">
                          {r.ean}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-text-dim)]">
                        {r.qty}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-text-dim)]">
                        {r.unit.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="h-[3px] w-20 overflow-hidden rounded-[1px] bg-[var(--color-line)]">
                            <div
                              className="h-full bg-[var(--color-accent)]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono tabular-nums text-[var(--color-text)]">
                            {r.value.toFixed(2)}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-[color-mix(in_oklab,var(--color-accent)_5%,transparent)]">
                        <td />
                        <td colSpan={4} className="px-3 pb-4 pt-3">
                          <BatchBreakdown
                            state={batches}
                            productValue={r.value}
                            productQty={r.qty}
                            onRetry={() => void fetchBatches(r.ean)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  children,
  active,
  desc,
  onClick,
  className,
}: {
  children: React.ReactNode;
  active: boolean;
  desc: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 font-medium ${className ?? ""}`}>
      <button
        type="button"
        onClick={onClick}
        className={[
          "inline-flex items-center gap-1 transition",
          active
            ? "text-[var(--color-accent)]"
            : "hover:text-[var(--color-text-dim)]",
        ].join(" ")}
      >
        {children}
        {active && <span>{desc ? "↓" : "↑"}</span>}
      </button>
    </th>
  );
}

function BatchBreakdown({
  state,
  productValue,
  productQty,
  onRetry,
}: {
  state: BatchState | undefined;
  productValue: number;
  productQty: number;
  onRetry: () => void;
}) {
  if (!state || state.status === "loading") {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
        <span className="h-3 w-3 animate-spin rounded-full border border-[var(--color-line)] border-t-[var(--color-accent)]" />
        Loading batches…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_8%,transparent)] px-3 py-2 text-[11.5px] text-[var(--color-crit-ink)]">
          <span>Failed to load batches: {state.error}</span>
          <button type="button" onClick={onRetry} className="btn-secondary">
            Retry
          </button>
      </div>
    );
  }

  if (state.lots.length === 0) {
    return (
      <div className="text-[11.5px] text-[var(--color-text-muted)]">
        No active lots recorded for this product.
      </div>
    );
  }

  const lotsAggregate = state.lots.reduce(
    (acc, lot) => {
      const qty = Number(lot.quantity) || 0;
      const unit = num(lot.unit_cost);
      const value = qty * unit;
      acc.qty += qty;
      acc.value += value;
      return acc;
    },
    { qty: 0, value: 0 }
  );

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        <span>
          Active batches · {state.lots.length}
          <span className="ml-2 font-mono normal-case tracking-normal text-[var(--color-text-muted)]">
            FIFO order · oldest first
          </span>
        </span>
        <span>
          <span className="mr-3 font-mono normal-case tracking-normal text-[var(--color-text-dim)]">
            Σ qty {lotsAggregate.qty}
          </span>
          <span className="font-mono normal-case tracking-normal text-[var(--color-text-dim)]">
            Σ value €{lotsAggregate.value.toFixed(2)}
          </span>
        </span>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg)]">
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
              <th className="px-3 py-1.5 font-medium">Batch</th>
              <th className="px-3 py-1.5 font-medium">Received</th>
              <th className="px-3 py-1.5 font-medium">Source</th>
              <th className="px-3 py-1.5 text-right font-medium">Qty</th>
              <th className="px-3 py-1.5 text-right font-medium">Unit €</th>
              <th className="px-3 py-1.5 text-right font-medium">Batch €</th>
              <th className="px-3 py-1.5 text-right font-medium">% of model</th>
            </tr>
          </thead>
          <tbody>
            {state.lots.map((lot, i) => {
              const qty = Number(lot.quantity) || 0;
              const unit = num(lot.unit_cost);
              const value = qty * unit;
              const pct =
                productValue > 0 ? (value / productValue) * 100 : 0;
              return (
                <tr
                  key={lot.id}
                  className={i > 0 ? "border-t border-[var(--color-line)]" : ""}
                >
                  <td className="px-3 py-2 font-mono text-[10.5px] text-[var(--color-text-dim)]">
                    #{lot.id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10.5px] text-[var(--color-text-dim)]">
                    {formatDate(lot.received_at)}
                  </td>
                  <td className="px-3 py-2">
                    {lot.marketplace ? (
                      <span className="led led-auto">{lot.marketplace}</span>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-text-dim)]">
                    {qty}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-text-dim)]">
                    {unit.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-text)]">
                    {value.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-[3px] w-16 overflow-hidden rounded-[1px] bg-[var(--color-line)]">
                        <div
                          className="h-full bg-[var(--color-accent)]"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right font-mono tabular-nums text-[var(--color-text-dim)]">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Reconciliation hint — valuation table is server-rounded, so small drift is expected */}
      {Math.abs(lotsAggregate.qty - productQty) > 0.5 ||
      Math.abs(lotsAggregate.value - productValue) > 0.5 ? (
        <div className="mt-2 text-[10.5px] text-[var(--color-text-muted)]">
          Note: per-batch totals may drift slightly from the product total — the
          valuation row is aggregated server-side.
        </div>
      ) : null}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}
