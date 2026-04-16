import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import type {
  CategoryItem,
  HealthTier,
  ProductItem,
  StockLotForProduct,
} from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { HealthChipStrip, HealthDot } from "../components/HealthChipStrip";
import { LocationPicker } from "../components/LocationPicker";
import { Modal } from "../components/Modal";
import { CategoryManager } from "../components/CategoryManager";
import { useHealth } from "../hooks/useHealth";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PartWithStock extends ProductItem {
  total_qty: number;
  health: HealthTier;
}

// ── Batch row ─────────────────────────────────────────────────────────────────

function BatchRow({
  lot,
  onChanged,
}: {
  lot: StockLotForProduct;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<null | "consume" | "transfer">(null);
  const [qty, setQty] = useState("1");
  const [destShelfId, setDestShelfId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cost = Number(lot.unit_cost).toFixed(2);
  const total = (lot.quantity * Number(lot.unit_cost)).toFixed(2);
  const date = lot.received_at
    ? new Date(lot.received_at).toLocaleDateString()
    : "";
  const locText = lot.shelf_label
    ? lot.zone_name
      ? `${lot.zone_name} · ${lot.shelf_label}`
      : lot.shelf_label
    : "Unassigned";

  const closeMode = () => {
    setMode(null);
    setErr(null);
    setDestShelfId(null);
  };

  const openConsume = () => {
    setMode(mode === "consume" ? null : "consume");
    setErr(null);
    setQty("1");
  };

  const openTransfer = () => {
    setMode(mode === "transfer" ? null : "transfer");
    setErr(null);
    setQty(String(lot.quantity));
    setDestShelfId(null);
  };

  const submitConsume = async () => {
    const q = parseInt(qty, 10);
    if (!q || q < 1) { setErr("Qty must be ≥ 1"); return; }
    if (q > lot.quantity) { setErr(`Qty exceeds remaining (${lot.quantity})`); return; }
    setBusy(true);
    setErr(null);
    try {
      await api.stockLots.consume(lot.id, { qty: q });
      closeMode();
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitTransfer = async () => {
    if (!destShelfId) { setErr("Pick a destination zone"); return; }
    if (destShelfId === lot.shelf_id) { setErr("Destination must differ from source"); return; }
    const q = parseInt(qty, 10);
    if (!q || q < 1) { setErr("Qty must be ≥ 1"); return; }
    if (q > lot.quantity) { setErr(`Qty exceeds remaining (${lot.quantity})`); return; }
    setBusy(true);
    setErr(null);
    try {
      await api.stockLots.transfer({
        lot_id: lot.id,
        to_shelf_id: destShelfId,
        qty: q,
      });
      closeMode();
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group border-b border-[var(--color-line)] py-2 last:border-0">
      <div className="flex items-center gap-5 text-[0.78rem]">
        <span className="shrink-0 font-mono text-[0.72rem] text-[var(--color-text-muted)]">
          {date}
        </span>
        <span className="shrink-0 text-[var(--color-text-dim)]">
          {lot.marketplace ?? "—"}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[0.72rem] text-[var(--color-text-muted)]">
          {locText}
        </span>
        <span className="shrink-0 font-semibold tabular-nums text-[var(--color-text)]">
          {lot.quantity} units
        </span>
        <span className="shrink-0 tabular-nums text-[var(--color-text-muted)]">
          €{cost}/u
        </span>
        <span className="shrink-0 tabular-nums text-[var(--color-text-dim)]">
          €{total}
        </span>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={openConsume}
            className={`rounded-[var(--radius-xs)] border px-2 py-1 text-[0.7rem] transition-colors ${
              mode === "consume"
                ? "border-[var(--color-accent-border)] text-[var(--color-text)]"
                : "border-[var(--color-line)] text-[var(--color-text-dim)] hover:border-[var(--color-accent-border)] hover:text-[var(--color-text)]"
            }`}
          >
            Consume
          </button>
          <button
            type="button"
            onClick={openTransfer}
            className={`rounded-[var(--radius-xs)] border px-2 py-1 text-[0.7rem] transition-colors ${
              mode === "transfer"
                ? "border-[var(--color-accent-border)] text-[var(--color-text)]"
                : "border-[var(--color-line)] text-[var(--color-text-dim)] hover:border-[var(--color-accent-border)] hover:text-[var(--color-text)]"
            }`}
          >
            Transfer
          </button>
        </div>
      </div>

      {mode && (
        <div className="anim-fade-slide-in mt-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] p-3">
          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {mode === "consume"
              ? "Consume from this batch"
              : "Transfer to another zone"}
          </div>
          <div
            className={`grid grid-cols-1 gap-3 ${
              mode === "transfer" ? "sm:grid-cols-3" : "sm:grid-cols-2"
            }`}
          >
            <Field label={`Qty (max ${lot.quantity})`}>
              <input
                type="number"
                min={1}
                max={lot.quantity}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            {mode === "transfer" && (
              <Field label="Destination zone" span={2}>
                <LocationPicker
                  value={destShelfId}
                  onChange={setDestShelfId}
                  placeholder="Pick zone…"
                />
              </Field>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              {err && (
                <p className="text-[12px] font-medium text-[var(--color-pulse-critical)]">
                  {err}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={closeMode}
                disabled={busy}
                className="btn-secondary text-[0.78rem]"
              >
                Cancel
              </button>
              <button
                onClick={mode === "consume" ? submitConsume : submitTransfer}
                disabled={busy}
                className="btn-primary text-[0.78rem]"
              >
                {busy
                  ? "Saving…"
                  : mode === "consume"
                  ? "Consume"
                  : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add-batch form ────────────────────────────────────────────────────────────

function AddBatchForm({ ean, onDone }: { ean: string; onDone: () => void }) {
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [market, setMarket] = useState("manual");
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const q = parseInt(qty, 10);
    const c = parseFloat(cost);
    if (!q || q < 1) { setErr("Quantity must be ≥ 1"); return; }
    if (isNaN(c) || c < 0) { setErr("Unit cost must be ≥ 0"); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.stockLots.create({
        ean,
        quantity: q,
        unit_cost: c,
        marketplace: market.trim() || "manual",
        ...(shelfId ? { shelf_id: shelfId } : {}),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] p-4">
      <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        Add Batch
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Quantity *">
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Unit cost (€) *">
          <input
            type="number"
            min={0}
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Marketplace">
          <input
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Zone Location">
          <LocationPicker
            value={shelfId}
            onChange={setShelfId}
            placeholder="Choose location…"
          />
        </Field>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {err && (
            <p className="text-[12px] font-medium text-[var(--color-pulse-critical)]">
              {err}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onDone} disabled={saving} className="btn-secondary text-[0.8rem]">
            Cancel
          </button>
          <button onClick={submit} disabled={saving} className="btn-primary text-[0.8rem]">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit-part form ────────────────────────────────────────────────────────────

function EditPartForm({
  part,
  categories,
  onDone,
}: {
  part: ProductItem;
  categories: CategoryItem[];
  onDone: () => void;
}) {
  const [name, setName] = useState(part.name);
  const [sku, setSku] = useState(part.sku ?? "");
  const [desc, setDesc] = useState(part.description ?? "");
  const [catId, setCatId] = useState(part.category_id ?? "");
  const [minStock, setMinStock] = useState(String(part.minimum_stock ?? 0));
  const [deliveryDays, setDeliveryDays] = useState(
    part.avg_delivery_days != null ? String(part.avg_delivery_days) : ""
  );
  const [avgSoldPerDay, setAvgSoldPerDay] = useState(
    part.avg_sold_per_day != null ? String(part.avg_sold_per_day) : ""
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reorderPoint = useMemo(() => {
    const dd = parseFloat(deliveryDays) || 0;
    const sd = parseFloat(avgSoldPerDay) || 0;
    const ms = parseInt(minStock, 10) || 0;
    return Math.max(0, Math.ceil(dd * sd) + ms);
  }, [deliveryDays, avgSoldPerDay, minStock]);

  const submit = async () => {
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.products.update(part.ean, {
        name: name.trim(),
        sku: sku.trim() || null,
        description: desc.trim() || null,
        minimum_stock: parseInt(minStock, 10) || 0,
        avg_delivery_days: deliveryDays.trim() ? parseFloat(deliveryDays) : null,
        avg_sold_per_day: avgSoldPerDay.trim() ? parseFloat(avgSoldPerDay) : null,
        category_id: catId || null,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-accent-border)] bg-[var(--color-bg)]">
      <div className="border-b border-[var(--color-line)] px-5 py-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
          Edit — <span className="font-mono text-[var(--color-accent)]">{part.ean}</span>
        </div>
      </div>

      <div className="px-5 pt-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="SKU / IPN">
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className={`${INPUT_CLS} font-mono`}
            />
          </Field>
          <Field label="Description" span={2}>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Category" span={2}>
            <select
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="">No Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="px-5">
        <SectionDivider>JIT Reorder Point</SectionDivider>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label="Minimum Stock">
            <input
              type="number"
              min={0}
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Avg Delivery Days">
            <input
              type="number"
              min={0}
              step="0.1"
              value={deliveryDays}
              onChange={(e) => setDeliveryDays(e.target.value)}
              placeholder="—"
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Avg Sold / Day">
            <input
              type="number"
              min={0}
              step="0.1"
              value={avgSoldPerDay}
              onChange={(e) => setAvgSoldPerDay(e.target.value)}
              placeholder="—"
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Reorder Point">
            <div
              className={[
                "rounded-[var(--radius-xs)] border px-3 py-2 text-center font-mono text-[15px] font-semibold tabular-nums",
                reorderPoint > 0
                  ? "border-[var(--color-accent-border)] bg-[color-mix(in_oklab,var(--color-accent)_18%,transparent)] text-[var(--color-text)] shadow-[0_0_10px_var(--color-accent-glow)]"
                  : "border-[var(--color-line)] bg-[var(--color-bg)] text-[var(--color-text-muted)]",
              ].join(" ")}
            >
              {reorderPoint}
            </div>
          </Field>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] px-5 py-3">
        <div className="min-w-0 flex-1">
          {err && (
            <p className="text-[12px] font-medium text-[var(--color-pulse-critical)]">
              {err}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDone} disabled={saving} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PartRow ────────────────────────────────────────────────────────────────────

function PartRow({
  part,
  categories,
  onUpdated,
}: {
  part: PartWithStock;
  categories: CategoryItem[];
  onUpdated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lots, setLots] = useState<StockLotForProduct[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingBatch, setAddingBatch] = useState(false);

  const loadLots = useCallback(async () => {
    setLotsLoading(true);
    try {
      setLots(await api.stockLots.byProduct(part.ean));
    } catch {
      /* silent */
    } finally {
      setLotsLoading(false);
    }
  }, [part.ean]);

  const toggle = () => {
    if (expanded) {
      setExpanded(false);
      setEditing(false);
      setAddingBatch(false);
    } else {
      setExpanded(true);
      void loadLots();
    }
  };

  const catName = categories.find((c) => c.id === part.category_id)?.name;

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] border-l-[3px] border-l-[var(--color-accent)] bg-[var(--color-glass)] backdrop-blur-sm transition-shadow duration-200 hover:shadow-[0_4px_20px_rgba(0,0,0,0.28)]">
      {/* header row — full-width button */}
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-[var(--color-glass-strong)]"
      >
        <HealthDot health={part.health} />

        {/* name + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold leading-snug text-[var(--color-text)]">
              {part.name}
            </span>
            {catName && (
              <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[0.65rem] text-[var(--color-text-muted)]">
                {catName}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[0.72rem] text-[var(--color-text-muted)]">
            {part.sku && <span className="font-mono">{part.sku}</span>}
            <span className="font-mono text-[0.65rem] opacity-50">{part.ean}</span>
          </div>
        </div>

        {/* stock numbers */}
        <div className="flex shrink-0 items-center gap-5 text-right">
          <div>
            <div className="text-[1.25rem] font-semibold tabular-nums leading-none text-[var(--color-text)]">
              {part.total_qty}
            </div>
            <div className="mt-0.5 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              in stock
            </div>
          </div>
          {(part.minimum_stock ?? 0) > 0 && (
            <div>
              <div className="text-[0.9rem] font-medium tabular-nums leading-none text-[var(--color-text-dim)]">
                {part.minimum_stock}
              </div>
              <div className="mt-0.5 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                min
              </div>
            </div>
          )}
          {/* chevron */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            width={15}
            height={15}
            className={`shrink-0 text-[var(--color-text-muted)] transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* expanded body */}
      {expanded && (
        <div className="anim-fade-slide-in border-t border-[var(--color-line)] px-5 pb-5 pt-4">
          {/* action bar */}
          {!editing && !addingBatch && (
            <div className="mb-4 flex items-center gap-2">
              <button
                onClick={() => setEditing(true)}
                className="btn-secondary text-[0.78rem]"
              >
                Edit part
              </button>
              <button
                onClick={() => setAddingBatch(true)}
                className="btn-secondary text-[0.78rem]"
              >
                + Add batch
              </button>
            </div>
          )}

          {editing && (
            <EditPartForm
              part={part}
              categories={categories}
              onDone={() => {
                setEditing(false);
                onUpdated();
              }}
            />
          )}

          {addingBatch && (
            <AddBatchForm
              ean={part.ean}
              onDone={() => {
                setAddingBatch(false);
                void loadLots();
                onUpdated();
              }}
            />
          )}

          {/* batch list */}
          {!addingBatch && (
            <div className="mt-4">
              <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                Active batches
              </div>
              {lotsLoading ? (
                <div className="h-8 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-glass)]" />
              ) : lots.length === 0 ? (
                <p className="text-[0.8rem] text-[var(--color-text-muted)]">
                  No active stock lots.
                </p>
              ) : (
                <div className="rounded-[var(--radius-sm)] border border-[var(--color-line)] px-3 py-1">
                  {lots.map((lot) => (
                    <BatchRow
                      key={lot.id}
                      lot={lot}
                      onChanged={() => {
                        void loadLots();
                        onUpdated();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add-part form ─────────────────────────────────────────────────────────────

// ── Shared form primitives — kept local to the Catalog ──────────────────────

const INPUT_CLS =
  "rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]";

function Field({
  label,
  children,
  span = 1,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  span?: 1 | 2 | 3;
  hint?: string;
}) {
  const spanCls =
    span === 2 ? "sm:col-span-2" : span === 3 ? "sm:col-span-3" : "";
  return (
    <div className={`flex flex-col gap-1.5 ${spanCls}`}>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[10.5px] text-[var(--color-text-muted)]">
          {hint}
        </span>
      )}
    </div>
  );
}

function SectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 flex items-center gap-4">
      <div className="h-px flex-1 bg-[var(--color-line)]" />
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
        {children}
      </span>
      <div className="h-px flex-1 bg-[var(--color-line)]" />
    </div>
  );
}

// ── Sectioned Add-Part form ─────────────────────────────────────────────────

function AddPartForm({
  categories,
  onCategoriesChanged,
  onDone,
}: {
  categories: CategoryItem[];
  onCategoriesChanged: () => void;
  onDone: () => void;
}) {
  // Identity
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [desc, setDesc] = useState("");
  const [catId, setCatId] = useState("");
  const [ean, setEan] = useState("");

  // JIT
  const [minStock, setMinStock] = useState("0");
  const [deliveryDays, setDeliveryDays] = useState("3");
  const [avgSoldPerDay, setAvgSoldPerDay] = useState("0");

  // Initial Stock
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [initialQty, setInitialQty] = useState("0");
  const [purchasePrice, setPurchasePrice] = useState("");

  // Inline "new category"
  const [creatingCat, setCreatingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatSaving, setNewCatSaving] = useState(false);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Legacy formula (D-094): ROP = ⌈delivery_days × avg_sold_per_day⌉ + minimum_stock
  const reorderPoint = useMemo(() => {
    const dd = parseFloat(deliveryDays) || 0;
    const sd = parseFloat(avgSoldPerDay) || 0;
    const ms = parseInt(minStock, 10) || 0;
    return Math.max(0, Math.ceil(dd * sd) + ms);
  }, [deliveryDays, avgSoldPerDay, minStock]);

  const submit = async () => {
    if (!name.trim()) { setErr("Part name is required"); return; }
    if (!sku.trim()) { setErr("SKU / IPN is required"); return; }
    if (!ean.trim()) { setErr("EAN is required"); return; }

    const qty = parseInt(initialQty, 10) || 0;
    if (qty > 0 && !shelfId) {
      setErr("Pick a zone location when adding initial stock");
      return;
    }
    const price = parseFloat(purchasePrice);
    if (qty > 0 && (isNaN(price) || price < 0)) {
      setErr("Purchase price is required and must be ≥ 0 when adding stock");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      await api.products.create({
        ean: ean.trim(),
        name: name.trim(),
        sku: sku.trim(),
        description: desc.trim() || null,
        minimum_stock: parseInt(minStock, 10) || 0,
        avg_delivery_days: parseFloat(deliveryDays) || null,
        avg_sold_per_day: parseFloat(avgSoldPerDay) || null,
        category_id: catId || null,
      });

      if (qty > 0 && shelfId) {
        await api.stockLots.create({
          ean: ean.trim(),
          quantity: qty,
          unit_cost: price,
          marketplace: "manual",
          shelf_id: shelfId,
        });
      }

      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const createCategory = async () => {
    if (!newCatName.trim()) return;
    setNewCatSaving(true);
    try {
      const c = await api.categories.create({ name: newCatName.trim() });
      setCatId(c.id);
      setNewCatName("");
      setCreatingCat(false);
      onCategoriesChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setNewCatSaving(false);
    }
  };

  const hasInitialStock = (parseInt(initialQty, 10) || 0) > 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* header */}
      <div className="border-b border-[var(--color-line)] px-6 py-5 text-center">
        <span className="inline-block rounded-full border border-[var(--color-accent-border)] bg-[rgba(0,80,102,0.18)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent-glow)]">
          New Part
        </span>
        <h2 id="add-part-title" className="mt-2 text-[1.6rem] font-semibold tracking-tight">
          Add Part
        </h2>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">

      {/* Section 1: Identity */}
      <div className="px-6 pt-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Part Name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Intel Core i7-1..."
              className={INPUT_CLS}
            />
          </Field>
          <Field label="SKU / IPN *">
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g., CPU-001"
              className={`${INPUT_CLS} font-mono`}
            />
          </Field>
          <Field label="Description" span={2}>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="Optional description"
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Category">
            {creatingCat ? (
              <div className="flex gap-1">
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="New category name"
                  autoFocus
                  className={`${INPUT_CLS} flex-1`}
                />
                <button
                  type="button"
                  onClick={createCategory}
                  disabled={newCatSaving || !newCatName.trim()}
                  className="btn-primary !px-3 !py-2 text-[11.5px]"
                  title="Save category"
                >
                  {newCatSaving ? "…" : "✓"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingCat(false);
                    setNewCatName("");
                  }}
                  className="btn-secondary !px-3 !py-2 text-[11.5px]"
                  title="Cancel"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="flex gap-1">
                <select
                  value={catId}
                  onChange={(e) => setCatId(e.target.value)}
                  className={`${INPUT_CLS} flex-1`}
                >
                  <option value="">No Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatingCat(true)}
                  className="btn-secondary !px-3 !py-2 text-[11.5px]"
                  title="Create new category"
                >
                  +
                </button>
              </div>
            )}
          </Field>
          <Field label="EAN *">
            <input
              value={ean}
              onChange={(e) => setEan(e.target.value)}
              placeholder="Space to be filled"
              className={`${INPUT_CLS} font-mono`}
            />
          </Field>
        </div>
      </div>

      {/* Section 2: JIT Reorder Point */}
      <div className="px-6">
        <SectionDivider>JIT Reorder Point</SectionDivider>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label="Minimum Stock">
            <input
              type="number"
              min={0}
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Avg Delivery Days">
            <input
              type="number"
              min={0}
              step="0.1"
              value={deliveryDays}
              onChange={(e) => setDeliveryDays(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Avg Sold / Day">
            <input
              type="number"
              min={0}
              step="0.1"
              value={avgSoldPerDay}
              onChange={(e) => setAvgSoldPerDay(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Reorder Point">
            <div
              className={[
                "rounded-[var(--radius-xs)] border px-3 py-2 text-center font-mono text-[15px] font-semibold tabular-nums",
                reorderPoint > 0
                  ? "border-[var(--color-accent-border)] bg-[color-mix(in_oklab,var(--color-accent)_18%,transparent)] text-[var(--color-text)] shadow-[0_0_10px_var(--color-accent-glow)]"
                  : "border-[var(--color-line)] bg-[var(--color-bg)] text-[var(--color-text-muted)]",
              ].join(" ")}
              title="⌈delivery_days × sold_per_day⌉ + minimum_stock"
            >
              {reorderPoint}
            </div>
          </Field>
        </div>
      </div>

      {/* Section 3: Initial Stock */}
      <div className="px-6">
        <SectionDivider>Initial Stock</SectionDivider>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={hasInitialStock ? "Zone Location *" : "Zone Location"}>
            <LocationPicker
              value={shelfId}
              onChange={setShelfId}
              placeholder="Choose location…"
            />
          </Field>
          <Field label="Quantity">
            <input
              type="number"
              min={0}
              value={initialQty}
              onChange={(e) => setInitialQty(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label={hasInitialStock ? "Purchase Price (€) *" : "Purchase Price (€)"}>
            <input
              type="number"
              min={0}
              step="0.01"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              placeholder="0.00"
              className={INPUT_CLS}
            />
          </Field>
        </div>
        <p className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-glass)] px-3 py-2 text-[11.5px] text-[var(--color-text-muted)]">
          Auto-FIFO: stock is assigned to the picked zone; if the zone is split, Bin B fills first, then Bin A.
        </p>
      </div>
      <div className="h-5" />
      </div>
      {/* /scroll body */}

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] px-6 py-4">
        <div className="min-w-0 flex-1">
          {err && (
            <p className="text-[12px] font-medium text-[var(--color-pulse-critical)]">
              {err}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDone}
            disabled={saving}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="btn-primary !px-5 !py-2 text-[12.5px] tracking-[0.08em]"
          >
            {saving ? "Creating…" : "CREATE PART"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [healthFilter, setHealthFilter] = useState<HealthTier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddPart, setShowAddPart] = useState(false);
  const [showCatMgr, setShowCatMgr] = useState(false);

  // Shared health source — same Map the Wall reads from. Do NOT recompute tiers.
  const health = useHealth();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [prods, cats] = await Promise.all([
        api.products.list({ composite: "false" }),
        api.categories.list(),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reloadAll = useCallback(() => {
    void load();
    void health.reload();
  }, [load, health]);

  const partsWithStock = useMemo<PartWithStock[]>(() =>
    products.map((p) => {
      const h = health.byEan.get(p.ean);
      return {
        ...p,
        total_qty: h?.total_qty ?? 0,
        health: h?.health ?? "empty",
      };
    }),
    [products, health.byEan]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return partsWithStock.filter((p) => {
      if (healthFilter && p.health !== healthFilter) return false;
      if (categoryFilter && p.category_id !== categoryFilter) return false;
      if (q) {
        return (
          p.name.toLowerCase().includes(q) ||
          p.ean.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [partsWithStock, query, categoryFilter, healthFilter]);

  const HEALTH_LABEL: Record<HealthTier, string> = {
    critical: "Critical",
    warning: "Low",
    healthy: "Healthy",
    empty: "No stock",
  };

  const chips = (["critical", "warning", "healthy", "empty"] as HealthTier[])
    .map((h) => ({ health: h, count: health.counts[h], label: HEALTH_LABEL[h] }));

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16 pt-6">
      <PageHeader
        title="Parts Catalog"
        description="All parts with live stock levels. Click a row to view batches and edit."
        actions={
          <>
            <button
              type="button"
              onClick={() => setShowCatMgr(true)}
              className="btn-secondary"
              title="Rename, delete, or add categories"
            >
              Manage categories
            </button>
            <button
              onClick={() => setShowAddPart(true)}
              className="btn-primary"
            >
              + New Part
            </button>
          </>
        }
      />

      <CategoryManager
        open={showCatMgr}
        onClose={() => setShowCatMgr(false)}
        categories={categories}
        onChanged={() => void load()}
      />

      {!loading && partsWithStock.length > 0 && (
        <div className="mb-4">
          <HealthChipStrip
            chips={chips}
            selected={healthFilter}
            onSelect={setHealthFilter}
          />
        </div>
      )}

      {/* New part modal */}
      <Modal
        open={showAddPart}
        onClose={() => setShowAddPart(false)}
        labelledBy="add-part-title"
        size="md"
      >
        <AddPartForm
          categories={categories}
          onCategoriesChanged={() => void load()}
          onDone={() => {
            setShowAddPart(false);
            reloadAll();
          }}
        />
      </Modal>

      {/* Search + category bar */}
      <div className="row-card mb-3 flex-wrap gap-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, EAN, SKU…"
          className="min-w-[260px] flex-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="row-card mb-3 border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_10%,transparent)] text-[13px] text-[var(--color-crit-ink)]">
          Failed to load catalog: {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-2">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-glass)]"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="row-card justify-center py-10 text-[var(--color-text-muted)]">
          {partsWithStock.length === 0
            ? "No parts in catalog yet."
            : "No parts match the current filter."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {filtered.map((p) => (
            <PartRow
              key={p.id}
              part={p}
              categories={categories}
              onUpdated={reloadAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}
