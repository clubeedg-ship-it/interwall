import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "./api";

type AuthStatus = "checking" | "authenticated" | "anonymous";

interface AuthState {
  status: AuthStatus;
  userId: string | null;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "checking",
    userId: null,
  });

  const refresh = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setState({ status: "authenticated", userId: me.user_id });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setState({ status: "anonymous", userId: null });
        return;
      }
      setState({ status: "anonymous", userId: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string) => {
      await api.auth.login(username, password);
      await refresh();
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setState({ status: "anonymous", userId: null });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, refresh }),
    [state, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
