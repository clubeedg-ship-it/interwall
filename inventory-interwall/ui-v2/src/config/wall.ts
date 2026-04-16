/*
  Wall config — zone wizard templates and cell coloring rules.
  Nothing hardcoded about stock thresholds beyond capacity-derived percentages.
  Templates are common warehouse ratios, not domain-specific.
*/

export interface ZoneTemplatePreset {
  id: string;
  label: string;
  cols: number;
  levels: number;
  description: string;
}

export const ZONE_TEMPLATES: ZoneTemplatePreset[] = [
  { id: "small", label: "Small", cols: 3, levels: 5, description: "3 columns · 5 levels" },
  { id: "standard", label: "Standard", cols: 4, levels: 7, description: "4 columns · 7 levels" },
  { id: "large", label: "Large", cols: 6, levels: 10, description: "6 columns · 10 levels" },
];

export type CellFill = "empty" | "critical" | "warning" | "healthy" | "unknown";

/**
 * Derive a cell's fill signal purely from its capacity + qty.
 * If capacity is unknown, we can only distinguish empty vs filled.
 */
export function fillFor(qty: number, capacity: number | null): CellFill {
  if (qty <= 0) return "empty";
  if (capacity == null || capacity <= 0) return "healthy";
  const ratio = qty / capacity;
  if (ratio < 0.2) return "critical";
  if (ratio < 0.5) return "warning";
  return "healthy";
}

export type StockHealth = "empty" | "critical" | "warning" | "healthy";

/**
 * Stock health relative to a product's reorder point.
 * - `min == null/0`: fallback to legacy absolute thresholds (qty ≤ 5 crit, ≤ 15 warn).
 * - `min > 0`: qty < min → critical, qty < 2×min → warning (approaching reorder), else healthy.
 * Evaluated on *total* qty across all bins of the product, not a single bin.
 */
export function healthFor(totalQty: number, min: number | null | undefined): StockHealth {
  if (totalQty <= 0) return "empty";
  if (min == null || min <= 0) {
    if (totalQty <= 5) return "critical";
    if (totalQty <= 15) return "warning";
    return "healthy";
  }
  if (totalQty < min) return "critical";
  if (totalQty < 2 * min) return "warning";
  return "healthy";
}
