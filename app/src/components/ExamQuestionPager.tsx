"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui";

export interface QuestionPagerMeta {
  id: string;
  flagged: boolean;
  answered: boolean;
}

type PagerFilter = "all" | "unanswered" | "flagged";

/**
 * Shows one question at a time with a palette to jump between them, per the
 * real secure-exam UX benchmark (Next/Previous, flag-and-return-later) —
 * and specifically shaped to match the exam-taking practice this trainer
 * exists to build: a Filter control over the palette (All / Unanswered /
 * Flagged) and a Next button that becomes Submit on the final question,
 * mirroring the two ways a student reaches submission in the real app this
 * is training for. Early submission is a separate `ExamControlsMenu` in
 * the page header, matching that app's own placement.
 *
 * Every question's fieldset stays mounted in the underlying <form> — this
 * only controls which one is visible — so Save Progress and Submit Exam
 * keep working exactly as before regardless of which question is on screen
 * or which filter is active. Filtering only changes which numbers appear
 * in the palette, never which fieldset is currently open.
 *
 * The palette's flagged/answered dots reflect the last-saved state, not live
 * keystrokes — same simplification as the "Flagged" badge elsewhere on this
 * page, which also only updates after a Save Progress round-trip.
 */
export function ExamQuestionPager({
  questions,
  children,
  submitButtonId,
  allowBacktracking = true,
}: {
  questions: QuestionPagerMeta[];
  children: ReactNode[];
  submitButtonId: string;
  /** ExamVersion.allowBacktracking — when false, a question can't be revisited once left behind. Real enforcement: the Previous button and any palette jump to an earlier question are disabled, not just hidden. */
  allowBacktracking?: boolean;
}) {
  const [active, setActiveRaw] = useState(0);
  // Highest index ever visited — the actual "no backtracking" boundary.
  // Tracking this separately from `active` (rather than just disabling
  // Previous) is what stops a direct palette jump back into an earlier
  // question too, not just the linear Previous button.
  const [maxVisited, setMaxVisited] = useState(0);
  const [filter, setFilter] = useState<PagerFilter>("all");
  const total = questions.length;
  const isLastQuestion = active === total - 1;

  function setActive(index: number) {
    setActiveRaw(index);
    setMaxVisited((m) => Math.max(m, index));
  }

  const visible = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => {
      if (filter === "unanswered") return !q.answered;
      if (filter === "flagged") return q.flagged;
      return true;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Questions</span>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          Filter
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as PagerFilter)}
            className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs transition-colors focus:border-brand-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="all">All</option>
            <option value="unanswered">Unanswered</option>
            <option value="flagged">Flagged</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {visible.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No questions match this filter.</p>
        ) : (
          visible.map(({ q, i }) => {
            const locked = !allowBacktracking && i < maxVisited;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => !locked && setActive(i)}
                disabled={locked}
                title={locked ? "Backward navigation is disabled for this exam" : undefined}
                aria-current={i === active}
                className={
                  "relative h-8 w-8 rounded-lg border text-xs font-medium transition-colors " +
                  (locked
                    ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-700"
                    : i === active
                      ? "border-brand-primary bg-brand-primary text-white"
                      : q.answered
                        ? "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800")
                }
              >
                {i + 1}
                {q.flagged && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400" aria-label="Flagged" />
                )}
              </button>
            );
          })
        )}
      </div>

      {children.map((child, i) => (
        <div key={i} className={i === active ? "" : "hidden"}>
          {child}
        </div>
      ))}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setActive(Math.max(0, active - 1))}
          disabled={active === 0 || !allowBacktracking}
          title={!allowBacktracking && active > 0 ? "Backward navigation is disabled for this exam" : undefined}
        >
          ← Previous
        </Button>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Question {active + 1} of {total}
        </span>
        {isLastQuestion ? (
          <Button type="button" onClick={() => document.getElementById(submitButtonId)?.click()}>
            Submit →
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setActive(Math.min(total - 1, active + 1))}>
            Next →
          </Button>
        )}
      </div>
    </div>
  );
}
