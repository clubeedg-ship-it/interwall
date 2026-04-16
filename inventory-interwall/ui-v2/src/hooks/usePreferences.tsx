import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * User preferences — theme / locale / currency / formatting.
 *
 * Backed by in-memory Context only for now. When Clerk multi-tenant auth lands,
 * swap the body of `loadPreferences` / `persist` to hit `/api/user/preferences`
 * without touching any consumer. The shape is already what the backend contract
 * will accept, so every component reading from here is forward-compatible.
 */

export type ThemeId = "dark" | "light";

export interface UserPreferences {
  theme: ThemeId;
  language: string;         // BCP-47 code (e.g. "en", "nl", "pt-BR")
  currency: string;         // ISO 4217 (e.g. "EUR", "USD")
  number_format: string;    // BCP-47 locale used for Intl.NumberFormat
  date_format: string;      // Display hint: "iso" | "eu" | "us" | "long"
  timezone: string;         // IANA tz (e.g. "Europe/Amsterdam")
}

const DEFAULTS: UserPreferences = {
  theme: "dark",
  language: "en",
  currency: "EUR",
  number_format: "en-US",
  date_format: "iso",
  timezone: "Europe/Amsterdam",
};

interface PreferencesContextValue {
  prefs: UserPreferences;
  setPref: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => void;
  loading: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO(auth): replace with `await api.user.preferences()` once Clerk lands.
    // Until then, preferences are in-memory only. Defaults are applied on mount.
    const t = setTimeout(() => setLoading(false), 0);
    return () => clearTimeout(t);
  }, []);

  // Apply theme to document (only slot that's actually wired to visible state).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", prefs.theme);
  }, [prefs.theme]);

  const setPref = useCallback<PreferencesContextValue["setPref"]>(
    (key, value) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
      // TODO(auth): PATCH /api/user/preferences { [key]: value }
    },
    []
  );

  const value = useMemo(
    () => ({ prefs, setPref, loading }),
    [prefs, setPref, loading]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used inside <PreferencesProvider>");
  }
  return ctx;
}
