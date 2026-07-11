"use client";
import { createContext, useContext, useState, useEffect } from "react";

type FontSize = "sm" | "md" | "lg";
type Lang = "ja" | "en";

interface AppContextType {
  fontSize: FontSize;
  setFontSize: (s: FontSize) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
}

const AppContext = createContext<AppContextType>({
  fontSize: "md", setFontSize: () => {},
  lang: "ja",     setLang: () => {},
});

const ZOOM_MAP: Record<FontSize, string> = {
  sm: "1.08",
  md: "1.15",
  lg: "1.23",
};

function applyFontSize(s: FontSize) {
  document.documentElement.style.setProperty("--app-zoom", ZOOM_MAP[s]);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>("md");
  const [lang, setLangState]         = useState<Lang>("ja");

  // ページ読み込み時にlocalStorageから復元して即適用
  useEffect(() => {
    const fs = localStorage.getItem("app-fs") as FontSize | null;
    const lg = localStorage.getItem("app-lang") as Lang | null;
    if (fs) { setFontSizeState(fs); applyFontSize(fs); }
    if (lg) setLangState(lg);
  }, []);

  const setFontSize = (s: FontSize) => {
    setFontSizeState(s);
    localStorage.setItem("app-fs", s);
    applyFontSize(s);
  };

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("app-lang", l);
  };

  return (
    <AppContext.Provider value={{ fontSize, setFontSize, lang, setLang }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);