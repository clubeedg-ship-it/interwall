import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import type {
  BuildComponent,
  BuildDetail,
  CategoryItem,
  ComponentInput,
  DraftMetadata,
  DraftReplaySummary,
  ItemGroupItem,
  ProductItem,
  SourceType,
  XrefItem,
} from "../lib/types";
import { Modal } from "./Modal";
import { useToast } from "../hooks/useToast";
import { useDraftCount } from "../hooks/useDraftCount";

interface DraftComponent {
  key: string;
  source_type: SourceType;
  // item_group fields
  item_group_id?: string;
  item_group_code?: string | null;
  item_group_name?: string | null;
  // product fields
  product_id?: string;
  product_ean?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  quantity: number;
}

interface DraftMapping {
  marketplace: string;
  external_sku: string;
}

export function BuildWorkspace({
  buildCode,
  knownMarketplaces,
  sourceXrefs,
  isNew,
  onClose,
  onSaved,
}: {
  buildCode: string | null;
  knownMarketplaces: string[];
  sourceXrefs: XrefItem[];
  isNew: boolean;
  onClose: () => void;
  onSaved: (newCode: string) => void;
}) {
  const open = buildCode !== null || isNew;

  const [, setSource] = useState<BuildDetail | null>(null);
  const [draftMeta, setDraftMeta] = useState<DraftMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Draft state
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [components, setComponents] = useState<DraftComponent[]>([]);
  const [mappings, setMappings] = useState<DraftMapping[]>([]);

  const toast = useToast();
  const { reload: reloadDraftCount } = useDraftCount();

  const isDraftMode = !isNew && draftMeta !== null;

  // Prefill baseline for save-gate diff
  const prefillRef = useRef<{
    name: string;
    note: string;
    components: DraftComponent[];
    mappings: DraftMapping[];
  } | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isNew) {
      // blank draft
      setSource(null);
      setName("");
      setNote("");
      setComponents([]);
      const blank = knownMarketplaces.map((m) => ({ marketplace: m, external_sku: "" }));
      setMappings(blank);
      prefillRef.current = {
        name: "",
        note: "",
        components: [],
        mappings: blank,
      };
      setSaveError(null);
      return;
    }
    if (!buildCode) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setDraftMeta(null);
    api.builds
      .get(buildCode)
      .then((d) => {
        if (cancelled) return;
        setSource(d);
        setDraftMeta(d.draft_metadata ?? null);
        const draftComponents = d.components.map(componentToDraft);
        setName(d.name ?? "");
        setNote(d.description ?? "");
        setComponents(draftComponents);
        // Prefill mappings from this build's existing xrefs so user can check / change them.
        // Save diff decides which ones to write against the new branched build_code.
        const byMp = new Map(sourceXrefs.map((x) => [x.marketplace, x.external_sku]));
        // For drafts, seed the draft's own (marketplace, external_sku) pair from
        // draftMeta so the user sees the incoming email's code pre-populated instead
        // of a blank row they'd have to copy manually from the header.
        const draftSeedMp = d.draft_metadata?.marketplace;
        const draftSeedSku = d.draft_metadata?.external_sku;
        if (draftSeedMp && draftSeedSku && !byMp.has(draftSeedMp)) {
          byMp.set(draftSeedMp, draftSeedSku);
        }
        const prefilled = knownMarketplaces.map((m) => ({
          marketplace: m,
          external_sku: byMp.get(m) ?? "",
        }));
        // Include extra marketplaces that have xrefs on this build but aren't in knownMarketplaces
        for (const x of sourceXrefs) {
          if (!prefilled.some((p) => p.marketplace === x.marketplace)) {
            prefilled.push({ marketplace: x.marketplace, external_sku: x.external_sku });
          }
        }
        // And include the draft marketplace if it's not in knownMarketplaces or xrefs
        if (
          draftSeedMp &&
          draftSeedSku &&
          !prefilled.some((p) => p.marketplace === draftSeedMp)
        ) {
          prefilled.push({ marketplace: draftSeedMp, external_sku: draftSeedSku });
        }
        setMappings(prefilled);
        prefillRef.current = {
          name: d.name ?? "",
          note: d.description ?? "",
          components: draftComponents,
          mappings: prefilled,
        };
        setSaveError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : String(err));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, isNew, buildCode, knownMarketplaces, sourceXrefs]);

  const dirty = useMemo(() => {
    const p = prefillRef.current;
    if (!p) return false;
    if (name !== p.name) return true;
    if (note !== p.note) return true;
    if (!sameComponents(components, p.components)) return true;
    if (!sameMappings(mappings, p.mappings)) return true;
    return false;
  }, [name, note, components, mappings]);

  const saveDisabledReason = useMemo(() => {
    if (saving) return isDraftMode ? "Completing…" : "Saving…";
    if (components.length === 0) return "A Build needs at least one component";
    if (!dirty && !isNew && !isDraftMode) return "No changes yet";
    return null;
  }, [saving, components.length, dirty, isNew, isDraftMode]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      if (isDraftMode && buildCode) {
        const res = await api.builds.completeDraft(buildCode, {
          name: name.trim() || null,
          description: note.trim() || null,
          components: components.map(draftToComponentInput),
          replay: true,
        });
        toast.push(...toastForReplay(buildCode, res.replay));
        void reloadDraftCount();
        onSaved(buildCode);
        return;
      }
      if (!isNew && buildCode) {
        await api.builds.updateMeta(buildCode, {
          name: name.trim() || null,
          description: note.trim() || null,
        });
        await api.builds.replaceComponents(buildCode, {
          components: components.map(draftToComponentInput),
        });
        await syncBuildMappings(buildCode, sourceXrefs, mappings);
        onSaved(buildCode);
        return;
      }
      const created = await api.builds.create({
        name: name.trim() || null,
        description: note.trim() || null,
        components: components.map(draftToComponentInput),
      });
      const newCode = created.build_code;
      const prefillMappings = prefillRef.current?.mappings ?? [];
      const prefillByMp = new Map(
        prefillMappings.map((m) => [m.marketplace, m.external_sku.trim()])
      );
      // Only write mappings that are newly added or changed from prefill.
      // Unchanged non-empty mappings keep pointing at the source build (on purpose).
      const toCreate = mappings.filter((m) => {
        const sku = m.external_sku.trim();
        if (!sku) return false;
        const prior = prefillByMp.get(m.marketplace) ?? "";
        return sku !== prior;
      });
      for (const m of toCreate) {
        try {
          await api.xref.create({
            marketplace: m.marketplace,
            external_sku: m.external_sku.trim(),
            build_code: newCode,
          });
        } catch (err) {
          const msg = err instanceof ApiError ? err.message : String(err);
          throw new Error(
            `Build ${newCode} created, but SKU mapping ${m.marketplace}/${m.external_sku} failed: ${msg}`
          );
        }
      }
      onSaved(newCode);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!buildCode || isNew) return;
    const label = isDraftMode ? "draft" : "build";
    const confirmed = window.confirm(
      `Delete ${label} ${buildCode}? This cascades: SKU mappings, components, and any transactions for this build will be removed. Parts catalog is untouched.`
    );
    if (!confirmed) return;
    setDeleting(true);
    setSaveError(null);
    try {
      await api.builds.remove(buildCode);
      toast.push("success", `Deleted ${buildCode}`);
      reloadDraftCount();
      onSaved("");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  if (!open) return null;

  const loadingOrError = !isNew && (loading || loadError);

  return (
    <Modal open={open} onClose={onClose} labelledBy="build-workspace-title" size="lg">
      {loadingOrError ? (
        <LoadView loading={loading} error={loadError} onCancel={onClose} />
      ) : (
        <EditorView
          isNew={isNew}
          isDraft={isDraftMode}
          draftMeta={draftMeta}
          sourceCode={buildCode}
          name={name}
          note={note}
          components={components}
          mappings={mappings}
          saving={saving}
          saveError={saveError}
          saveDisabledReason={saveDisabledReason}
          onNameChange={setName}
          onNoteChange={setNote}
          onComponentsChange={setComponents}
          onMappingsChange={setMappings}
          onCancel={onClose}
          onSave={handleSave}
          onDelete={isNew ? null : handleDelete}
          deleting={deleting}
        />
      )}
    </Modal>
  );
}

// -- Loading / error-only skeleton ----------------------------------------

function LoadView({
  loading,
  error,
  onCancel,
}: {
  loading: boolean;
  error: string | null;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-6 py-4">
        <div id="build-workspace-title" className="text-[13px] font-semibold text-[var(--color-text-dim)]">
          Loading Build…
        </div>
        <button onClick={onCancel} className="btn-secondary">
          ESC · Close
        </button>
      </header>
      <div className="px-6 py-6">
        {loading ? (
          <div className="row-card h-20 animate-pulse" />
        ) : (
          <div className="row-card border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_12%,transparent)] text-[13px] text-[var(--color-crit-ink)]">
            Failed to load build: {error}
          </div>
        )}
      </div>
    </div>
  );
}

// -- Editor (3-column) ------------------------------------------------------

function EditorView({
  isNew,
  isDraft,
  draftMeta,
  sourceCode,
  name,
  note,
  components,
  mappings,
  saving,
  saveError,
  saveDisabledReason,
  onNameChange,
  onNoteChange,
  onComponentsChange,
  onMappingsChange,
  onCancel,
  onSave,
  onDelete,
  deleting,
}: {
  isNew: boolean;
  isDraft: boolean;
  draftMeta: DraftMetadata | null;
  sourceCode: string | null;
  name: string;
  note: string;
  components: DraftComponent[];
  mappings: DraftMapping[];
  saving: boolean;
  saveError: string | null;
  saveDisabledReason: string | null;
  onNameChange: (v: string) => void;
  onNoteChange: (v: string) => void;
  onComponentsChange: (next: DraftComponent[]) => void;
  onMappingsChange: (next: DraftMapping[]) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: (() => void) | null;
  deleting: boolean;
}) {
  const draftSku = draftMeta?.external_sku ?? sourceCode ?? "";
  const gridCols = "grid-cols-[240px_minmax(0,1fr)_320px]";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-6 py-4">
        <div className="flex min-w-0 flex-1 items-center gap-5">
          <div className="shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
              {isDraft ? "Complete draft" : "Build code"}
            </div>
            <div
              id="build-workspace-title"
              className="mt-1 flex items-center gap-2 font-mono text-[15px] font-semibold tracking-tight text-[var(--color-accent)]"
            >
              {isDraft ? (
                <>
                  <span className="led led-miss">DRAFT</span>
                  <span className="text-[13px] text-[var(--color-text)]">{draftSku}</span>
                  {draftMeta?.marketplace && (
                    <span className="text-[11px] font-normal text-[var(--color-text-muted)]">
                      · {draftMeta.marketplace}
                    </span>
                  )}
                </>
              ) : (
                <>
                  {isNew ? (
                    <span className="led led-auto">AUTO ON SAVE</span>
                  ) : (
                    <span className="text-[13px] text-[var(--color-text)]">{sourceCode}</span>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)] gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Build name"
                className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-[13.5px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Note
              </span>
              <input
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder="Internal note / description"
                className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-[13.5px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
              />
            </label>
          </div>
        </div>
        <button onClick={onCancel} className="btn-secondary shrink-0">
          ESC · Close
        </button>
      </header>

      <div className={`grid min-h-0 flex-1 ${gridCols} gap-0 overflow-hidden`}>
        <SkuMappingRail mappings={mappings} onChange={onMappingsChange} />
        <CompositionCanvas
          components={components}
          onChange={onComponentsChange}
          draftHint={isDraft ? draftMeta : null}
        />
        <LibraryRail
          onAddItemGroup={(g) =>
            onComponentsChange([
              ...components,
              draftFromItemGroup(g),
            ])
          }
          onAddProduct={(p) =>
            onComponentsChange([
              ...components,
              draftFromProduct(p),
            ])
          }
        />
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-6 py-3">
        <div className="min-w-0 flex-1 text-[12.5px] text-[var(--color-text-muted)]">
          {saveError ? (
            <span className="text-[var(--color-crit-ink)]">{saveError}</span>
          ) : saveDisabledReason ? (
            <span>{saveDisabledReason}</span>
          ) : (
            <span>Ready to save.</span>
          )}
        </div>
        <div className="flex gap-2">
          {onDelete && (
            <button
              className="btn-secondary border-[color-mix(in_oklab,var(--color-crit)_40%,transparent)] text-[var(--color-crit-ink)] hover:bg-[color-mix(in_oklab,var(--color-crit)_12%,transparent)]"
              onClick={onDelete}
              disabled={saving || deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
          <button className="btn-secondary" onClick={onCancel} disabled={saving || deleting}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={onSave}
            disabled={saveDisabledReason !== null || deleting}
            title={saveDisabledReason ?? undefined}
          >
            {isDraft
              ? saving
                ? "Completing…"
                : "Complete draft and replay"
              : saving
                ? "Saving…"
                : "Save Build"}
          </button>
        </div>
      </footer>
    </div>
  );
}

// -- Left column: SKU mapping rail ------------------------------------------

function SkuMappingRail({
  mappings,
  onChange,
}: {
  mappings: DraftMapping[];
  onChange: (next: DraftMapping[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newMarketplace, setNewMarketplace] = useState("");

  function update(index: number, patch: Partial<DraftMapping>) {
    onChange(mappings.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function addMarketplace() {
    const trimmed = newMarketplace.trim();
    if (!trimmed) return;
    if (mappings.some((m) => m.marketplace.toLowerCase() === trimmed.toLowerCase())) {
      setAdding(false);
      setNewMarketplace("");
      return;
    }
    onChange([...mappings, { marketplace: trimmed, external_sku: "" }]);
    setNewMarketplace("");
    setAdding(false);
  }

  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-[var(--color-line)] bg-[var(--color-bg)] px-4 py-4">
      <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
        SKU mapping
      </div>
      <div className="grid gap-1.5">
        {mappings.map((m, i) => (
          <div
            key={m.marketplace}
            className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-2.5 py-2"
          >
            <div className="flex items-center justify-between text-[11.5px] font-medium">
              <span className="truncate text-[var(--color-text)]">{m.marketplace}</span>
              {m.external_sku.trim() ? (
                <span className="led led-ok">Set</span>
              ) : (
                <span className="led led-miss">Missing</span>
              )}
            </div>
            <input
              value={m.external_sku}
              onChange={(e) => update(i, { external_sku: e.target.value })}
              placeholder="external_sku"
              className="mt-1.5 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 font-mono text-[11.5px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
            />
          </div>
        ))}
      </div>
      {adding ? (
        <div className="mt-2 flex gap-1">
          <input
            autoFocus
            value={newMarketplace}
            onChange={(e) => setNewMarketplace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addMarketplace();
              if (e.key === "Escape") {
                setAdding(false);
                setNewMarketplace("");
              }
            }}
            placeholder="marketplace"
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 text-[11.5px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
          />
          <button onClick={addMarketplace} className="btn-secondary px-2 py-1 text-[11px]">
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-line)] px-2 py-1.5 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          + Add marketplace
        </button>
      )}
    </aside>
  );
}

// -- Center: composition canvas ---------------------------------------------

function CompositionCanvas({
  components,
  onChange,
  draftHint,
}: {
  components: DraftComponent[];
  onChange: (next: DraftComponent[]) => void;
  draftHint: DraftMetadata | null;
}) {
  function patch(index: number, p: Partial<DraftComponent>) {
    onChange(components.map((c, i) => (i === index ? { ...c, ...p } : c)));
  }
  function remove(index: number) {
    onChange(components.filter((_, i) => i !== index));
  }

  return (
    <section className="flex min-h-0 flex-col overflow-y-auto px-6 py-4">
      {draftHint && <DraftHintPanel meta={draftHint} />}
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
          Components
        </div>
        <div className="font-mono text-[11px] text-[var(--color-text-muted)]">
          {components.length} {components.length === 1 ? "component" : "components"}
        </div>
      </div>
      {components.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--color-line)] bg-[var(--color-bg)] px-6 py-10 text-center text-[13px] text-[var(--color-text-muted)]">
          Add Models or Parts from the library on the right to compose this Build.
        </div>
      ) : (
        <div className="grid gap-1.5">
          {components.map((c, i) => (
            <div
              key={c.key}
              className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2"
            >
              {c.source_type === "item_group" ? (
                <span className="led led-accent shrink-0">MODEL</span>
              ) : (
                <span className="led led-ok shrink-0">PART</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-[var(--color-text)]">
                  {c.source_type === "item_group"
                    ? c.item_group_name ?? "(unknown model)"
                    : c.product_name ?? "(unknown part)"}
                </div>
                <div className="truncate font-mono text-[11px] text-[var(--color-text-muted)]">
                  {c.source_type === "item_group"
                    ? c.item_group_code ?? ""
                    : [
                        c.product_sku && `SKU ${c.product_sku}`,
                        c.product_ean && `EAN ${c.product_ean}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </div>
              </div>
              <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                <span>Qty</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={c.quantity}
                  onChange={(e) => {
                    const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                    patch(i, { quantity: n });
                  }}
                  className="w-16 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 text-center font-mono text-[13px] tabular-nums text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
                />
              </label>
              <button
                onClick={() => remove(i)}
                aria-label="Remove component"
                className="rounded-[var(--radius-sm)] border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-text-muted)] hover:border-[var(--color-crit)] hover:text-[var(--color-crit-ink)]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// -- Right column: library --------------------------------------------------

type LibraryTab = "models" | "parts";

function LibraryRail({
  onAddItemGroup,
  onAddProduct,
}: {
  onAddItemGroup: (g: ItemGroupItem) => void;
  onAddProduct: (p: ProductItem) => void;
}) {
  const [tab, setTab] = useState<LibraryTab>("models");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");

  const [itemGroups, setItemGroups] = useState<ItemGroupItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      api.itemGroups.list({ per_page: 200 }),
      api.categories.list(),
    ])
      .then(([gRes, cRes]) => {
        if (cancelled) return;
        if (gRes.status === "fulfilled") setItemGroups(gRes.value.items);
        if (cRes.status === "fulfilled") setCategories(cRes.value);
        const err =
          gRes.status === "rejected" ? gRes.reason : cRes.status === "rejected" ? cRes.reason : null;
        if (err) setError(err instanceof ApiError ? err.message : String(err));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Products: server-side search via q
  useEffect(() => {
    if (tab !== "parts") return;
    let cancelled = false;
    const handle = setTimeout(() => {
      api.products
        .list({ q: query.trim() })
        .then((rows) => {
          if (cancelled) return;
          setProducts(rows);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof ApiError ? err.message : String(err));
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [tab, query]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return itemGroups;
    return itemGroups.filter(
      (g) => g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q)
    );
  }, [itemGroups, query]);

  const filteredProducts = useMemo(() => {
    if (!categoryId) return products;
    return products.filter((p) => p.category_id === categoryId);
  }, [products, categoryId]);

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-l border-[var(--color-line)] bg-[var(--color-bg)] px-4 py-4">
      <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
        Library
      </div>

      <div className="mb-3 grid grid-cols-2 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-line)]">
        {(["models", "parts"] as LibraryTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-2 py-1.5 text-[11.5px] font-medium uppercase tracking-[0.14em] transition-colors",
              tab === t
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
            ].join(" ")}
          >
            {t === "models" ? "Models" : "Parts"}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tab === "models" ? "Search models…" : "Search parts / EAN…"}
        className="mb-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-2.5 py-1.5 text-[12.5px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
      />

      {tab === "parts" && categories.length > 0 && (
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="mb-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-[12.5px] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {loading && <div className="row-card h-20 animate-pulse" />}
      {error && (
        <div className="rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_12%,transparent)] px-2 py-1.5 text-[11.5px] text-[var(--color-crit-ink)]">
          {error}
        </div>
      )}

      <div className="mt-1 flex-1 overflow-y-auto">
        {tab === "models" ? (
          <div className="grid gap-1.5">
            {filteredGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => onAddItemGroup(g)}
                className="group flex min-w-0 items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-2.5 py-2 text-left hover:border-[var(--color-accent-border)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-[var(--color-text)]">
                    {g.name}
                  </div>
                  <div className="truncate font-mono text-[10.5px] text-[var(--color-text-muted)]">
                    {g.code}
                  </div>
                </div>
                <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-accent)] opacity-70 group-hover:opacity-100">
                  + Add
                </span>
              </button>
            ))}
            {filteredGroups.length === 0 && !loading && (
              <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-line)] px-2 py-3 text-center text-[11.5px] text-[var(--color-text-muted)]">
                No Models match.
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-1.5">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => onAddProduct(p)}
                className="group flex min-w-0 items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-2.5 py-2 text-left hover:border-[var(--color-accent-border)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-[var(--color-text)]">
                    {p.name}
                  </div>
                  <div className="truncate font-mono text-[10.5px] text-[var(--color-text-muted)]">
                    EAN {p.ean}
                    {p.category_name ? ` · ${p.category_name}` : ""}
                  </div>
                </div>
                <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-accent)] opacity-70 group-hover:opacity-100">
                  + Add
                </span>
              </button>
            ))}
            {filteredProducts.length === 0 && !loading && (
              <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-line)] px-2 py-3 text-center text-[11.5px] text-[var(--color-text-muted)]">
                No Parts match.
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

// -- Helpers ----------------------------------------------------------------

function componentToDraft(c: BuildComponent): DraftComponent {
  if (c.source_type === "item_group") {
    return {
      key: c.id,
      source_type: "item_group",
      item_group_id: c.item_group_id,
      item_group_code: c.item_group_code,
      item_group_name: c.item_group_name,
      quantity: c.quantity,
    };
  }
  return {
    key: c.id,
    source_type: "product",
    product_id: c.product_id,
    product_ean: c.product_ean,
    product_name: c.product_name,
    product_sku: c.product_sku,
    quantity: c.quantity,
  };
}

function draftToComponentInput(d: DraftComponent): ComponentInput {
  if (d.source_type === "item_group") {
    if (!d.item_group_id) throw new Error("item_group draft missing id");
    return {
      source_type: "item_group",
      item_group_id: d.item_group_id,
      quantity: d.quantity,
    };
  }
  if (!d.product_id) throw new Error("product draft missing id");
  return {
    source_type: "product",
    product_id: d.product_id,
    quantity: d.quantity,
  };
}

function draftFromItemGroup(g: ItemGroupItem): DraftComponent {
  return {
    key: `new:ig:${g.id}:${Date.now()}:${Math.random()}`,
    source_type: "item_group",
    item_group_id: g.id,
    item_group_code: g.code,
    item_group_name: g.name,
    quantity: 1,
  };
}

function draftFromProduct(p: ProductItem): DraftComponent {
  return {
    key: `new:p:${p.id}:${Date.now()}:${Math.random()}`,
    source_type: "product",
    product_id: p.id,
    product_ean: p.ean,
    product_name: p.name,
    product_sku: p.sku,
    quantity: 1,
  };
}

function sameComponents(a: DraftComponent[], b: DraftComponent[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.source_type !== y.source_type) return false;
    if (x.quantity !== y.quantity) return false;
    if (x.source_type === "item_group") {
      if (x.item_group_id !== y.item_group_id) return false;
    } else {
      if (x.product_id !== y.product_id) return false;
    }
  }
  return true;
}

function sameMappings(a: DraftMapping[], b: DraftMapping[]): boolean {
  if (a.length !== b.length) return false;
  const map = new Map(b.map((m) => [m.marketplace, m.external_sku.trim()]));
  for (const m of a) {
    const other = map.get(m.marketplace);
    if (other === undefined) return false;
    if (m.external_sku.trim() !== other) return false;
  }
  return true;
}

async function syncBuildMappings(
  buildCode: string,
  sourceXrefs: XrefItem[],
  mappings: DraftMapping[]
) {
  const existingByMarketplace = new Map(
    sourceXrefs.map((x) => [x.marketplace, x])
  );
  const desiredByMarketplace = new Map(
    mappings.map((m) => [m.marketplace, m.external_sku.trim()])
  );

  for (const [marketplace, existing] of existingByMarketplace) {
    const nextSku = desiredByMarketplace.get(marketplace) ?? "";
    if (nextSku === existing.external_sku) continue;
    await api.xref.remove(existing.id);
    if (nextSku) {
      await api.xref.create({
        marketplace,
        external_sku: nextSku,
        build_code: buildCode,
      });
    }
  }

  for (const [marketplace, externalSku] of desiredByMarketplace) {
    if (!externalSku) continue;
    if (existingByMarketplace.has(marketplace)) continue;
    await api.xref.create({
      marketplace,
      external_sku: externalSku,
      build_code: buildCode,
    });
  }
}

// -- Draft hint panel -------------------------------------------------------

function DraftHintPanel({ meta }: { meta: DraftMetadata }) {
  const pending = meta.pending_review_count;
  const lines = meta.parsed_descriptions;
  return (
    <aside className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-accent-border)] bg-[color-mix(in_oklab,var(--color-accent)_10%,transparent)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
          Parsed from emails
        </span>
        {pending > 0 && (
          <span className="ml-auto text-[11.5px] font-semibold text-[var(--color-pulse-healthy)]">
            {pending} blocked {pending === 1 ? "sale" : "sales"} will process on complete
          </span>
        )}
      </div>
      {lines.length === 0 ? (
        <p className="mt-2 text-[12px] italic text-[var(--color-text-muted)]">
          No product descriptions captured.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {lines.map((l, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-[12.5px] italic leading-snug text-[var(--color-text-dim)]"
            >
              <span
                className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--color-accent)]"
                aria-hidden
              />
              <span className="min-w-0 flex-1">{l}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

// -- Toast copy for replay summary ------------------------------------------

function toastForReplay(
  buildCode: string,
  r: DraftReplaySummary
): ["success" | "warning" | "error", string] {
  const errored = r.failed + r.dead_letter;
  if (errored > 0) {
    return [
      "error",
      `Build ${buildCode} complete · ${r.processed} booked, ${errored} errored — check Health.`,
    ];
  }
  if (r.review > 0) {
    return [
      "warning",
      `Build ${buildCode} complete · ${r.processed} sales booked, ${r.review} still waiting on stock.`,
    ];
  }
  return [
    "success",
    `Build ${buildCode} complete · ${r.processed} blocked ${r.processed === 1 ? "sale" : "sales"} booked as transactions.`,
  ];
}
