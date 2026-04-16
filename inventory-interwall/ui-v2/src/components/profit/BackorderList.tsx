import type { BackorderRow } from "../../lib/types";

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
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
      <div className="grid grid-cols-1 gap-2">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-glass)]"
          />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="row-card justify-center py-10 text-[var(--color-text-muted)]">
        No orders waiting on stock. All confirmed sales are booked.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2">
      {rows.map((r) => (
        <BackorderCard key={r.id} row={r} />
      ))}
    </div>
  );
}

function BackorderCard({ row }: { row: BackorderRow }) {
  const title = row.product_description ?? row.sku ?? row.external_id ?? row.id;
  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--color-line)] border-l-[3px] border-l-[var(--color-pulse-warning)] bg-[var(--color-glass)] px-5 py-3 backdrop-blur-sm">
      <header className="flex flex-wrap items-center gap-3">
        {row.marketplace && (
          <span className="inline-flex items-center rounded-full border border-[var(--color-accent-border)] bg-[color-mix(in_oklab,var(--color-accent)_18%,transparent)] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
            {row.marketplace}
          </span>
        )}
        {row.sku && (
          <span className="font-mono text-[12.5px] font-semibold text-[var(--color-text)]">
            {row.sku}
          </span>
        )}
        <span className="ml-auto text-[11px] text-[var(--color-text-muted)]">
          {fmtDate(row.created_at)}
        </span>
      </header>

      <p className="mt-1.5 truncate text-[13px] text-[var(--color-text-dim)]">
        {title}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11.5px] font-mono text-[var(--color-text-muted)]">
        {row.quantity != null && (
          <span>
            <span className="text-[var(--color-text-dim)]">qty</span>{" "}
            <span className="text-[var(--color-text)] tabular-nums">{row.quantity}</span>
          </span>
        )}
        <span>
          <span className="text-[var(--color-text-dim)]">total</span>{" "}
          <span className="text-[var(--color-text)] tabular-nums">
            {fmtMoney(row.total_price)}
          </span>
        </span>
        {row.external_id && (
          <span>
            <span className="text-[var(--color-text-dim)]">ref</span> {row.external_id}
          </span>
        )}
        {row.product_ean && (
          <span>
            <span className="text-[var(--color-text-dim)]">ean</span> {row.product_ean}
          </span>
        )}
      </div>

      {row.error_message && (
        <p className="mt-2 line-clamp-2 text-[11px] text-[var(--color-text-muted)]">
          {row.error_message.split("\n")[0]}
        </p>
      )}
    </article>
  );
}
