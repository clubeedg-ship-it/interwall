import { useState } from "react";
import type { BackorderComponent, BackorderRow } from "../../lib/types";

function fmtDate(iso: string): string {
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

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return `€${n.toFixed(2)}`;
}

export function BackorderList({
  rows,
  loading,
}: {
  rows: BackorderRow[];
  loading?: boolean;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[128px] animate-pulse rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-glass)]"
          />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-line-strong)] bg-[var(--color-bg-card)] p-10 text-center text-[13px] text-[var(--color-text-muted)]">
        <div className="mb-1 text-[14px] font-medium text-[var(--color-text-dim)]">
          No orders waiting on stock
        </div>
        <div>All confirmed sales are booked.</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <BackorderCard key={r.id} row={r} />
      ))}
    </div>
  );
}

function BackorderCard({ row }: { row: BackorderRow }) {
  const [open, setOpen] = useState(false);
  const hasComponents = row.components.length > 0;

  const title =
    row.product_description ?? row.sku ?? row.external_id ?? row.id.slice(0, 8);
  const qty = row.quantity ?? 0;

  return (
    <div
      className={[
        "rounded-[var(--radius-md)] border border-[var(--color-line)] border-l-[3px] border-l-[var(--color-pulse-warning)] bg-[var(--color-glass)] backdrop-blur-xl transition",
        "hover:border-[color-mix(in_oklab,var(--color-pulse-warning)_55%,var(--color-line))] hover:shadow-[0_6px_22px_rgba(0,0,0,0.25),0_0_16px_var(--color-pulse-warning-glow)]",
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
              {row.sku ?? row.id.slice(0, 8)}
            </span>
            <span className="opacity-50">·</span>
            <span className="font-mono">{fmtDate(row.created_at)}</span>
            {row.marketplace && (
              <>
                <span className="opacity-50">·</span>
                <span className="led led-auto">{row.marketplace}</span>
              </>
            )}
            {row.build_code && (
              <>
                <span className="opacity-50">·</span>
                <span className="font-mono text-[10.5px]">{row.build_code}</span>
              </>
            )}
          </div>
          <div className="truncate text-[14px] font-medium text-[var(--color-text)]">
            {title}
            {qty > 1 && (
              <span className="ml-2 font-mono text-[12px] text-[var(--color-text-muted)]">
                × {qty}
              </span>
            )}
          </div>
        </div>

        <div className="hidden flex-col items-end gap-0.5 sm:flex">
          <div className="font-mono text-[13px] tabular-nums text-[var(--color-text-dim)]">
            {fmtMoney(row.total_price)}
          </div>
          <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            sale
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div className="font-mono text-[15px] font-semibold tabular-nums text-[var(--color-pulse-warning)]">
            {row.components.reduce((n, c) => n + (c.shortage > 0 ? 1 : 0), 0)}
          </div>
          <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            short
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

      <div className="border-t border-[var(--color-line)] px-5 py-3">
        {hasComponents ? (
          <ComponentTable components={row.components} />
        ) : (
          <div className="text-[12px] italic text-[var(--color-text-muted)]">
            No component context resolvable. Raw error below.
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-[var(--color-line)] bg-[var(--color-bg-card)] px-5 py-3">
          <div className="mb-1 text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            Error
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-snug text-[var(--color-text-dim)]">
            {row.error_message?.trim() || "(no error body)"}
          </pre>
          {row.external_id && (
            <div className="mt-2 text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Order reference:{" "}
              <span className="font-mono text-[var(--color-text-dim)]">
                {row.external_id}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComponentTable({ components }: { components: BackorderComponent[] }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-line)]">
      <table className="w-full text-[12.5px]">
        <thead className="bg-[var(--color-glass)]">
          <tr className="text-left text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            <th className="px-3 py-2 font-medium">Component</th>
            <th className="px-3 py-2 text-right font-medium">Need</th>
            <th className="px-3 py-2 text-right font-medium">Have</th>
            <th className="px-3 py-2 text-right font-medium">Short</th>
          </tr>
        </thead>
        <tbody>
          {components.map((c, i) => {
            const short = c.shortage > 0;
            return (
              <tr
                key={`${c.source_type}:${c.id ?? i}`}
                className={[
                  "border-t border-[var(--color-line)]",
                  short ? "bg-[color-mix(in_oklab,var(--color-pulse-critical)_6%,transparent)]" : "",
                ].join(" ")}
              >
                <td className="px-3 py-2 text-[var(--color-text-dim)]">
                  <span
                    className={[
                      "mr-2 inline-block rounded-[var(--radius-xs)] border px-1 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em]",
                      c.source_type === "item_group"
                        ? "border-[var(--color-accent-border)] text-[var(--color-accent)]"
                        : "border-[var(--color-line)] text-[var(--color-text-muted)]",
                    ].join(" ")}
                  >
                    {c.source_type === "item_group" ? "model" : "part"}
                  </span>
                  <span
                    className={
                      short
                        ? "font-medium text-[var(--color-text)]"
                        : "text-[var(--color-text-dim)]"
                    }
                  >
                    {c.name ?? c.id ?? "(unknown)"}
                  </span>
                  {c.code && (
                    <span className="ml-2 font-mono text-[10.5px] text-[var(--color-text-muted)]">
                      {c.code}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-text-dim)]">
                  {c.needed_qty}
                </td>
                <td
                  className={[
                    "px-3 py-2 text-right font-mono tabular-nums",
                    c.on_hand_qty === 0
                      ? "text-[var(--color-pulse-critical)]"
                      : "text-[var(--color-text-dim)]",
                  ].join(" ")}
                >
                  {c.on_hand_qty}
                </td>
                <td
                  className={[
                    "px-3 py-2 text-right font-mono tabular-nums",
                    short
                      ? "font-semibold text-[var(--color-pulse-critical)]"
                      : "text-[var(--color-text-muted)]",
                  ].join(" ")}
                >
                  {short ? `-${c.shortage}` : "0"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
