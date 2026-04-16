import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { ZONE_TEMPLATES } from "../../config/wall";

export function ZoneWizard({
  anchorRef,
  onClose,
  onCreated,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onCreated: (zoneId: string) => void;
}) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>("standard");
  const [cols, setCols] = useState(4);
  const [levels, setLevels] = useState(7);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchorRef, onClose]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const preset = ZONE_TEMPLATES.find((t) => t.id === id);
    if (preset) {
      setCols(preset.cols);
      setLevels(preset.levels);
    }
  }

  async function submit() {
    setError(null);
    const trimmed = name.trim().toUpperCase();
    if (!trimmed || !/^[A-Z0-9]+$/.test(trimmed)) {
      setError("Name must be letters or digits.");
      return;
    }
    if (cols < 1 || cols > 26 || levels < 1 || levels > 26) {
      setError("Columns and levels must be between 1 and 26.");
      return;
    }
    setPending(true);
    try {
      const resp = await api.zones.create({
        name: trimmed,
        template: {
          cols,
          levels,
          split_bins: true,
          single_bin_cols: [],
          default_capacity: null,
        },
      });
      onCreated(resp.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Add new zone"
      className="anim-popover-in absolute right-0 top-[calc(100%+10px)] z-50 w-[360px] rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-bg-elevated)] p-5 shadow-[0_32px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,0,0,0.3)] backdrop-blur-none"
      style={{ backgroundColor: "var(--color-bg-elevated)" }}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-dim)]">
          New zone
        </h3>
        <span className="font-mono text-[10.5px] text-[var(--color-text-muted)]">
          zones auto-created
        </span>
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
          Name
        </span>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && !pending && submit()}
          placeholder="e.g. C"
          maxLength={8}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[13px] uppercase text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
        />
      </label>

      <div className="mt-3">
        <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
          Template
        </span>
        <div className="grid gap-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] p-0.5">
          {[...ZONE_TEMPLATES, { id: "custom", label: "Custom", cols, levels, description: "set values below" }].map((t) => {
            const active = templateId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className={[
                  "flex items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-1.5 text-left text-[12px] transition-colors",
                  active
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-text-dim)] hover:bg-[var(--color-glass)] hover:text-[var(--color-text)]",
                ].join(" ")}
              >
                <span className="font-semibold">{t.label}</span>
                <span className="font-mono text-[10.5px] opacity-80">
                  {t.id === "custom" ? t.description : `${t.cols}×${t.levels}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberInput
          label="Columns"
          value={cols}
          min={1}
          max={26}
          onChange={(v) => {
            setCols(v);
            setTemplateId("custom");
          }}
        />
        <NumberInput
          label="Levels"
          value={levels}
          min={1}
          max={26}
          onChange={(v) => {
            setLevels(v);
            setTemplateId("custom");
          }}
        />
      </div>

      {error && (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_10%,transparent)] px-3 py-2 text-[12px] text-[var(--color-crit-ink)]">
          {error}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary disabled:opacity-60"
          onClick={submit}
          disabled={pending || !name.trim()}
        >
          {pending ? "Creating…" : "Create zone"}
        </button>
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
      />
    </label>
  );
}
