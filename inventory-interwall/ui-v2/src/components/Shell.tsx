import { NavLink, Outlet, useLocation } from "react-router-dom";
import { RAIL_VIEWS, findViewByPath } from "../config/views";
import { Clock } from "./Clock";
import { ReadyStatus } from "./ReadyStatus";
import { SettingsDrawer } from "./SettingsDrawer";
import { useDraftCount } from "../hooks/useDraftCount";

export default function Shell() {
  const location = useLocation();
  const current = findViewByPath(location.pathname);
  const title = current?.title ?? "";
  const { count: draftCount } = useDraftCount();

  return (
    <div className="relative min-h-full pl-[100px]">
      {/* Floating orb rail — mirrors legacy frontend/index.html sidebar */}
      <aside className="fixed left-6 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-4">
        {RAIL_VIEWS.map((view) => {
          const badge = view.key === "builds" ? draftCount : 0;
          return (
            <NavLink
              key={view.key}
              to={view.path}
              aria-label={
                badge > 0 ? `${view.title} (${badge} pending)` : view.title
              }
              data-label={view.title}
              className={({ isActive }) =>
                ["orb", isActive ? "is-active" : ""].join(" ")
              }
            >
              {view.icon}
              {badge > 0 && <span className="orb-badge">{badge}</span>}
            </NavLink>
          );
        })}
      </aside>

      {/* HUD header — left pill + right status cluster */}
      <header className="flex items-start justify-between gap-4 px-6 pt-6">
        <div className="hud-pill">
          <span className="text-[1rem] font-extrabold tracking-[0.05em] text-[var(--color-accent)]">
            INTERWALL
          </span>
          <span className="h-4 w-px bg-[var(--color-line-strong)]" />
          <span className="text-[0.75rem] font-medium uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ReadyStatus />
          <SettingsDrawer />
          <Clock />
        </div>
      </header>

      <main className="min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
