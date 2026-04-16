import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { HealthTier, ProductHealthRow } from "../lib/types";

/**
 * Single source of truth for per-product health across the whole app.
 *
 * Reads `GET /api/products/health`, which already runs the tier classification
 * server-side (`empty | critical | warning | healthy`) against the shared
 * `v_part_stock` + `v_product_reorder` views. Do NOT recompute the tier on the
 * client — if this hook says critical, the Wall tile MUST glow critical and
 * the Catalog dot MUST glow critical. Divergence is a bug.
 *
 * Returned as a `Map<ean, ProductHealthRow>` so callers can look up by EAN in
 * O(1) from render loops.
 */
export function useHealth(opts: { pollMs?: number } = {}) {
  const { pollMs } = opts;
  const [rows, setRows] = useState<ProductHealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setRows(await api.products.health());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => void load(), pollMs);
    return () => clearInterval(id);
  }, [pollMs, load]);

  const byEan = useMemo(() => {
    const m = new Map<string, ProductHealthRow>();
    for (const r of rows) m.set(r.ean, r);
    return m;
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<HealthTier, number> = {
      healthy: 0,
      warning: 0,
      critical: 0,
      empty: 0,
    };
    for (const r of rows) c[r.health]++;
    return c;
  }, [rows]);

  return { rows, byEan, counts, loading, error, reload: load };
}
