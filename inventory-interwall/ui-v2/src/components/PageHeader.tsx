import type { ReactNode } from "react";

/**
 * Universal page header — title + description + optional action cluster.
 * Every top-level page renders this as its first child. Keeps the app feeling
 * like one instrument panel instead of five ad-hoc layouts.
 *
 * Composable on purpose. Pages that also need filter strips, tool rails, or
 * inner-page tabs render those separately below this header — we don't try
 * to bake every shape into a single component.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-[640px] text-[13.5px] leading-relaxed text-[var(--color-text-dim)]">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
