"use client";

import { useEffect, useState } from "react";

/**
 * Toggles the `.dark` class on <html> and persists the choice to
 * localStorage. The initial class is set by an inline script in
 * layout.tsx (ThemeScript) before hydration, so there's no flash of the
 * wrong theme and no mismatch between server and first client render —
 * this component only reads that already-applied class on mount, never
 * decides it.
 *
 * A signed-in user may also be starting from the role-based "grey" default
 * ((app)/layout.tsx's data-theme="grey" — see globals.css) instead of
 * plain light or dark. This toggle treats grey as part of the "light"
 * family for its own binary light/dark switch — clicking it from grey
 * always lands on dark, same as clicking it from plain light would. Once
 * clicked, the choice is saved explicitly ("dark"/"light") and the role
 * default is never reapplied for this user again, matching the rest of
 * the app: a manual choice always wins over a role default.
 *
 * Also records `themeRole` alongside the saved theme, so the "manual choice
 * wins" rule is scoped to the role that made it. Without this, the demo/dev
 * pattern of switching between admin/faculty/student/proctor logins on the
 * SAME browser would leak one account's manual toggle onto every other
 * role's default afterward — (app)/layout.tsx's bootstrap script only
 * honors the saved theme when themeRole matches the currently signed-in
 * role, and falls back to that role's own default otherwise.
 */
export function ThemeToggle({ role }: { role?: string }) {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    function readInitial() {
      setIsDark(document.documentElement.classList.contains("dark"));
    }
    readInitial();
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.setItem("theme", next ? "dark" : "light");
    if (role) {
      window.localStorage.setItem("themeRole", role);
    } else {
      window.localStorage.removeItem("themeRole");
    }
    setIsDark(next);
  }

  // Avoids a hydration mismatch the same way ExamCountdown does: nothing
  // client-only renders until mount confirms the real state.
  if (isDark === null) {
    return <span className="h-8 w-8" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {isDark ? (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4.5 w-4.5">
          <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM17.25 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.6 5.4a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 11-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zM7.52 12.48a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 11-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zM14.6 14.6a.75.75 0 01-1.06 0l-1.06-1.06a.75.75 0 111.06-1.06l1.06 1.06a.75.75 0 010 1.06zM7.52 7.52a.75.75 0 01-1.06 0L5.4 6.46a.75.75 0 111.06-1.06l1.06 1.06a.75.75 0 010 1.06zM10 6a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4.5 w-4.5">
          <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}
