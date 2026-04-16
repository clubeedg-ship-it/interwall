import type { ShelfOccupancy } from "../../lib/types";
import type { StockHealth } from "../../config/wall";

export interface CellBins {
  base: ShelfOccupancy | null;
  a: ShelfOccupancy | null;
  b: ShelfOccupancy | null;
}

export function BinCell({
  bins,
  activeShelfId,
  onPick,
  isFloor,
  healthByEan,
}: {
  bins: CellBins;
  activeShelfId: string | null;
  onPick: (shelf: ShelfOccupancy) => void;
  isFloor: boolean;
  healthByEan: Map<string, StockHealth>;
}) {
  const cellClass = `rack-cell${isFloor ? " is-floor" : ""}`;

  if (bins.base) {
    return (
      <div className={cellClass}>
        <RackUnit
          shelf={bins.base}
          half={null}
          activeShelfId={activeShelfId}
          onPick={onPick}
          healthByEan={healthByEan}
        />
      </div>
    );
  }

  if (!bins.a && !bins.b) {
    return (
      <div className={cellClass}>
        <div className="rack-unit is-phantom" aria-hidden />
      </div>
    );
  }

  return (
    <div className={cellClass}>
      <RackUnit
        shelf={bins.a}
        half="A"
        activeShelfId={activeShelfId}
        onPick={onPick}
        healthByEan={healthByEan}
      />
      <RackUnit
        shelf={bins.b}
        half="B"
        activeShelfId={activeShelfId}
        onPick={onPick}
        healthByEan={healthByEan}
      />
    </div>
  );
}

function RackUnit({
  shelf,
  half,
  activeShelfId,
  onPick,
  healthByEan,
}: {
  shelf: ShelfOccupancy | null;
  half: "A" | "B" | null;
  activeShelfId: string | null;
  onPick: (shelf: ShelfOccupancy) => void;
  healthByEan: Map<string, StockHealth>;
}) {
  if (!shelf) {
    return (
      <div
        className={`rack-unit is-phantom${half ? " is-half" : ""}${
          half === "B" ? " bin-b" : ""
        }`}
        data-bin={half ?? undefined}
        aria-hidden
      />
    );
  }

  const isEmpty = shelf.total_qty === 0;
  const health: StockHealth = isEmpty
    ? "empty"
    : shelf.product_ean
      ? healthByEan.get(shelf.product_ean) ?? "healthy"
      : "healthy";
  const active = activeShelfId === shelf.shelf_id;

  const classes = [
    "rack-unit",
    half ? "is-half" : "",
    half === "B" ? "bin-b" : "",
    isEmpty ? "is-empty" : "",
    !isEmpty ? `tone-${health}` : "",
    active ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tooltip = [
    shelf.shelf_label,
    shelf.product_name ? `· ${shelf.product_name}` : null,
    isEmpty ? null : `· ${shelf.total_qty} units`,
    !isEmpty && health !== "healthy" ? `· ${health}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      onClick={() => onPick(shelf)}
      className={classes}
      data-bin={half ?? undefined}
      title={tooltip}
    >
      {!isEmpty && <span className="rack-fill" aria-hidden />}
      <span className="rack-qty tabular-nums">{shelf.total_qty}</span>
    </button>
  );
}
