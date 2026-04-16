import type { StockHealth } from "../config/wall";

/**
 * Glowing health-pulse dot. Uses the --color-pulse-* tokens so every dot,
 * tile halo, and trend-line emphasis across the app reads as one signal.
 */
export function HealthDot({
  health,
  size = 10,
}: {
  health: StockHealth;
  size?: number;
}) {
  const style =
    health === "empty"
      ? {
          background: "var(--color-pulse-empty)",
          boxShadow: "none",
          opacity: 0.45,
        }
      : {
          background: `var(--color-pulse-${health})`,
          boxShadow: `0 0 ${Math.round(size * 0.9)}px ${Math.round(
            size * 0.25
          )}px var(--color-pulse-${health}-glow)`,
        };
  return (
    <span
      aria-label={health}
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, ...style }}
    />
  );
}

export interface HealthChip {
  health: StockHealth;
  count: number;
  label: string;
}

/**
 * Filter-style strip of health-tier chips. Clicking a chip selects that tier;
 * clicking the active chip again clears the filter. Empty-tier chips are only
 * rendered when the count is non-zero (operator focus).
 */
export function HealthChipStrip({
  chips,
  selected,
  onSelect,
  orientation = "horizontal",
}: {
  chips: HealthChip[];
  selected: StockHealth | null;
  onSelect: (next: StockHealth | null) => void;
  orientation?: "horizontal" | "vertical";
}) {
  if (chips.length === 0) return null;
  return (
    <div
      className={[
        "flex flex-wrap gap-2",
        orientation === "vertical" ? "flex-col" : "flex-row",
      ].join(" ")}
    >
      {chips
        .filter((c) => c.count > 0)
        .map((chip) => {
          const active = selected === chip.health;
          return (
            <button
              key={chip.health}
              type="button"
              onClick={() => onSelect(active ? null : chip.health)}
              className={[
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.72rem] transition-colors",
                active
                  ? "border-[var(--color-accent-border)] bg-[rgba(0,80,102,0.18)] text-[var(--color-text)]"
                  : "border-[var(--color-line)] text-[var(--color-text-dim)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]",
              ].join(" ")}
            >
              <HealthDot health={chip.health} />
              <span>
                {chip.count} {chip.label}
              </span>
            </button>
          );
        })}
      {selected && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="rounded-full border border-[var(--color-line)] px-3 py-1 text-[0.72rem] text-[var(--color-text-muted)] hover:border-[var(--color-line-strong)]"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}
