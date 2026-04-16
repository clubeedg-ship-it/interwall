import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { BinLetter, ShelfCreateBody, Zone } from "../../lib/types";
import { ZoneWizard } from "./ZoneWizard";
import { Toggle } from "../Toggle";

type InlineMode =
  | { kind: "rename"; zoneId: string }
  | { kind: "confirm-delete"; zoneId: string }
  | { kind: "grow"; zoneId: string }
  | null;

export function ManageZonesPanel({
  zones,
  onRefresh,
}: {
  zones: Zone[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<InlineMode>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stockBlockers, setStockBlockers] = useState<string[] | null>(null);

  const realZones = zones.filter((z) => z.cols > 0 && z.levels > 0);
  const totalShelves = realZones.reduce((n, z) => n + z.shelves_count, 0);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        // Keep popover open while ZoneWizard (portaled sibling) is active.
        if (wizardOpen) return;
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (wizardOpen || mode) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, wizardOpen, mode]);

  function clearError() {
    setError(null);
    setStockBlockers(null);
  }

  function closeMode() {
    setMode(null);
    clearError();
  }

  async function rename(id: string, nextName: string) {
    clearError();
    setPendingId(id);
    try {
      await api.zones.patch(id, { name: nextName });
      onRefresh();
      setMode(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  async function deactivate(id: string) {
    clearError();
    setPendingId(id);
    try {
      await api.zones.patch(id, { is_active: false });
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  async function hardDelete(id: string) {
    clearError();
    setPendingId(id);
    try {
      await api.zones.remove(id);
      onRefresh();
      setMode(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const detail = err.detail;
        if (
          err.status === 409 &&
          detail &&
          typeof detail === "object" &&
          "shelves_with_stock" in detail
        ) {
          const list = (detail as { shelves_with_stock?: unknown })
            .shelves_with_stock;
          if (Array.isArray(list)) {
            setStockBlockers(list.map(String));
          }
        }
      } else {
        setError(String(err));
      }
    } finally {
      setPendingId(null);
    }
  }

  async function growRack(id: string, body: ShelfCreateBody) {
    clearError();
    setPendingId(id);
    try {
      await api.zones.createShelf(id, body);
      onRefresh();
      setMode(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Manage zones"
        aria-expanded={open}
        className="hud-pill !px-3 !py-1.5 text-[12px] text-[var(--color-text-dim)] hover:text-[var(--color-accent)]"
      >
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={15} height={15}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span>Manage zones</span>
          <span className="font-mono text-[10.5px] text-[var(--color-text-muted)]">
            {realZones.length}·{totalShelves}
          </span>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Manage zones"
          className="anim-popover-in absolute right-0 top-[calc(100%+10px)] z-50 w-[520px] max-w-[calc(100vw-48px)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-bg-elevated)] shadow-[0_32px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,0,0,0.3)]"
          style={{ backgroundColor: "var(--color-bg-elevated)" }}
        >
          <header className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
            <div className="min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Manage Zones
              </div>
              <div className="mt-0.5 flex items-baseline gap-3 text-[12px] text-[var(--color-text-dim)]">
                <span>
                  <span className="font-mono text-[13px] font-semibold text-[var(--color-text)] tabular-nums">
                    {realZones.length}
                  </span>
                  <span className="ml-1 text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                    zones
                  </span>
                </span>
                <span className="h-3 w-px bg-[var(--color-line)]" />
                <span>
                  <span className="font-mono text-[13px] font-semibold text-[var(--color-text)] tabular-nums">
                    {totalShelves}
                  </span>
                  <span className="ml-1 text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                    zones
                  </span>
                </span>
              </div>
            </div>
            <button
              ref={addBtnRef}
              type="button"
              className="btn-primary !py-1.5 !px-3 text-[12px]"
              onClick={() => setWizardOpen((v) => !v)}
              aria-expanded={wizardOpen}
            >
              + Add
            </button>
            {wizardOpen && (
              <ZoneWizard
                anchorRef={addBtnRef}
                onClose={() => setWizardOpen(false)}
                onCreated={() => {
                  setWizardOpen(false);
                  onRefresh();
                }}
              />
            )}
          </header>

          {error && (
            <div className="mx-4 mt-3 rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_10%,transparent)] px-3 py-2 text-[12px] text-[var(--color-crit-ink)]">
              <div>{error}</div>
              {stockBlockers && stockBlockers.length > 0 && (
                <div className="mt-1.5 font-mono text-[11px] opacity-90">
                  Still holding stock: {stockBlockers.join(", ")}
                </div>
              )}
            </div>
          )}

          {realZones.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-[var(--color-text-muted)]">
              No zones yet. Use <span className="font-mono">+ Add</span> to create one.
            </div>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-[var(--color-line)] overflow-y-auto">
              {realZones.map((z) => {
                const isRenaming = mode?.kind === "rename" && mode.zoneId === z.id;
                const isConfirmingDelete =
                  mode?.kind === "confirm-delete" && mode.zoneId === z.id;
                const isGrowing = mode?.kind === "grow" && mode.zoneId === z.id;
                const rowLocked = pendingId === z.id;
                return (
                  <li key={z.id} className="flex flex-col gap-2 px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {isRenaming ? (
                          <RenameField
                            initial={z.name}
                            onCancel={closeMode}
                            onSubmit={(next) => rename(z.id, next)}
                          />
                        ) : (
                          <span className="font-mono text-[0.85rem] font-semibold text-[var(--color-accent)]">
                            {z.name}
                          </span>
                        )}
                        <span className="text-[11px] text-[var(--color-text-muted)]">
                          {z.cols} × {z.levels} · {z.shelves_count} zones
                        </span>
                        {rowLocked && (
                          <span className="text-[10.5px] text-[var(--color-text-muted)]">
                            saving…
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <IconButton
                          onClick={() => {
                            clearError();
                            setMode(isRenaming ? null : { kind: "rename", zoneId: z.id });
                          }}
                          disabled={rowLocked}
                          title="Rename zone"
                          active={isRenaming}
                        >
                          Rename
                        </IconButton>
                        <IconButton
                          onClick={() => {
                            clearError();
                            setMode(isGrowing ? null : { kind: "grow", zoneId: z.id });
                          }}
                          disabled={rowLocked}
                          title="Grow this zone"
                          active={isGrowing}
                        >
                          Grow
                        </IconButton>
                        <IconButton
                          onClick={() => deactivate(z.id)}
                          disabled={rowLocked}
                          title="Hide zone from the wall (soft delete)"
                        >
                          Archive
                        </IconButton>
                        <IconButton
                          onClick={() => {
                            clearError();
                            setMode(
                              isConfirmingDelete
                                ? null
                                : { kind: "confirm-delete", zoneId: z.id }
                            );
                          }}
                          disabled={rowLocked}
                          title="Hard delete zone (refused if it still holds stock)"
                          active={isConfirmingDelete}
                          destructive
                        >
                          Delete
                        </IconButton>
                      </div>
                    </div>
                    {isConfirmingDelete && (
                      <ConfirmDeleteRow
                        zoneName={z.name}
                        shelvesCount={z.shelves_count}
                        onCancel={closeMode}
                        onConfirm={() => hardDelete(z.id)}
                        disabled={rowLocked}
                      />
                    )}
                    {isGrowing && (
                      <GrowRackForm
                        zoneName={z.name}
                        currentCols={z.cols}
                        onCancel={closeMode}
                        onSubmit={(body) => growRack(z.id, body)}
                        disabled={rowLocked}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  title,
  active,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  title: string;
  active?: boolean;
  destructive?: boolean;
}) {
  const base =
    "rounded-[var(--radius-xs)] border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50";
  const tone = destructive
    ? active
      ? "border-[color-mix(in_oklab,var(--color-crit)_55%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_15%,transparent)] text-[var(--color-crit-ink)]"
      : "border-[var(--color-line)] bg-transparent text-[var(--color-text-dim)] hover:border-[color-mix(in_oklab,var(--color-crit)_45%,transparent)] hover:text-[var(--color-crit-ink)]"
    : active
      ? "border-[var(--color-accent-border)] bg-[var(--color-glass-strong)] text-[var(--color-text)]"
      : "border-[var(--color-line)] bg-transparent text-[var(--color-text-dim)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${tone}`}
    >
      {children}
    </button>
  );
}

function RenameField({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: string;
  onCancel: () => void;
  onSubmit: (next: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim().toUpperCase();
        if (!trimmed || trimmed === initial) {
          onCancel();
          return;
        }
        onSubmit(trimmed);
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className="w-[120px] rounded-[var(--radius-xs)] border border-[var(--color-accent-border)] bg-[var(--color-bg)] px-2 py-1 font-mono text-[12.5px] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
        maxLength={24}
      />
      <button
        type="submit"
        className="rounded-[var(--radius-xs)] bg-[var(--color-accent)] px-2 py-1 text-[11px] font-semibold text-white"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-[var(--radius-xs)] border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-text-dim)]"
      >
        Cancel
      </button>
    </form>
  );
}

function ConfirmDeleteRow({
  zoneName,
  shelvesCount,
  onCancel,
  onConfirm,
  disabled,
}: {
  zoneName: string;
  shelvesCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_10%,transparent)] px-3 py-2">
      <span className="text-[11.5px] text-[var(--color-crit-ink)]">
        Delete <span className="font-mono font-semibold">{zoneName}</span> (
        <span className="font-mono font-semibold">{shelvesCount}</span> zones)? Refused if
        any still holds stock.
      </span>
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg-card)] px-2.5 py-1 text-[11px] text-[var(--color-text-dim)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          className="rounded-[var(--radius-xs)] bg-[var(--color-crit)] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
        >
          Confirm delete
        </button>
      </span>
    </div>
  );
}

function GrowRackForm({
  zoneName,
  currentCols,
  onCancel,
  onSubmit,
  disabled,
}: {
  zoneName: string;
  currentCols: number;
  onCancel: () => void;
  onSubmit: (body: ShelfCreateBody) => void;
  disabled: boolean;
}) {
  const [col, setCol] = useState<number>(currentCols + 1);
  const [level, setLevel] = useState<number>(1);
  const [bin, setBin] = useState<BinLetter>(null);
  const [capacityText, setCapacityText] = useState("");
  const [splitFifo, setSplitFifo] = useState(false);
  const [singleBin, setSingleBin] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const previewLabel = `${zoneName}-${String(col).padStart(2, "0")}-${level}${
    bin ? `-${bin}` : ""
  }`;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!Number.isInteger(col) || col < 1 || col > 26) {
      setFormError("Column must be 1–26.");
      return;
    }
    if (!Number.isInteger(level) || level < 1 || level > 26) {
      setFormError("Level must be 1–26.");
      return;
    }
    if (singleBin && bin !== null) {
      setFormError("Solid zones cannot have a bin.");
      return;
    }
    let capacity: number | null = null;
    const trimmed = capacityText.trim();
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n <= 0) {
        setFormError("Capacity must be a positive integer or blank.");
        return;
      }
      capacity = n;
    }
    onSubmit({
      col,
      level,
      bin,
      capacity,
      split_fifo: splitFifo,
      single_bin: singleBin,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-3"
    >
      <div className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        Grow — preview{" "}
        <span className="font-mono text-[12px] text-[var(--color-accent)]">
          {previewLabel}
        </span>
      </div>
      <div className="grid grid-cols-[auto_auto_auto_1fr] gap-2">
        <NumberField
          label="Col"
          value={col}
          onChange={setCol}
          min={1}
          max={26}
          hint={`next: ${currentCols + 1}`}
        />
        <NumberField label="Level" value={level} onChange={setLevel} min={1} max={26} />
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            Bin
          </span>
          <select
            value={bin ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setBin(v === "" ? null : (v as "A" | "B"));
              if (v !== "") setSingleBin(false);
            }}
            className="rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg-card)] px-2 py-1 font-mono text-[12px] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
          >
            <option value="">— (solid)</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            Capacity <span className="opacity-60">(blank = ∞)</span>
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={capacityText}
            onChange={(e) => setCapacityText(e.target.value)}
            placeholder="—"
            className="rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg-card)] px-2 py-1 font-mono text-[12px] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11.5px] text-[var(--color-text-dim)]">
        <Toggle checked={splitFifo} onChange={setSplitFifo} label="Split FIFO" />
        <Toggle
          checked={singleBin}
          onChange={(next) => {
            setSingleBin(next);
            if (next) setBin(null);
          }}
          label="Solid bin"
        />
      </div>
      {formError && (
        <div className="mt-2 text-[11px] text-[var(--color-crit-ink)]">{formError}</div>
      )}
      <div className="mt-3 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="rounded-[var(--radius-xs)] border border-[var(--color-line)] px-2.5 py-1 text-[11px] text-[var(--color-text-dim)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={disabled}
          className="rounded-[var(--radius-xs)] bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
        >
          Add zone
        </button>
      </div>
    </form>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        {label} {hint && <span className="opacity-60 normal-case">({hint})</span>}
      </span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        min={min}
        max={max}
        className="w-[80px] rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg-card)] px-2 py-1 font-mono text-[12px] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
      />
    </label>
  );
}
