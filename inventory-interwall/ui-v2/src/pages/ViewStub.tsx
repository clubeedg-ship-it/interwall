import { useLocation } from "react-router-dom";
import { findViewByPath } from "../config/views";

export default function ViewStub() {
  const location = useLocation();
  const view = findViewByPath(location.pathname);

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-16 pt-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {view?.title ?? "Unknown view"}
        </h1>
        <p className="mt-1 max-w-[640px] text-[13.5px] leading-relaxed text-[var(--color-text-dim)]">
          Port in progress. Open the legacy app while this view is being migrated.
        </p>
      </div>
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-line-strong)] bg-[var(--color-bg-card)] p-8 text-center text-[13px] text-[var(--color-text-muted)]">
        This surface hasn’t been ported yet. Legacy remains authoritative at{" "}
        <a
          href="http://localhost:1441/"
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[var(--color-accent)] hover:underline"
        >
          localhost:1441
        </a>
        .
      </div>
    </div>
  );
}
