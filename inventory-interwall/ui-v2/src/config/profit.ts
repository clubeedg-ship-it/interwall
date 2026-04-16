/*
  Profit view configuration.

  Period scopes mirror the legacy `frontend/profit.js` chart-scope select so
  operators see the same time windows in the rebuild. Cash-flow scope mirrors
  the #cashFlowScope select from index.html. Do not invent new scope tokens;
  existing profit data/Playwright contracts key off these strings.
*/

export type PeriodScope = "week" | "month" | "year" | "custom";

export interface PeriodDef {
  key: PeriodScope;
  label: string;
}

export const PERIOD_SCOPES: PeriodDef[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

export const DEFAULT_PERIOD: PeriodScope = "month";

export type CashFlowScope = "today" | "month";

export const CASH_FLOW_SCOPES: { key: CashFlowScope; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "month", label: "Month" },
];

/*
  Chart palette — kept in sync with the teal accent in `index.css`. Profit
  flips between teal-positive and red-negative per-segment. Revenue and
  cost sit as soft fills under the profit line. Cumulative dashes use a
  neutral muted stroke so it reads as "context, not signal".
*/
export const CHART_COLORS = {
  revenueFill: "rgba(0, 180, 216, 0.22)",
  revenueStroke: "rgba(0, 180, 216, 0.55)",
  costFill: "rgba(239, 154, 154, 0.18)",
  costStroke: "rgba(239, 154, 154, 0.45)",
  profitPos: "#00b38a",
  profitNeg: "#ef5350",
  cumulative: "rgba(255, 255, 255, 0.35)",
  cumulativeLight: "rgba(0, 0, 0, 0.25)",
  grid: "rgba(255, 255, 255, 0.06)",
  gridLight: "rgba(0, 0, 0, 0.06)",
  axis: "var(--color-text-muted)",
} as const;
