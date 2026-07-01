import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type AppMode = "gutachten" | "dsb";

export const MODE_LABEL: Record<AppMode, string> = {
  gutachten: "Gutachten",
  dsb: "Datenschutz",
};

const STORAGE_KEY = "imb.mode";

interface ModeCtx {
  mode: AppMode;
  setMode: (m: AppMode) => void;
}

const Ctx = createContext<ModeCtx | null>(null);

function readInitial(): AppMode {
  if (typeof window === "undefined") return "gutachten";
  // URL param wins so shared links work
  try {
    const url = new URL(window.location.href);
    const p = url.searchParams.get("modus");
    if (p === "dsb" || p === "gutachten") return p;
  } catch {
    /* ignore */
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "dsb" ? "dsb" : "gutachten";
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>("gutachten");

  useEffect(() => {
    setModeState(readInitial());
  }, []);

  const setMode = useCallback((m: AppMode) => {
    setModeState(m);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, m);
        const url = new URL(window.location.href);
        url.searchParams.set("modus", m);
        window.history.replaceState({}, "", url.toString());
      } catch {
        /* ignore */
      }
    }
  }, []);

  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export function useMode(): ModeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMode must be used within ModeProvider");
  return ctx;
}
