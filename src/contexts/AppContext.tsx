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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>("md");
  const [lang, setLangState]         = useState<Lang>("ja");

  useEffect(() => {
    const fs = localStorage.getItem("app-fs") as FontSize | null;
    const lg = localStorage.getItem("app-lang") as Lang | null;
    if (fs) setFontSizeState(fs);
    if (lg) setLangState(lg);
  }, []);

  const setFontSize = (s: FontSize) => {
    setFontSizeState(s);
    localStorage.setItem("app-fs", s);
    const scale = s === "sm" ? "1.05" : s === "lg" ? "1.28" : "1.16";
    document.documentElement.style.setProperty("--app-zoom", scale);
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