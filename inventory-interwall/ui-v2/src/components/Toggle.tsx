import { useId } from "react";

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: React.ReactNode;
  description?: string;
  disabled?: boolean;
  /**
   * Visual variant.
   * - `accent`: default teal glow (filter toggles, data toggles).
   * - `setting`: slightly brighter glow for user-preference toggles in the settings drawer.
   */
  variant?: "accent" | "setting";
  id?: string;
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  variant = "accent",
  id,
  className,
}: ToggleProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  const onTrack =
    variant === "setting"
      ? "border-[color-mix(in_oklab,var(--color-accent)_80%,white_20%)] bg-[color-mix(in_oklab,var(--color-accent)_80%,white_20%)] shadow-[0_0_12px_var(--color-accent-glow),inset_0_1px_0_rgba(255,255,255,0.2)]"
      : "border-[var(--color-accent-border)] bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent-glow),inset_0_1px_0_rgba(255,255,255,0.15)]";

  return (
    <label
      htmlFor={inputId}
      className={[
        "flex items-center gap-2.5 select-none",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className ?? "",
      ].join(" ")}
    >
      <button
        type="button"
        id={inputId}
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${inputId}-desc` : undefined}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={[
          "relative inline-block h-[18px] w-[32px] shrink-0 rounded-full border transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-glow)]",
          checked
            ? onTrack
            : "border-[var(--color-line-strong)] bg-[var(--color-glass-strong)]",
        ].join(" ")}
      >
        <span
          aria-hidden
          className={[
            "absolute top-1/2 block h-[12px] w-[12px] -translate-y-1/2 rounded-full transition-all duration-200",
            checked
              ? "left-[17px] bg-white shadow-[0_0_6px_rgba(255,255,255,0.75)]"
              : "left-[2px] bg-[var(--color-text-muted)]",
          ].join(" ")}
        />
      </button>
      {(label || description) && (
        <span className="flex flex-col leading-tight">
          {label && (
            <span className="text-[0.85rem] text-[var(--color-text-dim)]">
              {label}
            </span>
          )}
          {description && (
            <span
              id={`${inputId}-desc`}
              className="text-[0.72rem] text-[var(--color-text-muted)]"
            >
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}
