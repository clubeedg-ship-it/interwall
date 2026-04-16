import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { ProductItem, ShelfOccupancy } from "../../lib/types";
import { fillFor } from "../../config/wall";
import { Toggle } from "../Toggle";

export function BinDrawer({
  shelf,
  onClose,
  onPatched,
  onDeleted,
}: {
  shelf: ShelfOccupancy | null;
  onClose: () => void;
  onPatched: (shelfId: string) => void;
  onDeleted: (shelfId: string) => void;
}) {
  if (!shelf) return null;
  return (
    <>
      <div
        onClick={onClose}
        className="anim-backdrop-in fixed inset-0 z-30 bg-[rgba(10,12,16,0.35)]"
      />
      <aside
        role="dialog"
        aria-label={`Zone ${shelf.shelf_label}`}
        className="anim-drawer-in fixed right-0 top-0 z-40 flex h-full w-full max-w-[420px] flex-col border-l border-[var(--color-line)] bg-[var(--color-bg-elevated)] shadow-[-16px_0_40px_rgba(0,0,0,0.45)]"
      >
        <DrawerHeader shelf={shelf} onClose={onClose} />
        <DrawerBody shelf={shelf} onPatched={onPatched} onDeleted={onDeleted} />
      </aside>
    </>
  );
}

function DrawerHeader({
  shelf,
  onClose,
}: {
  shelf: ShelfOccupancy;
  onClose: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-[var(--color-line)] px-5 py-4">
      <div className="min-w-0">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
          Zone
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-[0.95rem] font-semibold text-[var(--color-accent)]">
            {shelf.shelf_label}
          </span>
          {shelf.single_bin && <span className="led led-auto">Solid</span>}
        </div>
      </div>
      <button onClick={onClose} className="btn-secondary" aria-label="Close">
        ESC · Close
      </button>
    </header>
  );
}

function DrawerBody({
  shelf,
  onPatched,
  onDeleted,
}: {
  shelf: ShelfOccupancy;
  onPatched: (shelfId: string) => void;
  onDeleted: (shelfId: string) => void;
}) {
  const fill = fillFor(shelf.total_qty, shelf.capacity);
  const fillLabel =
    fill === "empty" ? "Empty"
    : fill === "critical" ? "Low — critical"
    : fill === "warning" ? "Low — warning"
    : fill === "healthy" ? "Healthy"
    : "Unknown";

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
      <section>
        <SectionHeading>Stock</SectionHeading>
        <div className="mt-2 grid grid-cols-2 gap-[1px] bg-[var(--color-line)]">
          <StatTile label="Units">{shelf.total_qty}</StatTile>
          <StatTile label="Batches">{shelf.batch_count}</StatTile>
          <StatTile label="Value" hint="€">
            {shelf.total_value.toFixed(2)}
          </StatTile>
          <StatTile label="Status">
            <span className={`led fill-${fill}`}>{fillLabel}</span>
          </StatTile>
        </div>
      </section>

      {shelf.product_name && (
        <section>
          <SectionHeading>Primary product</SectionHeading>
          <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg-card)] px-4 py-3">
            <div className="truncate text-[14px] font-medium text-[var(--color-text)]">
              {shelf.product_name}
            </div>
            {shelf.product_ean && (
              <div className="mt-1 font-mono text-[11px] text-[var(--color-text-muted)]">
                EAN {shelf.product_ean}
              </div>
            )}
          </div>
        </section>
      )}

      {shelf.total_qty === 0 && (
        <AssignProductSection shelf={shelf} onAssigned={onPatched} />
      )}

      <ShelfConfigForm shelf={shelf} onPatched={onPatched} />
      <ShelfDangerZone shelf={shelf} onDeleted={onDeleted} />
    </div>
  );
}

// ---- Assign product to an empty zone --------------------------------------

function AssignProductSection({
  shelf,
  onAssigned,
}: {
  shelf: ShelfOccupancy;
  onAssigned: (shelfId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<ProductItem | null>(null);
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on shelf switch
  useEffect(() => {
    setQuery("");
    setResults([]);
    setPicked(null);
    setQty("1");
    setUnitCost("");
    setError(null);
  }, [shelf.shelf_id]);

  // Debounced typeahead — only when no pick yet and query non-empty
  const trimmed = query.trim();
  useEffect(() => {
    if (picked) return;
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await api.products.list({ q: trimmed, composite: "false" });
        if (!cancelled) setResults(rows.slice(0, 10));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [trimmed, picked]);

  const disabled = useMemo(() => {
    if (!picked) return true;
    const q = parseInt(qty, 10);
    const c = parseFloat(unitCost);
    return !q || q < 1 || isNaN(c) || c < 0;
  }, [picked, qty, unitCost]);

  async function assign() {
    if (!picked) return;
    const q = parseInt(qty, 10);
    const c = parseFloat(unitCost);
    setSaving(true);
    setError(null);
    try {
      await api.stockLots.create({
        ean: picked.ean,
        quantity: q,
        unit_cost: c,
        marketplace: "manual",
        shelf_id: shelf.shelf_id,
      });
      onAssigned(shelf.shelf_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <SectionHeading>Assign product</SectionHeading>
      <div className="mt-2 flex flex-col gap-2">
        {!picked ? (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, EAN, SKU…"
              className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
              autoFocus
            />
            {trimmed.length >= 2 && (
              <div className="max-h-56 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg-card)]">
                {searching ? (
                  <div className="px-3 py-3 text-[12px] text-[var(--color-text-muted)]">
                    Searching…
                  </div>
                ) : results.length === 0 ? (
                  <div className="px-3 py-3 text-[12px] text-[var(--color-text-muted)]">
                    No matches.
                  </div>
                ) : (
                  results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPicked(p)}
                      className="block w-full border-b border-[var(--color-line)] px-3 py-2 text-left transition-colors last:border-0 hover:bg-[var(--color-glass-strong)]"
                    >
                      <div className="truncate text-[13px] font-medium text-[var(--color-text)]">
                        {p.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 font-mono text-[10.5px] text-[var(--color-text-muted)]">
                        {p.sku && <span>{p.sku}</span>}
                        <span className="opacity-70">{p.ean}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-accent-border)] bg-[color-mix(in_oklab,var(--color-accent)_12%,transparent)] px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-[var(--color-text)]">
                  {picked.name}
                </div>
                <div className="mt-0.5 flex items-center gap-3 font-mono text-[10.5px] text-[var(--color-text-muted)]">
                  {picked.sku && <span>{picked.sku}</span>}
                  <span className="opacity-70">{picked.ean}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="text-[11px] text-[var(--color-text-dim)] underline-offset-2 hover:text-[var(--color-text)] hover:underline"
              >
                Change
              </button>
            </div>
          </div>
        )}

        {picked && (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                Quantity
              </span>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                Unit cost (€)
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0.00"
                className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
              />
            </label>
          </div>
        )}

        {picked && (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              {error && (
                <p className="text-[11.5px] font-medium text-[var(--color-pulse-critical)]">
                  {error}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={assign}
              disabled={disabled || saving}
              className="btn-primary text-[0.78rem]"
            >
              {saving ? "Assigning…" : "Assign to zone"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
      {children}
    </h3>
  );
}

function StatTile({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--color-bg-card)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-[18px] font-semibold tabular-nums text-[var(--color-text)]">
        {hint && (
          <span className="mr-1 text-[13px] font-normal text-[var(--color-text-muted)]">
            {hint}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

// ---- Config form (auto-save on blur / toggle change) ----------------------

function ShelfConfigForm({
  shelf,
  onPatched,
}: {
  shelf: ShelfOccupancy;
  onPatched: (shelfId: string) => void;
}) {
  const [capacityText, setCapacityText] = useState(
    shelf.capacity == null ? "" : String(shelf.capacity)
  );
  const [splitFifo, setSplitFifo] = useState(shelf.split_fifo);
  const [singleBin, setSingleBin] = useState(shelf.single_bin);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const baselineCapacity = useRef<string>(
    shelf.capacity == null ? "" : String(shelf.capacity)
  );

  // Reset form when shelf changes
  useEffect(() => {
    setCapacityText(shelf.capacity == null ? "" : String(shelf.capacity));
    setSplitFifo(shelf.split_fifo);
    setSingleBin(shelf.single_bin);
    baselineCapacity.current = shelf.capacity == null ? "" : String(shelf.capacity);
    setError(null);
  }, [shelf.shelf_id, shelf.capacity, shelf.split_fifo, shelf.single_bin]);

  async function save(field: "capacity" | "split_fifo" | "single_bin", body: Record<string, unknown>) {
    setError(null);
    setPending((p) => new Set(p).add(field));
    try {
      await api.shelves.patch(shelf.shelf_id, body);
      onPatched(shelf.shelf_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(field);
        return next;
      });
    }
  }

  function commitCapacity() {
    if (capacityText === baselineCapacity.current) return;
    const trimmed = capacityText.trim();
    if (trimmed === "") {
      baselineCapacity.current = "";
      void save("capacity", { capacity: null });
      return;
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0) {
      setError("Capacity must be a positive integer or blank.");
      return;
    }
    baselineCapacity.current = trimmed;
    void save("capacity", { capacity: n });
  }

  return (
    <section>
      <SectionHeading>Configuration</SectionHeading>
      <div className="mt-2 grid gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            Capacity <span className="opacity-60">(blank = unlimited)</span>
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={capacityText}
            onChange={(e) => setCapacityText(e.target.value)}
            onBlur={commitCapacity}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder="—"
            className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
          />
          {pending.has("capacity") && (
            <span className="text-[10.5px] text-[var(--color-text-muted)]">
              Saving…
            </span>
          )}
        </label>

        <ToggleRow
          label="Split FIFO"
          hint="Deduct from A before B (FIFO per bin, not shared)."
          checked={splitFifo}
          pending={pending.has("split_fifo")}
          onChange={(v) => {
            setSplitFifo(v);
            void save("split_fifo", { split_fifo: v });
          }}
        />
        <ToggleRow
          label="Solid bin"
          hint="Treat as one bin (no A/B). Refresh to see grid update."
          checked={singleBin}
          pending={pending.has("single_bin")}
          onChange={(v) => {
            setSingleBin(v);
            void save("single_bin", { single_bin: v });
          }}
        />
      </div>
      {error && (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_10%,transparent)] px-3 py-2 text-[12px] text-[var(--color-crit-ink)]">
          {error}
        </div>
      )}
    </section>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  pending,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  pending: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg-card)] px-3 py-2.5">
      <span className="min-w-0">
        <div className="text-[12.5px] font-medium text-[var(--color-text)]">
          {label} {pending && <span className="text-[10.5px] font-normal text-[var(--color-text-muted)]">saving…</span>}
        </div>
        <div className="mt-0.5 text-[10.5px] text-[var(--color-text-muted)]">
          {hint}
        </div>
      </span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

// ---- Danger zone — hard delete shelf --------------------------------------

function ShelfDangerZone({
  shelf,
  onDeleted,
}: {
  shelf: ShelfOccupancy;
  onDeleted: (shelfId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when drawer switches shelves.
  useEffect(() => {
    setConfirming(false);
    setPending(false);
    setError(null);
  }, [shelf.shelf_id]);

  async function confirmDelete() {
    setError(null);
    setPending(true);
    try {
      await api.shelves.remove(shelf.shelf_id);
      onDeleted(shelf.shelf_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <section>
      <SectionHeading>Danger zone</SectionHeading>
      <div className="mt-2 rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-crit)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_6%,transparent)] px-3 py-3">
        {!confirming ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11.5px] text-[var(--color-text-dim)]">
              Remove this zone from the rack. Refused if it still holds stock.
            </span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
              className="rounded-[var(--radius-xs)] border border-[color-mix(in_oklab,var(--color-crit)_40%,transparent)] bg-transparent px-2.5 py-1 text-[11px] font-semibold text-[var(--color-crit-ink)]"
            >
              Delete zone
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="text-[12px] text-[var(--color-crit-ink)]">
              Delete zone{" "}
              <span className="font-mono font-semibold">{shelf.shelf_label}</span>?
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
                disabled={pending}
                className="rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg-card)] px-2.5 py-1 text-[11px] text-[var(--color-text-dim)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={pending}
                className="rounded-[var(--radius-xs)] bg-[var(--color-crit)] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="mt-2 text-[11.5px] text-[var(--color-crit-ink)]">{error}</div>
        )}
      </div>
    </section>
  );
}
