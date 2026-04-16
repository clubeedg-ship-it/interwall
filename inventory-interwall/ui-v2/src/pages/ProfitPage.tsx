import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type {
  BackorderRow,
  ProfitTransaction,
  ProfitValuationRow,
} from "../lib/types";
import {
  DEFAULT_PERIOD,
  PERIOD_SCOPES,
  type CashFlowScope,
  type PeriodScope,
} from "../config/profit";
import { KpiStrip } from "../components/profit/KpiStrip";
import { TrendChart } from "../components/profit/TrendChart";
import { TransactionList } from "../components/profit/TransactionList";
import { CostConfigPanel } from "../components/profit/CostConfigPanel";
import { BackorderList } from "../components/profit/BackorderList";
import { PageHeader } from "../components/PageHeader";
import { TabButton } from "../components/TabButton";

type ProfitTab = "active" | "backorder";

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export default function ProfitPage() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<ProfitTransaction[]>([]);
  const [valuation, setValuation] = useState<ProfitValuationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [valLoading, setValLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodScope>(DEFAULT_PERIOD);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [cashFlowScope, setCashFlowScope] = useState<CashFlowScope>("today");
  const [configOpen, setConfigOpen] = useState(false);
  const [polling, setPolling] = useState(false);
  const [tab, setTab] = useState<ProfitTab>("active");
  const [backorders, setBackorders] = useState<BackorderRow[]>([]);
  const [backordersLoading, setBackordersLoading] = useState(false);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.profit.transactions({ limit: 200 });
      setTransactions(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadValuation = useCallback(async () => {
    setValLoading(true);
    try {
      const rows = await api.profit.valuation();
      setValuation(rows);
    } catch (err) {
      // Valuation is secondary — surface in the main error channel.
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setValLoading(false);
    }
  }, []);

  const loadBackorders = useCallback(async () => {
    setBackordersLoading(true);
    try {
      const rows = await api.ingestion.backorders();
      setBackorders(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBackordersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
    void loadValuation();
    void loadBackorders();
  }, [loadTransactions, loadValuation, loadBackorders]);

  const chartTx = useMemo(
    () =>
      transactions.map((tx) => ({
        date: tx.created_at,
        sale: num(tx.total_price),
        cost: Math.max(0, num(tx.total_price) - num(tx.profit)),
        margin: num(tx.profit),
      })),
    [transactions]
  );

  const kpis = useMemo(() => {
    const marginSum = transactions.reduce((s, t) => s + num(t.profit), 0);
    const inv = valuation.reduce((s, v) => s + num(v.total_value), 0);
    const now = new Date();
    let cashFlow = 0;
    for (const tx of transactions) {
      const d = new Date(tx.created_at);
      const include =
        cashFlowScope === "today"
          ? d.toDateString() === now.toDateString()
          : d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear();
      if (include) cashFlow += num(tx.total_price);
    }
    return { marginSum, inv, cashFlow };
  }, [transactions, valuation, cashFlowScope]);

  const triggerPoll = async () => {
    if (polling) return;
    setPolling(true);
    try {
      await api.profit.pollNow();
      // Legacy waits ~8s for the poller to land new rows before reloading.
      await new Promise((r) => setTimeout(r, 7000));
      await loadTransactions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setPolling(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16 pt-6">
      <PageHeader
        title="Profitability engine"
        description="Live ledger of recorded sales — margin, costs, inventory value — fed by the email-ingestion pipeline. Stored economics are immutable; config edits apply to future sales."
        actions={
          <>
            <button
              type="button"
              onClick={() => void triggerPoll()}
              className="btn-secondary"
              disabled={polling}
              title="Poll marketplace inbox for new sales"
            >
              {polling ? "Checking inbox…" : "Update sales"}
            </button>
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="btn-secondary"
              title="Open cost configuration"
            >
              Configure costs
            </button>
            <button
              type="button"
              onClick={() => {
                void loadTransactions();
                void loadValuation();
                void loadBackorders();
              }}
              className="btn-secondary"
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </>
        }
      />

      {error && (
        <div className="row-card mb-4 border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_10%,transparent)] text-[13px] text-[var(--color-crit-ink)]">
          {error}
        </div>
      )}

      <KpiStrip
        margin={kpis.marginSum}
        transactionCount={transactions.length}
        inventoryValue={kpis.inv}
        cashFlow={kpis.cashFlow}
        cashFlowScope={cashFlowScope}
        onCashFlowScopeChange={setCashFlowScope}
        onInventoryDrill={() => navigate("/profit/inventory")}
        onRefreshInventory={() => void loadValuation()}
        inventoryRefreshing={valLoading}
        loading={loading && transactions.length === 0}
      />

      <section className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-glass)] p-4 backdrop-blur-xl sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Trend
            </div>
            <h2 className="text-[15px] font-medium tracking-tight text-[var(--color-text)]">
              Revenue · cost · profit
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] p-1">
              {PERIOD_SCOPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setPeriod(s.key)}
                  className={[
                    "rounded-[var(--radius-xs)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] transition",
                    period === s.key
                      ? "bg-[color-mix(in_oklab,var(--color-accent)_22%,transparent)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_var(--color-accent-border)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-dim)]",
                  ].join(" ")}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {period === "custom" && (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 font-mono text-[11px] text-[var(--color-text-dim)]"
                />
                <span className="text-[11px] text-[var(--color-text-muted)]">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 font-mono text-[11px] text-[var(--color-text-dim)]"
                />
              </div>
            )}
          </div>
        </div>

        <TrendChart
          transactions={chartTx}
          scope={period}
          customFrom={customFrom}
          customTo={customTo}
        />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center gap-1 border-b border-[var(--color-line)]">
          <TabButton
            label="Active"
            active={tab === "active"}
            onClick={() => setTab("active")}
            badge={transactions.length}
          />
          <TabButton
            label="Backorder"
            active={tab === "backorder"}
            onClick={() => setTab("backorder")}
            badge={backorders.length}
            attention={backorders.length > 0}
            title="Sales waiting on stock — will book once replenished"
          />
          <span className="ml-auto font-mono text-[11px] text-[var(--color-text-muted)]">
            {tab === "active"
              ? `${transactions.length} recorded · newest first`
              : `${backorders.length} blocked on stock · newest first`}
          </span>
        </div>
        {tab === "active" ? (
          <TransactionList
            transactions={transactions}
            loading={loading && transactions.length === 0}
          />
        ) : (
          <BackorderList
            rows={backorders}
            loading={backordersLoading && backorders.length === 0}
          />
        )}
      </section>

      <CostConfigPanel
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onChanged={() => {
          // Config edits don't retro-apply (D-025), but refresh valuation so
          // any newly added marketplace rates surface in the drill.
          void loadValuation();
        }}
      />
    </div>
  );
}
