"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The early-submission path — for a student who wants to submit before
 * reaching the final question, rather than via ExamQuestionPager's
 * Next-becomes-Submit swap on the last one. Deliberately placed near the
 * top of the exam-taking screen, matching where the real app this trainer
 * practices for puts its own equivalent menu; the point of the reskin is
 * that the muscle memory ("submission lives up here, not just at the
 * bottom") transfers to the real exam day.
 *
 * Triggers submission via the same hidden Submit button `ExamCountdown`
 * uses for auto-submit-on-expiry — one submit path, one place the actual
 * form action lives, regardless of which UI element fired it.
 */
export function ExamControlsMenu({ submitButtonId }: { submitButtonId: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Exam Controls
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              document.getElementById(submitButtonId)?.click();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Submit Exam
          </button>
        </div>
      )}
    </div>
  );
}
