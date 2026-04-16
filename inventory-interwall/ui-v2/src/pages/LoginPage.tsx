import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-card)] p-6 shadow-[0_12px_48px_rgba(0,0,0,0.45)]"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)]" />
          <span className="text-[0.78rem] font-extrabold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            INTERWALL
          </span>
          <span className="ml-auto text-[11px] font-mono text-[var(--color-text-muted)]">
            v2
          </span>
        </div>
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mb-5 text-[12.5px] text-[var(--color-text-dim)]">
          Operator console access. Session cookie based.
        </p>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            Username
          </span>
          <input
            ref={userRef}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
          />
        </label>
        <label className="mb-5 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
          />
        </label>

        {error && (
          <div className="mb-4 rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-crit)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-crit)_12%,transparent)] px-3 py-2 text-[12.5px] text-[var(--color-crit-ink)]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending || !username || !password}
          className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
