import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface DraftCountValue {
  count: number;
  reload: () => Promise<void>;
}

const Ctx = createContext<DraftCountValue | null>(null);

export function DraftCountProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const mounted = useRef(true);
  const { status } = useAuth();

  const reload = useCallback(async () => {
    try {
      const res = await api.builds.list({ draft_only: true, per_page: 1 });
      if (mounted.current) setCount(res.draft_count);
    } catch {
      /* silent — leave last known count */
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (status === "authenticated") void reload();
    else if (status === "anonymous") setCount(0);
    return () => {
      mounted.current = false;
    };
  }, [reload, status]);

  return <Ctx.Provider value={{ count, reload }}>{children}</Ctx.Provider>;
}

export function useDraftCount(): DraftCountValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDraftCount must be used inside DraftCountProvider");
  return ctx;
}
