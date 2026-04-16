import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { FixedCost, VatRate } from "../../lib/types";

interface CostConfigPanelProps {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function CostConfigPanel({
  open,
  onClose,
  onChanged,
}: CostConfigPanelProps) {
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [vatRates, setVatRates] = useState<VatRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.allSettled([api.fixedCosts.list(), api.vatRates.list()])
      .then(([fRes, vRes]) => {
        if (cancelled) return;
        if (fRes.status === "fulfilled") setFixedCosts(fRes.value);
        if (vRes.status === "fulfilled") setVatRates(vRes.value);
        const first =
          fRes.status === "rejected"
            ? fRes.reason
            : vRes.status === "rejected"
              ? vRes.reason
              : null;
        if (first) {
          setError(first instanceof ApiError ? first.message : String(first));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const updateFixedCost = async (
    id: string,
    patch: { value?: number; is_percentage?: boolean }
  ) => {
    const current = fixedCosts.find((c) => c.id === id);
    if (!current) return;
    const nextValue = patch.value ?? num(current.value);
    const nextIsPct = patch.is_percentage ?? current.is_percentage;
    setFixedCosts((list) =>
      list.map((c) =>
        c.id === id ? { ...c, value: nextValue, is_percentage: nextIsPct } : c
      )
    );
    try {
      await api.fixedCosts.update(id, {
        value: nextValue,
        is_percentage: nextIsPct,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  const updateVat = async (id: string, rate: number) => {
    setVatRates((list) =>
      list.map((v) => (v.id === id ? { ...v, rate } : v))
    );
    try {
      await api.vatRates.update(id, rate);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <>
      {/* Scrim — clicking closes, matches legacy modal dismiss behavior without being a modal */}
      <div
        onClick={onClose}
        aria-hidden
        className={[
          "fixed inset-0 z-40 bg-[var(--color-bg-overlay)] backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />
      <aside
        className={[
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-[460px] flex-col overflow-hidden border-l border-[var(--color-line-strong)] bg-[var(--color-bg-elevated)] shadow-[-12px_0_40px_rgba(0,0,0,0.4)] transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        role="dialog"
        aria-label="Cost configuration"
      >
        <header className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-4">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
              Profit engine
            </div>
            <h2 className="text-[16px] font-semibold tracking-tight">
              Cost configuration
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            aria-label="Close"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_10%,transparent)] px-3 py-2 text-[12px] text-[var(--color-crit-ink)]">
              {error}
            </div>
          )}

          <Section title="Fixed costs" hint="Applied to every recorded sale.">
            {loading && fixedCosts.length === 0 ? (
              <PanelSkeleton />
            ) : fixedCosts.length === 0 ? (
              <EmptyRow>No fixed costs configured yet.</EmptyRow>
            ) : (
              <div className="space-y-2">
                {fixedCosts.map((c) => (
                  <FixedCostRow
                    key={c.id}
                    cost={c}
                    onValueChange={(v) =>
                      void updateFixedCost(c.id, { value: v })
                    }
                    onToggleType={() =>
                      void updateFixedCost(c.id, {
                        is_percentage: !c.is_percentage,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="VAT rates"
            hint="Applied per marketplace on gross sale price."
          >
            {loading && vatRates.length === 0 ? (
              <PanelSkeleton />
            ) : vatRates.length === 0 ? (
              <EmptyRow>
                No VAT rows. Rates are created automatically when sales arrive
                from new marketplaces.
              </EmptyRow>
            ) : (
              <div className="space-y-2">
                {vatRates.map((v) => (
                  <VatRow
                    key={v.id}
                    rate={v}
                    onChange={(rate) => void updateVat(v.id, rate)}
                  />
                ))}
              </div>
            )}
          </Section>

          <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            Changes persist immediately · future sales only · D-025
          </div>
        </div>
      </aside>
    </>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-dim)]">
          {title}
        </h3>
        {hint && (
          <span className="text-[10.5px] text-[var(--color-text-muted)]">
            {hint}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function FixedCostRow({
  cost,
  onValueChange,
  onToggleType,
}: {
  cost: FixedCost;
  onValueChange: (v: number) => void;
  onToggleType: () => void;
}) {
  const [draft, setDraft] = useState(String(num(cost.value)));

  useEffect(() => {
    setDraft(String(num(cost.value)));
  }, [cost.value]);

  const commit = () => {
    const v = parseFloat(draft);
    if (!Number.isFinite(v) || v < 0) {
      setDraft(String(num(cost.value)));
      return;
    }
    if (v !== num(cost.value)) onValueChange(v);
  };

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-glass)] px-3 py-2">
      <div className="flex-1">
        <div className="text-[13px] font-medium text-[var(--color-text)]">
          {cost.name}
        </div>
        <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          {cost.is_percentage ? "% of sale" : "fixed €"}
        </div>
      </div>
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        step="0.01"
        min="0"
        className="w-24 rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 text-right font-mono text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none"
      />
      <button
        type="button"
        onClick={onToggleType}
        className={[
          "rounded-[var(--radius-xs)] border px-2 py-1 font-mono text-[11px] transition",
          cost.is_percentage
            ? "border-[var(--color-accent-border)] bg-[color-mix(in_oklab,var(--color-accent)_18%,transparent)] text-[var(--color-accent)]"
            : "border-[var(--color-line)] bg-[var(--color-glass)] text-[var(--color-text-dim)] hover:border-[var(--color-accent-border)] hover:text-[var(--color-accent)]",
        ].join(" ")}
        title="Toggle between % of sale price and fixed € amount"
      >
        {cost.is_percentage ? "%" : "€"}
      </button>
    </div>
  );
}

function VatRow({
  rate,
  onChange,
}: {
  rate: VatRate;
  onChange: (rate: number) => void;
}) {
  const [draft, setDraft] = useState(String(num(rate.rate)));

  useEffect(() => {
    setDraft(String(num(rate.rate)));
  }, [rate.rate]);

  const commit = () => {
    const v = parseFloat(draft);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      setDraft(String(num(rate.rate)));
      return;
    }
    if (v !== num(rate.rate)) onChange(v);
  };

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-glass)] px-3 py-2">
      <div className="flex-1">
        <div className="text-[13px] font-medium text-[var(--color-text)]">
          {rate.marketplace}
        </div>
        <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          {rate.country}
        </div>
      </div>
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        step="0.1"
        min="0"
        max="100"
        className="w-20 rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 text-right font-mono text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none"
      />
      <span className="font-mono text-[11px] text-[var(--color-text-muted)]">%</span>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[48px] animate-pulse rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-glass)]"
        />
      ))}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-line-strong)] px-3 py-4 text-center text-[12px] text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}
