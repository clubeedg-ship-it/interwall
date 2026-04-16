import { useEffect, useState } from "react";

export function Clock() {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const label = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return (
    <span className="hud-pill !py-1.5 !px-4 font-mono text-[12px] tabular-nums text-[var(--color-text-dim)]">
      {label}
    </span>
  );
}
