import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { HealthTier, ShelfOccupancy, Zone } from "../lib/types";
import { ZoneGrid } from "../components/wall/ZoneGrid";
import { BinDrawer } from "../components/wall/BinDrawer";
import { ManageZonesPanel } from "../components/wall/ManageZonesPanel";
import { ZoneWizard } from "../components/wall/ZoneWizard";
import { PageHeader } from "../components/PageHeader";
import { TabButton } from "../components/TabButton";
import { useHealth } from "../hooks/useHealth";

const POLL_MS = 30_000;

export default function WallPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [occupancy, setOccupancy] = useState<ShelfOccupancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeShelfId, setActiveShelfId] = useState<string | null>(null);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [addingZone, setAddingZone] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  // Shared health source — identical Map the Catalog reads from. Do NOT recompute.
  const health = useHealth({ pollMs: POLL_MS });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [z, o] = await Promise.all([
        api.zones.list(),
        api.shelves.occupancy(),
      ]);
      setZones(z);
      setOccupancy(o);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Adapt the shared ProductHealthRow Map into the shape BinCell already expects.
  const healthByEan = useMemo<Map<string, HealthTier>>(() => {
    const m = new Map<string, HealthTier>();
    for (const [ean, row] of health.byEan) m.set(ean, row.health);
    return m;
  }, [health.byEan]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const realZones = useMemo(
    () => zones.filter((z) => z.cols > 0 && z.levels > 0),
    [zones]
  );

  // Keep activeZoneId valid: default to first zone, reselect if the current
  // one disappeared (archived/deleted), otherwise preserve the pick.
  useEffect(() => {
    if (realZones.length === 0) {
      if (activeZoneId !== null) setActiveZoneId(null);
      return;
    }
    if (activeZoneId === null || !realZones.some((z) => z.id === activeZoneId)) {
      setActiveZoneId(realZones[0].id);
    }
  }, [realZones, activeZoneId]);

  // Keyboard zone navigation — ArrowLeft/ArrowRight cycles tabs unless the
  // user is typing into an input, textarea, or contenteditable surface. The
  // BinDrawer listens for its own Escape handler; our arrows only act when
  // the drawer is closed so we don't fight it for focus.
  useEffect(() => {
    if (realZones.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (activeShelfId !== null) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      e.preventDefault();
      setActiveZoneId((cur) => {
        const idx = realZones.findIndex((z) => z.id === cur);
        if (idx === -1) return realZones[0].id;
        const next =
          e.key === "ArrowRight"
            ? (idx + 1) % realZones.length
            : (idx - 1 + realZones.length) % realZones.length;
        return realZones[next].id;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [realZones, activeShelfId]);

  const activeZone = realZones.find((z) => z.id === activeZoneId) ?? null;

  const activeShelf =
    activeShelfId != null
      ? occupancy.find((o) => o.shelf_id === activeShelfId) ?? null
      : null;

  const refreshAll = () => {
    void load();
    void health.reload();
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16 pt-6">
      <PageHeader
        title="The Wall"
        description="Live zone / bin occupancy. Click any bin for details. Updates every 30s."
        actions={
          <>
            <button
              ref={addBtnRef}
              type="button"
              onClick={() => setAddingZone((v) => !v)}
              aria-label="Add new zone"
              aria-expanded={addingZone}
              title="Add new zone"
              className={[
                "inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
                addingZone
                  ? "border-[var(--color-accent)] bg-[color-mix(in_oklab,var(--color-accent)_22%,transparent)] text-[var(--color-accent)]"
                  : "border-[var(--color-line)] bg-[var(--color-glass)] text-[var(--color-text-dim)] hover:border-[var(--color-accent-border)] hover:text-[var(--color-accent)]",
              ].join(" ")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} width={14} height={14} strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <ManageZonesPanel zones={zones} onRefresh={refreshAll} />
            <button
              type="button"
              onClick={refreshAll}
              className="btn-secondary"
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </>
        }
      />

      {addingZone && (
        <ZoneWizard
          anchorRef={addBtnRef}
          onClose={() => setAddingZone(false)}
          onCreated={(newId) => {
            setAddingZone(false);
            setActiveZoneId(newId);
            refreshAll();
          }}
        />
      )}

      {error && (
        <div className="row-card mb-4 border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_10%,transparent)] text-[13px] text-[var(--color-crit-ink)]">
          Failed to load wall: {error}
        </div>
      )}

      {loading && zones.length === 0 ? (
        <div className="row-card h-40 animate-pulse" />
      ) : realZones.length === 0 ? (
        <div className="row-card justify-center py-10 text-[var(--color-text-muted)]">
          No zones yet. Use the <span className="font-mono">+</span> button above to create one.
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-[var(--color-line)]">
            {realZones.map((z) => (
              <TabButton
                key={z.id}
                label={z.name}
                active={z.id === activeZoneId}
                onClick={() => setActiveZoneId(z.id)}
                title={`${z.cols} × ${z.levels} · ${z.shelves_count} zones`}
              />
            ))}
          </div>
          {activeZone && (
            <ZoneGrid
              zone={activeZone}
              occupancy={occupancy.filter((o) => o.zone_name === activeZone.name)}
              activeShelfId={activeShelfId}
              onPick={(shelf) => setActiveShelfId(shelf.shelf_id)}
              healthByEan={healthByEan}
            />
          )}
        </>
      )}

      <BinDrawer
        shelf={activeShelf}
        onClose={() => setActiveShelfId(null)}
        onPatched={refreshAll}
        onDeleted={() => {
          setActiveShelfId(null);
          refreshAll();
        }}
      />
    </div>
  );
}
