import { Link } from "react-router-dom";
import type { BuildListItem, XrefItem } from "../lib/types";
import {
  READINESS,
  compositionSummary,
  readinessFor,
} from "../config/builds";

export function BuildsList({
  builds,
  xrefs,
  knownMarketplaces,
  activeCode,
}: {
  builds: BuildListItem[];
  xrefs: XrefItem[];
  knownMarketplaces: string[];
  activeCode: string | null;
}) {
  if (builds.length === 0) {
    return (
      <div className="row-card justify-center py-10 text-[var(--color-text-muted)]">
        No Builds saved yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      {builds.map((b) => {
        const mapped = new Set(
          xrefs.filter((x) => x.build_code === b.build_code).map((x) => x.marketplace)
        );
        const r = readinessFor(b, mapped, knownMarketplaces);
        const token = READINESS[r];
        const isActive = activeCode === b.build_code;

        return (
          <Link
            key={b.id}
            to={`/builds/${encodeURIComponent(b.build_code)}`}
            className={["row-card", isActive ? "is-active" : ""].join(" ")}
          >
            <div className="flex min-w-0 shrink-0 basis-[180px] items-center gap-2">
              <span
                className="min-w-0 flex-1 truncate font-mono text-[0.78rem] font-semibold tracking-tight text-[var(--color-accent)]"
                title={b.build_code}
              >
                {b.build_code}
              </span>
              <span className={["led", "shrink-0", token.led].join(" ")}>{token.label}</span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.95rem] font-semibold text-[var(--color-text)]">
                {b.name ?? (
                  <span className="font-normal text-[var(--color-text-muted)]">
                    (unnamed)
                  </span>
                )}
              </div>
              <div className="mt-1 truncate text-[0.75rem] text-[var(--color-text-muted)]">
                {compositionSummary(b)}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <div className="text-right">
                <div className="text-[1.5rem] font-semibold leading-none tabular-nums text-[var(--color-text)]">
                  {b.component_count}
                </div>
                <div className="mt-1 text-[0.6rem] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                  {b.component_count === 1 ? "component" : "components"}
                </div>
              </div>

              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                width={18}
                height={18}
                className="text-[var(--color-text-muted)] transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
