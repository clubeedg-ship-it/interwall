import { useEffect, useState } from "react";

export function ReadyStatus() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch("/api/health/ping", { credentials: "include" });
        if (!cancelled) setOk(r.ok);
      } catch {
        if (!cancelled) setOk(false);
      }
    };
    void check();
    const id = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const label = ok === null ? "Checking" : ok ? "Ready" : "Offline";
  const dotColor =
    ok === null
      ? "bg-[var(--color-text-muted)]"
      : ok
        ? "bg-[var(--color-ok-ink)] shadow-[0_0_8px_var(--color-ok-ink)]"
        : "bg-[var(--color-crit-ink)] shadow-[0_0_8px_var(--color-crit-ink)]";

  return (
    <span className="hud-pill !py-1.5 !px-4 text-[12px] text-[var(--color-text-dim)]">
      <span
        aria-hidden
        className={["h-1.5 w-1.5 rounded-full", dotColor].join(" ")}
      />
      {label}
    </span>
  );
}
