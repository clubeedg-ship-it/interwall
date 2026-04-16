import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { BuildsList } from "../components/BuildsList";
import { BuildWorkspace } from "../components/BuildWorkspace";
import { DraftList } from "../components/DraftList";
import { Toggle } from "../components/Toggle";
import { PageHeader } from "../components/PageHeader";
import { TabButton } from "../components/TabButton";
import { useDraftCount } from "../hooks/useDraftCount";
import type { BuildListItem, XrefItem } from "../lib/types";

type Tab = "active" | "pending";

export default function BuildsPage() {
  const { buildCode } = useParams<{ buildCode?: string }>();
  const navigate = useNavigate();
  const { count: draftCount, reload: reloadDrafts } = useDraftCount();

  const [tab, setTab] = useState<Tab>("active");

  const [builds, setBuilds] = useState<BuildListItem[]>([]);
  const [drafts, setDrafts] = useState<BuildListItem[]>([]);
  const [xrefs, setXrefs] = useState<XrefItem[]>([]);
  const [query, setQuery] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [includeAuto, setIncludeAuto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const buildsReq =
      tab === "pending"
        ? api.builds.list({ draft_only: true, per_page: 200 })
        : api.builds.list({ include_auto: includeAuto, per_page: 200 });
    Promise.allSettled([buildsReq, api.xref.list({ per_page: 200 })])
      .then(([bRes, xRes]) => {
        if (cancelled) return;
        if (bRes.status === "fulfilled") {
          if (tab === "pending") {
            setDrafts(bRes.value.items);
          } else {
            setBuilds(bRes.value.items);
          }
        }
        if (xRes.status === "fulfilled") setXrefs(xRes.value.items);
        const firstErr =
          bRes.status === "rejected"
            ? bRes.reason
            : xRes.status === "rejected"
              ? xRes.reason
              : null;
        if (firstErr) {
          setError(firstErr instanceof ApiError ? firstErr.message : String(firstErr));
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab, includeAuto, reloadToken]);

  const knownMarketplaces = useMemo(
    () => Array.from(new Set(xrefs.map((x) => x.marketplace))).sort(),
    [xrefs]
  );

  const sourceXrefs = useMemo(
    () => (buildCode ? xrefs.filter((x) => x.build_code === buildCode) : []),
    [xrefs, buildCode]
  );

  const filteredActive = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = builds;
    if (q) {
      list = list.filter(
        (b) =>
          b.build_code.toLowerCase().includes(q) ||
          (b.name ?? "").toLowerCase().includes(q)
      );
    }
    if (attentionOnly) {
      list = list.filter((b) => {
        if (b.is_auto_generated) return false;
        if (b.component_count === 0) return true;
        const has = new Set(
          xrefs.filter((x) => x.build_code === b.build_code).map((x) => x.marketplace)
        );
        return knownMarketplaces.some((m) => !has.has(m));
      });
    }
    return list;
  }, [builds, xrefs, query, attentionOnly, knownMarketplaces]);

  const filteredDrafts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drafts;
    return drafts.filter(
      (d) =>
        d.build_code.toLowerCase().includes(q) ||
        (d.draft_external_sku ?? "").toLowerCase().includes(q) ||
        (d.draft_marketplace ?? "").toLowerCase().includes(q) ||
        (d.name ?? "").toLowerCase().includes(q)
    );
  }, [drafts, query]);

  function onResolveDraft(code: string) {
    navigate(`/builds/${encodeURIComponent(code)}`);
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-[1200px] px-6 pb-16 pt-6">
        <PageHeader
          title="Builds"
          description="Create, review, and complete Build setup using Models, pinned Parts, and marketplace SKU mapping."
          actions={
            <button
              className="btn-primary"
              onClick={() => setNewOpen(true)}
              title="Create a new Build"
            >
              <span>+ New Build</span>
            </button>
          }
        />

        <div className="mb-4 flex items-center gap-1 border-b border-[var(--color-line)]">
          <TabButton
            label="Active"
            active={tab === "active"}
            onClick={() => setTab("active")}
          />
          <TabButton
            label="Pending verification"
            active={tab === "pending"}
            onClick={() => setTab("pending")}
            badge={draftCount}
            attention={draftCount > 0}
          />
        </div>

        <div className="row-card mb-3 flex-wrap gap-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === "pending"
                ? "Search by SKU / marketplace…"
                : "Search builds / build_code…"
            }
            className="min-w-[280px] flex-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
          />
          {tab === "active" && (
            <>
              <Toggle
                checked={attentionOnly}
                onChange={setAttentionOnly}
                label="Attention only"
              />
              <Toggle
                checked={includeAuto}
                onChange={setIncludeAuto}
                label="Include auto"
              />
            </>
          )}
        </div>

        {error && (
          <div className="row-card mb-3 border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_10%,transparent)] text-[13px] text-[var(--color-crit-ink)]">
            Failed to load builds: {error}
          </div>
        )}
        {loading ? (
          <div className="row-card h-20 animate-pulse" />
        ) : tab === "pending" ? (
          <DraftList drafts={filteredDrafts} onResolve={onResolveDraft} />
        ) : (
          <BuildsList
            builds={filteredActive}
            xrefs={xrefs}
            knownMarketplaces={knownMarketplaces}
            activeCode={buildCode ?? null}
          />
        )}
      </div>

      <BuildWorkspace
        buildCode={newOpen ? null : buildCode ?? null}
        knownMarketplaces={knownMarketplaces}
        sourceXrefs={newOpen ? [] : sourceXrefs}
        isNew={newOpen}
        onClose={() => {
          setNewOpen(false);
          navigate("/builds");
        }}
        onSaved={() => {
          setNewOpen(false);
          setReloadToken((t) => t + 1);
          void reloadDrafts();
          navigate("/builds");
        }}
      />
    </div>
  );
}

