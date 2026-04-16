import type { CashFlowScope } from "../../config/profit";
import { CASH_FLOW_SCOPES } from "../../config/profit";

interface KpiStripProps {
  margin: number;
  transactionCount: number;
  inventoryValue: number;
  cashFlow: number;
  cashFlowScope: CashFlowScope;
  onCashFlowScopeChange: (s: CashFlowScope) => void;
  onInventoryDrill: () => void;
  onRefreshInventory: () => void;
  inventoryRefreshing: boolean;
  loading: boolean;
}

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  return `${value < 0 ? "−" : ""}€${abs.toFixed(2)}`;
}

export function KpiStrip({
  margin,
  transactionCount,
  inventoryValue,
  cashFlow,
  cashFlowScope,
  onCashFlowScopeChange,
  onInventoryDrill,
  onRefreshInventory,
  inventoryRefreshing,
  loading,
}: KpiStripProps) {
  const marginPositive = margin >= 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile label="Margin" sublabel="loaded window">
        <div
          className={[
            "font-mono text-[28px] font-semibold tracking-tight tabular-nums",
            marginPositive
              ? "text-[var(--color-pulse-healthy)]"
              : "text-[var(--color-pulse-critical)]",
          ].join(" ")}
        >
          {loading ? "—" : formatCurrency(margin)}
        </div>
        <MarginPulse positive={marginPositive} loading={loading} />
      </KpiTile>

      <KpiTile label="Transactions" sublabel="sales loaded">
        <div className="font-mono text-[28px] font-semibold tabular-nums text-[var(--color-text)]">
          {loading ? "—" : transactionCount}
        </div>
        <div className="mt-2 h-[3px] w-full overflow-hidden rounded-[1px] bg-[var(--color-line)]">
          <div
            className="h-full bg-[var(--color-accent)] transition-[width] duration-500"
            style={{
              width: `${Math.min(100, transactionCount * 4)}%`,
            }}
          />
        </div>
      </KpiTile>

      <button
        type="button"
        onClick={onInventoryDrill}
        className="group relative flex flex-col items-start gap-1 rounded-[var(--radius-md)] border border-[var(--color-line)] border-l-[3px] border-l-[var(--color-accent)] bg-[var(--color-glass)] p-4 text-left backdrop-blur-xl transition hover:border-[var(--color-accent)] hover:shadow-[0_0_22px_var(--color-accent-glow)]"
        title="Open inventory valuation breakdown"
      >
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            Inventory value
          </span>
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onRefreshInventory();
            }}
            className={[
              "flex h-5 w-5 items-center justify-center rounded-[3px] text-[11px] text-[var(--color-text-muted)] transition hover:text-[var(--color-accent)]",
              inventoryRefreshing ? "animate-spin text-[var(--color-accent)]" : "",
            ].join(" ")}
            aria-label="Refresh valuation"
          >
            ↻
          </span>
        </div>
        <div className="font-mono text-[28px] font-semibold tabular-nums text-[var(--color-text)]">
          {loading ? "—" : formatCurrency(inventoryValue)}
        </div>
        <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-accent)] opacity-70 transition group-hover:opacity-100">
          drill down →
        </span>
      </button>

      <KpiTile
        label="Cash flow"
        sublabel={null}
        headerRight={
          <select
            value={cashFlowScope}
            onChange={(e) =>
              onCashFlowScopeChange(e.target.value as CashFlowScope)
            }
            className="rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 text-[11px] text-[var(--color-text-dim)] focus:border-[var(--color-accent-border)] focus:outline-none"
          >
            {CASH_FLOW_SCOPES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        }
      >
        <div className="font-mono text-[28px] font-semibold tabular-nums text-[var(--color-text)]">
          {loading ? "—" : formatCurrency(cashFlow)}
        </div>
        <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          gross revenue · {cashFlowScope}
        </div>
      </KpiTile>
    </div>
  );
}

interface KpiTileProps {
  label: string;
  sublabel: string | null;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}

function KpiTile({ label, sublabel, children, headerRight }: KpiTileProps) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-line)] border-l-[3px] border-l-[var(--color-accent)] bg-[var(--color-glass)] p-4 backdrop-blur-xl">
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
          {label}
        </span>
        {headerRight}
      </div>
      {children}
      {sublabel && (
        <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          {sublabel}
        </div>
      )}
    </div>
  );
}

function MarginPulse({
  positive,
  loading,
}: {
  positive: boolean;
  loading: boolean;
}) {
  if (loading) {
    return <div className="mt-2 h-[3px] w-full rounded-[1px] bg-[var(--color-line)]" />;
  }
  return (
    <div className="mt-2 flex h-[3px] w-full overflow-hidden rounded-[1px] bg-[var(--color-line)]">
      <div
        className={[
          "h-full w-full",
          positive
            ? "bg-[var(--color-pulse-healthy)] opacity-85"
            : "bg-[var(--color-pulse-critical)] opacity-85",
        ].join(" ")}
      />
    </div>
  );
}
