import { useState } from "react";
import type { ProfitTransaction } from "../../lib/types";

interface TransactionListProps {
  transactions: ProfitTransaction[];
  loading: boolean;
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function TransactionList({ transactions, loading }: TransactionListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[72px] animate-pulse rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-glass)]"
          />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-line-strong)] bg-[var(--color-bg-card)] p-10 text-center text-[13px] text-[var(--color-text-muted)]">
        <div className="mb-1 text-[14px] font-medium text-[var(--color-text-dim)]">
          No sales in the current window
        </div>
        <div>
          Email-ingested sales land here automatically. Use{" "}
          <span className="font-mono">Update sales</span> above to poll the inbox.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx) => (
        <TransactionCard key={tx.id} tx={tx} />
      ))}
    </div>
  );
}

function TransactionCard({ tx }: { tx: ProfitTransaction }) {
  const [open, setOpen] = useState(false);

  const sale = num(tx.total_price);
  const cogs = num(tx.cogs);
  const profit = num(tx.profit);
  const totalCost = Math.max(0, sale - profit);
  const marginPct = sale > 0 ? (profit / sale) * 100 : 0;

  // Pull out signature fixed-cost entries for the breakdown strip
  const vat = tx.fixed_costs.find((c) => c.name === "vat");
  const commission = tx.fixed_costs.find((c) => c.name === "commission");
  const overhead = tx.fixed_costs.find((c) => c.name === "overhead");

  return (
    <div
      className={[
        "rounded-[var(--radius-md)] border border-[var(--color-line)] border-l-[3px] border-l-[var(--color-accent)] bg-[var(--color-glass)] backdrop-blur-xl transition",
        "hover:border-[var(--color-accent)] hover:shadow-[0_6px_22px_rgba(0,0,0,0.25),0_0_18px_var(--color-accent-glow)]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-3 text-left"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            <span className="font-mono text-[10.5px] text-[var(--color-text-dim)]">
              {tx.order_reference ?? tx.id.slice(0, 8)}
            </span>
            <span className="opacity-50">·</span>
            <span className="font-mono">{formatDate(tx.created_at)}</span>
            {tx.marketplace && (
              <>
                <span className="opacity-50">·</span>
                <span className="led led-auto">{tx.marketplace}</span>
              </>
            )}
          </div>
          <div className="truncate text-[14px] font-medium text-[var(--color-text)]">
            {tx.product_name ?? tx.product_ean}
            {tx.quantity > 1 && (
              <span className="ml-2 font-mono text-[12px] text-[var(--color-text-muted)]">
                × {tx.quantity}
              </span>
            )}
          </div>
        </div>

        <div className="hidden flex-col items-end gap-0.5 sm:flex">
          <div className="font-mono text-[13px] tabular-nums text-[var(--color-text-dim)]">
            €{sale.toFixed(2)}
          </div>
          <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            sale
          </div>
        </div>
        <div className="hidden flex-col items-end gap-0.5 sm:flex">
          <div className="font-mono text-[13px] tabular-nums text-[var(--color-text-dim)]">
            €{totalCost.toFixed(2)}
          </div>
          <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            total cost
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div
            className={[
              "font-mono text-[15px] font-semibold tabular-nums",
              profit >= 0
                ? "text-[var(--color-ok-ink)]"
                : "text-[var(--color-crit-ink)]",
            ].join(" ")}
          >
            {profit >= 0 ? "+" : "−"}€{Math.abs(profit).toFixed(2)}
          </div>
          <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            margin · {marginPct.toFixed(1)}%
          </div>
        </div>
        <span
          className={[
            "ml-1 text-[14px] text-[var(--color-text-muted)] transition-transform",
            open ? "rotate-90" : "",
          ].join(" ")}
          aria-hidden
        >
          ›
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-line)] px-5 py-4">
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <BreakdownChip label="COGS" value={cogs} />
            {vat && (
              <BreakdownChip
                label={`VAT ${vat.country ?? ""} · ${num(vat.value).toFixed(0)}%`}
                value={num(vat.amount)}
              />
            )}
            {commission && (
              <BreakdownChip
                label={`Commission · ${num(commission.value).toFixed(1)}%`}
                value={num(commission.amount)}
              />
            )}
            {overhead && (
              <BreakdownChip
                label="Overhead"
                value={num(overhead.amount)}
              />
            )}
          </div>

          {tx.components.length > 0 ? (
            <div>
              <div className="mb-2 text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                Components consumed
              </div>
              <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-line)]">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-[var(--color-glass)]">
                    <tr className="text-left text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                      <th className="px-3 py-2 font-medium">Part</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tx.components.map((c) => (
                      <tr
                        key={c.component_ean}
                        className="border-t border-[var(--color-line)]"
                      >
                        <td className="px-3 py-2 text-[var(--color-text-dim)]">
                          {c.component_name}
                          <span className="ml-2 font-mono text-[10.5px] text-[var(--color-text-muted)]">
                            {c.component_ean}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-text-dim)]">
                          {c.quantity}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-text-dim)]">
                          €{num(c.cost).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-[12px] text-[var(--color-text-muted)]">
              No component composition recorded for this EAN.
            </div>
          )}

          <div className="mt-3 text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            Stored values immutable (D-025) · view-only history
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownChip({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg-card)] px-3 py-2">
      <span className="truncate text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
        {label}
      </span>
      <span className="font-mono text-[12.5px] tabular-nums text-[var(--color-text-dim)]">
        €{value.toFixed(2)}
      </span>
    </div>
  );
}
