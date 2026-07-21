import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "spendvault-theme";

// Dark-first (Phantom). The choice persists and drives the `light`/`dark` class
// on <html>, which flips the token block in index.css.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") return saved;
    }
    return "dark";
  });

  useEffect(() => {
    const el = document.documentElement;
    el.classList.remove("light", "dark");
    el.classList.add(theme);
    el.style.colorScheme = theme;
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
