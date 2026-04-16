import { useState } from "react";
import { api, ApiError } from "../lib/api";
import type { CategoryItem } from "../lib/types";
import { Modal } from "./Modal";

/**
 * Category manager — compact modal that lists every category, lets the operator
 * rename (click name → edit inline → Enter to save) and delete (only when no
 * parts reference the category; backend returns 409 otherwise). New categories
 * are added from the bottom row. Real backend CRUD, no caching.
 */
export function CategoryManager({
  open,
  onClose,
  categories,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryItem[];
  onChanged: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="cat-mgr-title" size="sm">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-baseline justify-between border-b border-[var(--color-line)] px-5 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
              Catalog
            </div>
            <h2
              id="cat-mgr-title"
              className="text-[1.1rem] font-semibold tracking-tight"
            >
              Categories
            </h2>
          </div>
          <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--color-text-muted)]">
            {categories.length}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {categories.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-[var(--color-text-muted)]">
              No categories yet. Add the first one below.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {categories.map((c) => (
                <CategoryRow key={c.id} cat={c} onChanged={onChanged} />
              ))}
            </ul>
          )}
        </div>

        <NewCategoryRow onChanged={onChanged} />
      </div>
    </Modal>
  );
}

function CategoryRow({
  cat,
  onChanged,
}: {
  cat: CategoryItem;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === cat.name) {
      setEditing(false);
      setName(cat.name);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.categories.update(cat.id, { name: trimmed });
      onChanged();
      setEditing(false);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    setBusy(true);
    setErr(null);
    try {
      await api.categories.remove(cat.id);
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-glass)] px-3 py-2 transition-colors duration-200 hover:border-[var(--color-line-strong)]">
      <div className="flex items-center gap-2">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") {
                setEditing(false);
                setName(cat.name);
              }
            }}
            onBlur={save}
            autoFocus
            disabled={busy}
            className="flex-1 rounded-[var(--radius-xs)] border border-[var(--color-accent-border)] bg-[var(--color-bg)] px-2 py-1 text-[12.5px] text-[var(--color-text)] focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex-1 truncate text-left text-[12.5px] text-[var(--color-text)] transition-colors duration-150 hover:text-[var(--color-accent)]"
            title="Click to rename"
          >
            {cat.name}
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          title="Delete category"
          className="rounded-[var(--radius-xs)] p-1 text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--color-pulse-critical)_12%,transparent)] hover:text-[var(--color-pulse-critical)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
      {err && (
        <p className="text-[11px] text-[var(--color-pulse-critical)]">{err}</p>
      )}
    </li>
  );
}

function NewCategoryRow({ onChanged }: { onChanged: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setErr(null);
    try {
      await api.categories.create({ name: trimmed });
      setName("");
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-[var(--color-line)] bg-[var(--color-glass)] px-5 py-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        New category
      </div>
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder="Name…"
          disabled={busy}
          className="flex-1 rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !name.trim()}
          className="btn-primary !px-4 !py-1.5 text-[11.5px]"
        >
          {busy ? "…" : "Add"}
        </button>
      </div>
      {err && (
        <p className="mt-1.5 text-[11px] text-[var(--color-pulse-critical)]">
          {err}
        </p>
      )}
    </div>
  );
}
