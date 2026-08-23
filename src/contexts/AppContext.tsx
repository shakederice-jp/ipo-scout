"use client";
import { createContext, useContext, useState, useEffect } from "react";

type FontSize = "sm" | "md" | "lg";
type Lang = "ja" | "en";
type Level = "beginner" | "expert";

interface AppContextType {
  fontSize: FontSize;
  setFontSize: (s: FontSize) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  level: Level;
  setLevel: (l: Level) => void;
  // ユーザーが一度でも明示的に初心者/中上級者を選んだことがあるか
  // (=初回案内バナーをもう出すべきでないか)の判定に使う
  levelChosen: boolean;
}

const AppContext = createContext<AppContextType>({
  fontSize: "md", setFontSize: () => {},
  lang: "ja",     setLang: () => {},
  level: "expert", setLevel: () => {},
  levelChosen: false,
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
  const [level, setLevelState]       = useState<Level>("expert");
  const [levelChosen, setLevelChosen] = useState(false);

  // ページ読み込み時にlocalStorageから復元して即適用
  useEffect(() => {
    const fs = localStorage.getItem("app-fs") as FontSize | null;
    const lg = localStorage.getItem("app-lang") as Lang | null;
    const lv = localStorage.getItem("app-level") as Level | null;
    if (fs) { setFontSizeState(fs); applyFontSize(fs); }
    if (lg) setLangState(lg);
    if (lv) { setLevelState(lv); setLevelChosen(true); }
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

  const setLevel = (l: Level) => {
    setLevelState(l);
    setLevelChosen(true);
    localStorage.setItem("app-level", l);
  };

  return (
    <AppContext.Provider value={{ fontSize, setFontSize, lang, setLang, level, setLevel, levelChosen }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
