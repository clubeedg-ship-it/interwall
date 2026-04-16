import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiError } from "../lib/api";
import type { ShelfOccupancy, Zone } from "../lib/types";

/**
 * Staged visual shelf picker.
 *
 * Replaces the "big dropdown of shelf labels" with a guided popover:
 *   Zone → Column → Level → Bin (A/B when split)
 *
 * Each stage shows mini-tiles with live fill-density hints so the operator
 * can steer toward an empty slot visually instead of decoding codes. Returns
 * a concrete `shelf_id` (UUID) via `onChange`.
 */
export interface LocationPickerProps {
  value: string | null;
  onChange: (shelfId: string | null) => void;
  /** Filter what's pickable — e.g. only empty shelves, only split-ready, etc. */
  filter?: (shelf: ShelfOccupancy) => boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Optional trigger-button className override. */
  className?: string;
}

type Stage = "zone" | "column" | "level" | "bin";

export function LocationPicker({
  value,
  onChange,
  filter,
  placeholder = "Select location…",
  disabled,
  className,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [shelves, setShelves] = useState<ShelfOccupancy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Staged selection ----------------------------------------------------------
  const [stage, setStage] = useState<Stage>("zone");
  const [selZone, setSelZone] = useState<string | null>(null); // zone name
  const [selCol, setSelCol] = useState<number | null>(null);
  const [selLevel, setSelLevel] = useState<number | null>(null);

  // Lazy-load zones + shelves when the popover opens for the first time ------
  useEffect(() => {
    if (!open) return;
    if (zones.length > 0 && shelves.length > 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.zones.list(), api.shelves.occupancy()])
      .then(([z, s]) => {
        if (cancelled) return;
        setZones(z);
        setShelves(s);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, zones.length, shelves.length]);

  // Close on outside-click + Esc ---------------------------------------------
  // The popover lives in a portal, so outside-click must check the popover
  // node and the trigger together (not a single wrapper subtree).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Position the portal'd popover. Computed on open + whenever the window
  // scrolls/resizes so it follows the trigger. If the popover would fall
  // below the viewport, it flips above the trigger.
  useLayoutEffect(() => {
    if (!open) return;
    const recompute = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const POP_W = 320;
      const ESTIMATED_H = 260;
      const GAP = 6;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let top = rect.bottom + GAP;
      let left = rect.left;
      // Flip above trigger if not enough room below.
      if (top + ESTIMATED_H > vh - 8) {
        top = Math.max(8, rect.top - ESTIMATED_H - GAP);
      }
      // Nudge back into viewport horizontally.
      if (left + POP_W > vw - 8) left = Math.max(8, vw - POP_W - 8);
      if (left < 8) left = 8;
      setPos({ top, left });
    };
    recompute();
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open, stage]);

  // Current label for the trigger button --------------------------------------
  const currentShelf = useMemo(
    () => (value ? shelves.find((s) => s.shelf_id === value) ?? null : null),
    [value, shelves]
  );

  // Derived lists for each stage ---------------------------------------------
  const filteredShelves = useMemo(
    () => (filter ? shelves.filter(filter) : shelves),
    [shelves, filter]
  );

  // Zone fill density (% capacity used across its shelves)
  const zoneDensity = useMemo(() => {
    const m = new Map<string, { used: number; cap: number }>();
    for (const s of filteredShelves) {
      const prev = m.get(s.zone_name) ?? { used: 0, cap: 0 };
      prev.used += s.total_qty;
      if (s.capacity && s.capacity > 0) prev.cap += s.capacity;
      m.set(s.zone_name, prev);
    }
    return m;
  }, [filteredShelves]);

  const visibleZones = useMemo(() => {
    const zonesWithShelves = new Set(filteredShelves.map((s) => s.zone_name));
    return zones.filter((z) => zonesWithShelves.has(z.name));
  }, [zones, filteredShelves]);

  const colShelvesForZone = useMemo(() => {
    if (!selZone) return [] as ShelfOccupancy[];
    return filteredShelves.filter((s) => s.zone_name === selZone);
  }, [filteredShelves, selZone]);

  const distinctCols = useMemo(() => {
    const set = new Set<number>();
    for (const s of colShelvesForZone) set.add(s.col);
    return Array.from(set).sort((a, b) => a - b);
  }, [colShelvesForZone]);

  const levelsForCol = useMemo(() => {
    if (selCol == null) return [] as number[];
    const set = new Set<number>();
    for (const s of colShelvesForZone) {
      if (s.col === selCol) set.add(s.level);
    }
    return Array.from(set).sort((a, b) => b - a); // top-down like the Wall
  }, [colShelvesForZone, selCol]);

  const binsForLevel = useMemo(() => {
    if (selCol == null || selLevel == null) return [] as ShelfOccupancy[];
    return colShelvesForZone.filter(
      (s) => s.col === selCol && s.level === selLevel
    );
  }, [colShelvesForZone, selCol, selLevel]);

  const reset = () => {
    setStage("zone");
    setSelZone(null);
    setSelCol(null);
    setSelLevel(null);
  };

  const choose = (shelf: ShelfOccupancy) => {
    onChange(shelf.shelf_id);
    setOpen(false);
    reset();
  };

  const triggerLabel = currentShelf ? currentShelf.shelf_label : placeholder;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={[
          "flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border bg-[var(--color-bg)] px-3 py-2 text-[13px] transition-all duration-200",
          currentShelf
            ? "border-[var(--color-accent-border)] text-[var(--color-text)]"
            : "border-[var(--color-line)] text-[var(--color-text-muted)]",
          !disabled && "hover:border-[var(--color-line-strong)]",
          disabled && "cursor-not-allowed opacity-50",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className={currentShelf ? "font-mono" : ""}>{triggerLabel}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          width={14}
          height={14}
          className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="anim-popover-in fixed z-[60] w-[320px] rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* breadcrumb */}
          <div className="mb-2 flex items-center gap-1 text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            <Crumb
              active={stage === "zone"}
              done={!!selZone}
              onClick={() => {
                setStage("zone");
              }}
            >
              Zone
            </Crumb>
            <Sep />
            <Crumb
              active={stage === "column"}
              done={selCol != null}
              onClick={() => selZone && setStage("column")}
              disabled={!selZone}
            >
              {selZone ? `Zone ${selZone}` : "Column"}
            </Crumb>
            <Sep />
            <Crumb
              active={stage === "level"}
              done={selLevel != null}
              onClick={() => selCol != null && setStage("level")}
              disabled={selCol == null}
            >
              {selCol != null ? `${selZone}-${selCol}` : "Level"}
            </Crumb>
            <Sep />
            <Crumb
              active={stage === "bin"}
              done={false}
              onClick={() => selLevel != null && setStage("bin")}
              disabled={selLevel == null}
            >
              Bin
            </Crumb>
          </div>

          {loading && (
            <div className="flex h-24 items-center justify-center text-[11.5px] text-[var(--color-text-muted)]">
              Loading locations…
            </div>
          )}
          {error && (
            <div className="rounded-[var(--radius-xs)] border border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_10%,transparent)] px-2.5 py-2 text-[11.5px] text-[var(--color-crit-ink)]">
              {error}
            </div>
          )}

          {!loading && !error && stage === "zone" && (
            <div className="grid grid-cols-2 gap-2">
              {visibleZones.length === 0 && (
                <p className="col-span-2 py-4 text-center text-[11.5px] text-[var(--color-text-muted)]">
                  No zones with matching locations.
                </p>
              )}
              {visibleZones.map((z) => {
                const d = zoneDensity.get(z.name);
                const ratio =
                  d && d.cap > 0 ? Math.min(1, d.used / d.cap) : 0;
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => {
                      setSelZone(z.name);
                      setStage("column");
                    }}
                    className="group flex flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-glass)] px-3 py-2.5 text-left hover:border-[var(--color-accent-border)]"
                  >
                    <span className="font-mono text-[12.5px] font-semibold text-[var(--color-text)]">
                      Zone {z.name}
                    </span>
                    <span className="text-[10.5px] text-[var(--color-text-muted)]">
                      {z.cols} × {z.levels}
                    </span>
                    <DensityBar ratio={ratio} />
                  </button>
                );
              })}
            </div>
          )}

          {!loading && !error && stage === "column" && (
            <div className="grid grid-cols-4 gap-1.5">
              {distinctCols.map((c) => {
                const shelvesInCol = colShelvesForZone.filter(
                  (s) => s.col === c
                );
                const used = shelvesInCol.reduce(
                  (a, s) => a + s.total_qty,
                  0
                );
                const cap = shelvesInCol.reduce(
                  (a, s) => a + (s.capacity ?? 0),
                  0
                );
                const ratio = cap > 0 ? Math.min(1, used / cap) : 0;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setSelCol(c);
                      setStage("level");
                    }}
                    className="flex flex-col items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-glass)] px-2 py-2 hover:border-[var(--color-accent-border)]"
                  >
                    <span className="font-mono text-[11.5px] font-semibold text-[var(--color-text)]">
                      {selZone}-{c}
                    </span>
                    <DensityBar ratio={ratio} slim />
                  </button>
                );
              })}
            </div>
          )}

          {!loading && !error && stage === "level" && (
            <div className="grid grid-cols-4 gap-1.5">
              {levelsForCol.map((lvl) => {
                const shelvesAtLevel = colShelvesForZone.filter(
                  (s) => s.col === selCol && s.level === lvl
                );
                const hasStock = shelvesAtLevel.some((s) => s.total_qty > 0);
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => {
                      setSelLevel(lvl);
                      setStage("bin");
                    }}
                    className={[
                      "rounded-[var(--radius-xs)] border px-2 py-2 font-mono text-[11.5px] font-semibold",
                      hasStock
                        ? "border-[color-mix(in_oklab,var(--color-pulse-healthy)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-pulse-healthy)_10%,transparent)] text-[var(--color-text)]"
                        : "border-[var(--color-line)] bg-[var(--color-glass)] text-[var(--color-text-dim)]",
                      "hover:border-[var(--color-accent-border)]",
                    ].join(" ")}
                  >
                    L{lvl}
                  </button>
                );
              })}
            </div>
          )}

          {!loading && !error && stage === "bin" && (
            <div className="grid grid-cols-2 gap-2">
              {binsForLevel.map((shelf) => {
                const qty = shelf.total_qty;
                const binLabel = shelf.bin ?? "Solid";
                const isEmpty = qty === 0;
                return (
                  <button
                    key={shelf.shelf_id}
                    type="button"
                    onClick={() => choose(shelf)}
                    className={[
                      "flex flex-col items-start gap-1 rounded-[var(--radius-sm)] border px-3 py-2.5 text-left",
                      isEmpty
                        ? "border-[var(--color-line)] bg-[var(--color-glass)] text-[var(--color-text-dim)]"
                        : "border-[color-mix(in_oklab,var(--color-pulse-healthy)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-pulse-healthy)_12%,transparent)] text-[var(--color-text)]",
                      "hover:border-[var(--color-accent)]",
                    ].join(" ")}
                  >
                    <span className="font-mono text-[12.5px] font-semibold">
                      Bin {binLabel}
                    </span>
                    <span className="text-[10.5px] text-[var(--color-text-muted)]">
                      {isEmpty
                        ? "Empty"
                        : `${qty} u${
                            shelf.product_name ? ` · ${shelf.product_name}` : ""
                          }`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
                reset();
              }}
              className="mt-3 w-full rounded-[var(--radius-xs)] border border-[var(--color-line)] px-3 py-1.5 text-[11.5px] text-[var(--color-text-muted)] hover:text-[var(--color-text-dim)]"
            >
              Clear selection
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

function Crumb({
  children,
  active,
  done,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  active: boolean;
  done: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={[
        "rounded px-1.5 py-0.5 transition-colors",
        active
          ? "text-[var(--color-text)]"
          : done
            ? "text-[var(--color-accent)] hover:text-[var(--color-text)]"
            : "text-[var(--color-text-muted)]",
        disabled && !active ? "cursor-default" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="text-[var(--color-text-muted)]">·</span>;
}

function DensityBar({ ratio, slim }: { ratio: number; slim?: boolean }) {
  const height = slim ? "h-[2px]" : "h-[3px]";
  return (
    <div
      className={`${height} w-full overflow-hidden rounded-[1px] bg-[var(--color-line)]`}
    >
      <div
        className="h-full bg-[var(--color-accent)]"
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}
