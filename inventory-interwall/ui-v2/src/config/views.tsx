import type { ReactElement } from "react";

/*
  Single source of truth for top-level views in ui-v2.
  Mirrors the `titles` map in legacy `frontend/router.js` verbatim so
  UI labels stay consistent with the app operators already know.
*/

export interface ViewDef {
  key: string;
  path: string;
  title: string;
  icon: ReactElement;
  ported: boolean;
}

const commonSvg = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const WALL: ViewDef = {
  key: "wall",
  path: "/wall",
  title: "The Wall",
  icon: (
    <svg {...commonSvg} width={24} height={24} strokeWidth={1.5}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  ported: true,
};

export const CATALOG: ViewDef = {
  key: "catalog",
  path: "/catalog",
  title: "Parts Catalog",
  icon: (
    <svg {...commonSvg} width={24} height={24} strokeWidth={1.5}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1.5" fill="currentColor" />
      <circle cx="4" cy="12" r="1.5" fill="currentColor" />
      <circle cx="4" cy="18" r="1.5" fill="currentColor" />
    </svg>
  ),
  ported: true,
};

export const PROFIT: ViewDef = {
  key: "profit",
  path: "/profit",
  title: "Profitability",
  icon: (
    <svg {...commonSvg} width={24} height={24} strokeWidth={1.5}>
      <path d="M3 3v18h18" />
      <path d="M7 16l4-4 4 4 5-6" />
    </svg>
  ),
  ported: true,
};

export const HEALTH: ViewDef = {
  key: "health",
  path: "/health",
  title: "Health",
  icon: (
    <svg {...commonSvg} width={24} height={24} strokeWidth={2}>
      <path d="M3 12h4l2-5 4 10 2-5h6" />
    </svg>
  ),
  ported: false,
};

export const BUILDS: ViewDef = {
  key: "builds",
  path: "/builds",
  title: "Builds",
  icon: (
    <svg {...commonSvg} width={24} height={24} strokeWidth={2}>
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    </svg>
  ),
  ported: true,
};

export const HISTORY: ViewDef = {
  key: "history",
  path: "/history",
  title: "Batch History",
  icon: (
    <svg {...commonSvg} width={20} height={20} strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  ported: false,
};

/** Orb rail order mirrors legacy `frontend/index.html` sidebar-nav order. */
export const RAIL_VIEWS: ViewDef[] = [WALL, CATALOG, PROFIT, HEALTH, BUILDS];

/** All routable views (rail + history which lives behind the settings menu). */
export const ALL_VIEWS: ViewDef[] = [...RAIL_VIEWS, HISTORY];

export const DEFAULT_VIEW = WALL;

export function findViewByPath(pathname: string): ViewDef | undefined {
  return ALL_VIEWS.find(
    (v) => pathname === v.path || pathname.startsWith(`${v.path}/`)
  );
}
