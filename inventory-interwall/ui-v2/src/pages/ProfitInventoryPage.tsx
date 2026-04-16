import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { api, ApiError } from "../lib/api";
import type { ProfitValuationRow } from "../lib/types";
import { InventoryTable } from "../components/profit/InventoryTable";

export default function ProfitInventoryPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProfitValuationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.profit.valuation());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16 pt-6">
      <nav className="mb-3 text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        <button
          type="button"
          onClick={() => navigate("/profit")}
          className="inline-flex items-center gap-1 text-[var(--color-text-dim)] transition hover:text-[var(--color-accent)]"
        >
          <span aria-hidden>←</span>
          <span>Profitability</span>
        </button>
        <span className="mx-2 opacity-50">/</span>
        <span className="text-[var(--color-text-dim)]">Inventory valuation</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Inventory valuation
          </h1>
          <p className="mt-1 max-w-[640px] text-[13.5px] leading-relaxed text-[var(--color-text-dim)]">
            Live FIFO cost basis per product across all open lots. Source of
            truth for balance-sheet inventory value.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="btn-secondary"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="row-card mb-4 border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_10%,transparent)] text-[13px] text-[var(--color-crit-ink)]">
          {error}
        </div>
      )}

      <section className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-glass)] p-4 backdrop-blur-xl sm:p-5">
        <InventoryTable rows={rows} loading={loading && rows.length === 0} />
      </section>
    </div>
  );
}
