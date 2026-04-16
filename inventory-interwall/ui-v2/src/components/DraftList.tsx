import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { BuildListItem, DraftMetadata } from "../lib/types";

export function DraftList({
  drafts,
  onResolve,
}: {
  drafts: BuildListItem[];
  onResolve: (buildCode: string) => void;
}) {
  if (drafts.length === 0) {
    return (
      <div className="row-card justify-center py-10 text-[var(--color-text-muted)]">
        No drafts pending. The backlog is clear.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3">
      {drafts.map((d) => (
        <DraftCard key={d.build_code} draft={d} onResolve={onResolve} />
      ))}
    </div>
  );
}

function DraftCard({
  draft,
  onResolve,
}: {
  draft: BuildListItem;
  onResolve: (buildCode: string) => void;
}) {
  const [meta, setMeta] = useState<DraftMetadata | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingMeta(true);
    api.builds
      .get(draft.build_code)
      .then((d) => {
        if (cancelled) return;
        setMeta(d.draft_metadata ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMetaError(err instanceof ApiError ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.build_code]);

  const descriptions = meta?.parsed_descriptions ?? [];
  const pending = meta?.pending_review_count ?? 0;
  const marketplace = draft.draft_marketplace ?? meta?.marketplace ?? "unknown";
  const sku = draft.draft_external_sku ?? meta?.external_sku ?? draft.build_code;

  return (
    <article className="anim-fade-slide-in rounded-[var(--radius-md)] border border-[var(--color-line)] border-l-[3px] border-l-[var(--color-pulse-warning)] bg-[var(--color-glass)] px-5 py-4 backdrop-blur-sm">
      <header className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center rounded-full border border-[var(--color-accent-border)] bg-[color-mix(in_oklab,var(--color-accent)_18%,transparent)] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
          {marketplace}
        </span>
        <span className="font-mono text-[13px] font-semibold text-[var(--color-text)]">
          {sku}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onResolve(draft.build_code)}
            className="btn-primary text-[0.8rem]"
          >
            Resolve
          </button>
        </div>
      </header>

      {pending > 0 && (
        <p className="mt-2 text-[12.5px] font-medium text-[var(--color-pulse-healthy)]">
          {pending} blocked {pending === 1 ? "sale" : "sales"} will process when completed.
        </p>
      )}

      {draft.name && (
        <p className="mt-2 text-[13px] text-[var(--color-text-dim)]">
          {draft.name}
        </p>
      )}

      <div className="mt-3">
        <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
          Parsed from emails
        </div>
        {loadingMeta ? (
          <div className="h-10 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-glass)]" />
        ) : metaError ? (
          <p className="text-[12px] text-[var(--color-pulse-critical)]">
            Failed to load descriptions: {metaError}
          </p>
        ) : descriptions.length === 0 ? (
          <p className="text-[12px] italic text-[var(--color-text-muted)]">
            No product descriptions captured.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {descriptions.map((d, i) => (
              <DescriptionLine key={i} text={d} />
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function DescriptionLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard denied — silent */
    }
  }

  return (
    <li className="group flex items-start gap-2 text-[12.5px] italic leading-snug text-[var(--color-text-dim)]">
      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--color-text-muted)]" aria-hidden />
      <span className="min-w-0 flex-1">{text}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy description"}
        title={copied ? "Copied" : "Copy"}
        className="shrink-0 rounded-[var(--radius-xs)] border border-transparent p-1 text-[var(--color-text-muted)] opacity-0 transition-all duration-200 hover:border-[var(--color-line)] hover:text-[var(--color-text)] group-hover:opacity-100 focus-visible:opacity-100"
      >
        {copied ? (
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" />
          </svg>
        )}
      </button>
    </li>
  );
}
