import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { HISTORY } from "../config/views";
import { usePreferences, type ThemeId } from "../hooks/usePreferences";

type Tab = "appearance" | "locale" | "currency" | "account";

const TABS: { id: Tab; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "locale", label: "Locale" },
  { id: "currency", label: "Currency" },
  { id: "account", label: "Account" },
];

/**
 * Settings — compact popup anchored under the gear icon.
 *
 * Keeps the tabbed IA (Appearance · Locale · Currency · Account) and the
 * pre-baked preference slots (theme / language / currency / number / date /
 * timezone) so forward compatibility holds. Only `theme` is wired to visible
 * state today — the rest are placeholders until multi-tenant auth lands.
 */
export function SettingsDrawer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("appearance");
  const { prefs, setPref } = usePreferences();
  const { userId, logout } = useAuth();
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        aria-expanded={open}
        className="hud-pill !p-2 text-[var(--color-text-dim)] transition-colors duration-200 hover:text-[var(--color-accent)]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div className="anim-popover-in absolute right-0 top-[calc(100%+8px)] z-50 w-[340px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          {/* header */}
          <div className="border-b border-[var(--color-line)] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
              Settings
            </div>
            <div className="text-[13px] font-semibold text-[var(--color-text)]">
              Workspace preferences
            </div>
          </div>

          {/* tab nav */}
          <nav className="flex border-b border-[var(--color-line)] px-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={[
                  "relative flex-1 px-2 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.1em] transition-colors duration-200",
                  tab === t.id
                    ? "text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-dim)]",
                ].join(" ")}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-t-sm bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent-glow)]" />
                )}
              </button>
            ))}
          </nav>

          {/* body */}
          <div className="max-h-[380px] overflow-y-auto px-4 py-4">
            {tab === "appearance" && (
              <Section label="Theme" hint="Choose how the console renders.">
                <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] p-0.5">
                  {(["dark", "light"] as ThemeId[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPref("theme", t)}
                      className={[
                        "rounded-[var(--radius-xs)] py-1.5 text-[12px] capitalize transition-all duration-200",
                        prefs.theme === t
                          ? "bg-[var(--color-accent)] text-white shadow-[0_0_12px_var(--color-accent-glow)]"
                          : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                      ].join(" ")}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {tab === "locale" && (
              <>
                <Section label="Language" hint="Interface language.">
                  <SelectStub value={prefs.language} />
                </Section>
                <Section label="Number format" hint="Thousands, decimals.">
                  <SelectStub value={prefs.number_format} />
                </Section>
                <Section label="Date format">
                  <SelectStub value={prefs.date_format} />
                </Section>
                <Section label="Timezone">
                  <SelectStub value={prefs.timezone} />
                </Section>
                <PlaceholderNote />
              </>
            )}

            {tab === "currency" && (
              <>
                <Section label="Primary currency" hint="Display currency.">
                  <SelectStub value={prefs.currency} />
                </Section>
                <PlaceholderNote />
              </>
            )}

            {tab === "account" && (
              <>
                <div className="mb-3 flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-glass)] px-3 py-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent)] font-mono text-[12px] font-semibold text-white shadow-[0_0_10px_var(--color-accent-glow)]">
                    {(userId ?? "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium">Operator</div>
                    <div className="truncate font-mono text-[10.5px] text-[var(--color-text-muted)]">
                      {userId ?? "—"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate(HISTORY.path);
                  }}
                  className="mb-2 flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-glass)] px-3 py-2 text-[12px] text-[var(--color-text-dim)] transition-all duration-200 hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={15} height={15}>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {HISTORY.title}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void logout();
                  }}
                  className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-glass)] px-3 py-2 text-[12px] font-medium text-[var(--color-text-dim)] transition-all duration-200 hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={15} height={15}>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Log out
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
          {label}
        </div>
        {hint && (
          <div className="mt-0.5 text-[10.5px] text-[var(--color-text-muted)]">
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function SelectStub({ value }: { value: string }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 text-[12px] text-[var(--color-text-muted)]">
      <span className="font-mono">{value}</span>
      <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[9.5px] uppercase tracking-[0.1em]">
        Coming soon
      </span>
    </div>
  );
}

function PlaceholderNote() {
  return (
    <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--color-text-muted)]">
      Editing locale &amp; currency unlocks once multi-tenant auth is in place.
      Slots are reserved so preferences move over without a rewrite.
    </p>
  );
}
