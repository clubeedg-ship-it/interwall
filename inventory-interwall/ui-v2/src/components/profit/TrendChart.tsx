import { useMemo, useState } from "react";
import type { PeriodScope } from "../../config/profit";

/*
  Line-only trend chart. No bars, no area fills. Four series rendered as
  independent strokes so each is readable at a glance:
  - Revenue (muted cool)
  - Cost (muted warm)
  - Profit (brand teal, hero weight)
  - Cumulative (dashed neutral)
  Grid is horizontal dotted rulers. Zero line slightly stronger. Hover pops a
  thin vertical ruler + one dot per series.
*/

interface ChartTransaction {
  date: string;
  sale: number;
  cost: number;
  margin: number;
}

interface TrendChartProps {
  transactions: ChartTransaction[];
  scope: PeriodScope;
  customFrom?: string;
  customTo?: string;
}

interface Bucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

const DAY_MS = 86_400_000;

function buildBuckets(
  scope: PeriodScope,
  customFrom?: string,
  customTo?: string
): Bucket[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const buckets: Bucket[] = [];

  if (scope === "week") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS);
      buckets.push({
        key: d.toISOString().slice(0, 10),
        label:
          i === 0
            ? "Today"
            : d.toLocaleDateString("en-US", { weekday: "short" }),
        start: d,
        end: new Date(d.getTime() + DAY_MS),
      });
    }
  } else if (scope === "month") {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS);
      buckets.push({
        key: d.toISOString().slice(0, 10),
        label:
          i === 0
            ? "Today"
            : d.getDate() === 1
              ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : String(d.getDate()),
        start: d,
        end: new Date(d.getTime() + DAY_MS),
      });
    }
  } else if (scope === "year") {
    for (let i = 11; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({
        key: m.toISOString().slice(0, 7),
        label: m.toLocaleDateString("en-US", { month: "short" }),
        start: m,
        end: mEnd,
      });
    }
  } else if (scope === "custom" && customFrom && customTo) {
    const start = new Date(customFrom);
    const end = new Date(customTo);
    const diffDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    if (diffDays > 0 && diffDays <= 365) {
      for (let i = 0; i <= diffDays; i++) {
        const d = new Date(start.getTime() + i * DAY_MS);
        buckets.push({
          key: d.toISOString().slice(0, 10),
          label:
            diffDays > 60
              ? d.getDate() === 1
                ? d.toLocaleDateString("en-US", { month: "short" })
                : ""
              : String(d.getDate()),
          start: d,
          end: new Date(d.getTime() + DAY_MS),
        });
      }
    }
  }
  return buckets;
}

interface Series {
  buckets: Bucket[];
  revenue: number[];
  cost: number[];
  profit: number[];
  cumProfit: number[];
  yMax: number;
  yMin: number;
}

function aggregate(
  buckets: Bucket[],
  transactions: ChartTransaction[]
): Series {
  const revenue = new Array(buckets.length).fill(0);
  const cost = new Array(buckets.length).fill(0);
  const profit = new Array(buckets.length).fill(0);

  for (const tx of transactions) {
    const txDate = new Date(tx.date);
    for (let i = 0; i < buckets.length; i++) {
      if (txDate >= buckets[i].start && txDate < buckets[i].end) {
        revenue[i] += tx.sale;
        cost[i] += tx.cost;
        profit[i] += tx.margin;
        break;
      }
    }
  }

  const cumProfit: number[] = [];
  let running = 0;
  for (const p of profit) {
    running += p;
    cumProfit.push(running);
  }

  const allValues = [...revenue, ...cost, ...cumProfit, ...profit];
  const maxV = Math.max(0, ...allValues);
  const minV = Math.min(0, ...allValues);
  const yMax = maxV === 0 && minV === 0 ? 1 : maxV * 1.12;
  const yMin = minV < 0 ? minV * 1.12 : 0;

  return { buckets, revenue, cost, profit, cumProfit, yMax, yMin };
}

// Profit and cost lines pull from the same pulse tokens as the health system,
// so a part drifting into critical and a bad-margin day register as the same
// visual alarm. Revenue stays a neutral cool reference; cumulative stays ghosted.
const LINE = {
  revenue: "#6b94c7",
  cost: "var(--color-pulse-critical)",
  profit: "var(--color-pulse-healthy)",
  cumulative: "rgba(255, 255, 255, 0.32)",
} as const;

type SeriesKey = "revenue" | "cost" | "profit" | "cumulative";

const SERIES_LABEL: Record<SeriesKey, string> = {
  revenue: "Revenue",
  cost: "Cost",
  profit: "Profit",
  cumulative: "Cumulative",
};

export function TrendChart({
  transactions,
  scope,
  customFrom,
  customTo,
}: TrendChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());

  const series = useMemo(() => {
    const buckets = buildBuckets(scope, customFrom, customTo);
    return aggregate(buckets, transactions);
  }, [scope, customFrom, customTo, transactions]);

  const hasData =
    series.buckets.length > 0 &&
    (series.revenue.some((v) => v !== 0) ||
      series.cost.some((v) => v !== 0) ||
      series.profit.some((v) => v !== 0));

  const VB_W = 800;
  const VB_H = 260;
  const PAD = { top: 16, right: 24, bottom: 28, left: 52 };
  const innerW = VB_W - PAD.left - PAD.right;
  const innerH = VB_H - PAD.top - PAD.bottom;

  const xFor = (i: number) => {
    if (series.buckets.length <= 1) return PAD.left + innerW / 2;
    return PAD.left + (i * innerW) / (series.buckets.length - 1);
  };

  const yFor = (v: number) => {
    const range = series.yMax - series.yMin;
    if (range === 0) return PAD.top + innerH;
    return PAD.top + ((series.yMax - v) / range) * innerH;
  };
  const y0 = yFor(0);

  const gridValues = useMemo(() => {
    if (!hasData) return [0];
    const step = niceStep((series.yMax - series.yMin) / 4);
    const vals: number[] = [];
    for (
      let v = Math.ceil(series.yMin / step) * step;
      v <= series.yMax;
      v += step
    ) {
      vals.push(Number(v.toFixed(6)));
    }
    if (!vals.includes(0) && series.yMin < 0) vals.push(0);
    return vals;
  }, [hasData, series.yMax, series.yMin]);

  const pathFor = (values: number[]) =>
    values
      .map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}`)
      .join(" ");

  const isHidden = (k: SeriesKey) => hidden.has(k);
  const toggle = (k: SeriesKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const xTicks = series.buckets.map((b, i) => ({ x: xFor(i), label: b.label }));
  // Pick ~8 x-ticks max so labels breathe
  const stride = Math.max(1, Math.ceil(xTicks.length / 8));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        className="block h-[260px] w-full"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Horizontal rulers (dotted, very subtle) */}
        {gridValues.map((v) => (
          <g key={`g-${v}`}>
            <line
              x1={PAD.left}
              x2={VB_W - PAD.right}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke="var(--color-line)"
              strokeDasharray={v === 0 ? "0" : "2 4"}
              strokeWidth={v === 0 ? 0.8 : 0.5}
              opacity={v === 0 ? 0.8 : 1}
            />
            <text
              x={PAD.left - 10}
              y={yFor(v) + 3}
              fontSize="9.5"
              textAnchor="end"
              fill="currentColor"
              className="font-mono text-[var(--color-text-muted)]"
            >
              €{abbrev(v)}
            </text>
          </g>
        ))}

        {/* Hover hit zones — invisible columns */}
        {hasData &&
          series.buckets.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={xFor(i) - innerW / series.buckets.length / 2}
              y={PAD.top}
              width={Math.max(2, innerW / series.buckets.length)}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
          ))}

        {/* Hover vertical ruler */}
        {hoverIdx !== null && hasData && (
          <line
            x1={xFor(hoverIdx)}
            x2={xFor(hoverIdx)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="var(--color-line-strong)"
            strokeDasharray="2 3"
            strokeWidth="0.7"
          />
        )}

        {/* Lines */}
        {hasData && (
          <>
            {!isHidden("revenue") && (
              <path
                d={pathFor(series.revenue)}
                fill="none"
                stroke={LINE.revenue}
                strokeWidth="1.4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {!isHidden("cost") && (
              <path
                d={pathFor(series.cost)}
                fill="none"
                stroke={LINE.cost}
                strokeWidth="1.4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {!isHidden("cumulative") && (
              <path
                d={pathFor(series.cumProfit)}
                fill="none"
                stroke={LINE.cumulative}
                strokeWidth="1.1"
                strokeDasharray="4 4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {!isHidden("profit") && (
              <path
                d={pathFor(series.profit)}
                fill="none"
                stroke={LINE.profit}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
          </>
        )}

        {/* Hover dots — one per visible series */}
        {hoverIdx !== null &&
          hasData &&
          (Object.keys(LINE) as SeriesKey[]).map((k) => {
            if (isHidden(k)) return null;
            const v =
              k === "revenue"
                ? series.revenue[hoverIdx]
                : k === "cost"
                  ? series.cost[hoverIdx]
                  : k === "profit"
                    ? series.profit[hoverIdx]
                    : series.cumProfit[hoverIdx];
            return (
              <circle
                key={`dot-${k}`}
                cx={xFor(hoverIdx)}
                cy={yFor(v)}
                r={3}
                fill="var(--color-bg)"
                stroke={LINE[k]}
                strokeWidth="1.5"
              />
            );
          })}

        {/* X tick labels */}
        {xTicks.map((t, i) =>
          i % stride === 0 || i === xTicks.length - 1 ? (
            <text
              key={`tl-${i}`}
              x={t.x}
              y={VB_H - 8}
              fontSize="9.5"
              textAnchor="middle"
              fill="currentColor"
              className="font-mono text-[var(--color-text-muted)]"
            >
              {t.label}
            </text>
          ) : null
        )}

        {/* Y-zero tick (visible even when hasData is false) */}
        {!hasData && (
          <text
            x={VB_W / 2}
            y={VB_H / 2}
            textAnchor="middle"
            fontSize="11"
            fill="currentColor"
            className="text-[var(--color-text-muted)]"
          >
            No transactions in this window
          </text>
        )}
      </svg>

      {hoverIdx !== null && hasData && (
        <HoverTooltip
          series={series}
          idx={hoverIdx}
          hidden={hidden}
          xPctLeft={xFor(hoverIdx) / VB_W}
          yRef={y0 / VB_H}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--color-text-dim)]">
        {(Object.keys(LINE) as SeriesKey[]).map((k) => (
          <LegendToggle
            key={k}
            label={SERIES_LABEL[k]}
            color={LINE[k]}
            dashed={k === "cumulative"}
            hidden={isHidden(k)}
            onClick={() => toggle(k)}
          />
        ))}
      </div>
    </div>
  );
}

function HoverTooltip({
  series,
  idx,
  hidden,
  xPctLeft,
}: {
  series: Series;
  idx: number;
  hidden: Set<SeriesKey>;
  xPctLeft: number;
  yRef: number;
}) {
  const rows: { k: SeriesKey; v: number }[] = [
    { k: "revenue", v: series.revenue[idx] },
    { k: "cost", v: series.cost[idx] },
    { k: "profit", v: series.profit[idx] },
    { k: "cumulative", v: series.cumProfit[idx] },
  ];
  const flipLeft = xPctLeft > 0.7;
  return (
    <div
      className="pointer-events-none absolute top-2 min-w-[180px] rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-bg-elevated)] px-3 py-2 text-[11px] shadow-lg"
      style={{
        left: `calc(${xPctLeft * 100}% + 8px)`,
        transform: flipLeft ? "translateX(calc(-100% - 16px))" : "none",
      }}
    >
      <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
        {series.buckets[idx].label}
      </div>
      {rows.map((r) =>
        hidden.has(r.k) ? null : (
          <div
            key={r.k}
            className="mt-1 flex items-center gap-2 first-of-type:mt-2"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: LINE[r.k] }}
            />
            <span className="text-[var(--color-text-dim)]">
              {SERIES_LABEL[r.k]}
            </span>
            <span
              className={[
                "ml-auto font-mono tabular-nums",
                r.k === "profit"
                  ? r.v >= 0
                    ? "text-[var(--color-ok-ink)]"
                    : "text-[var(--color-crit-ink)]"
                  : "text-[var(--color-text)]",
              ].join(" ")}
            >
              {r.k === "profit" && r.v >= 0 ? "+" : ""}€{r.v.toFixed(2)}
            </span>
          </div>
        )
      )}
    </div>
  );
}

function LegendToggle({
  label,
  color,
  dashed,
  hidden,
  onClick,
}: {
  label: string;
  color: string;
  dashed?: boolean;
  hidden: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] px-1.5 py-0.5 transition",
        hidden
          ? "opacity-40 hover:opacity-70"
          : "hover:bg-[var(--color-glass)]",
      ].join(" ")}
      title={hidden ? "Show series" : "Hide series"}
    >
      {dashed ? (
        <span
          className="inline-block h-px w-4"
          style={{ borderTop: `1.5px dashed ${color}` }}
        />
      ) : (
        <span
          className="inline-block h-[2px] w-4"
          style={{ backgroundColor: color }}
        />
      )}
      <span>{label}</span>
    </button>
  );
}

function abbrev(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const base = raw / pow;
  let n: number;
  if (base < 1.5) n = 1;
  else if (base < 3) n = 2;
  else if (base < 7) n = 5;
  else n = 10;
  return n * pow;
}
