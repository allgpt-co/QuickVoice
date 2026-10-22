"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";
const storageKey = "quickvoice-docs-theme";

function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getInitialTheme, () => "dark" as const);

  function toggleTheme() {
    const nextTheme: Theme = getInitialTheme() === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try {
      window.localStorage.setItem(storageKey, nextTheme);
    } catch {
      // Theme switching still works when browser storage is unavailable.
    }
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="fixed right-4 top-4 z-[100] inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--qv-border)] bg-[var(--qv-card)] px-3 text-sm font-semibold text-[var(--qv-ink)] shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:border-[var(--qv-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--qv-blue)]/35 motion-reduce:transform-none motion-reduce:transition-none"
      onClick={toggleTheme}
    >
      {isDark ? <Sun aria-hidden="true" className="size-4 text-[var(--qv-blue)]" /> : <Moon aria-hidden="true" className="size-4 text-[var(--qv-blue)]" />}
      <span className="hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
