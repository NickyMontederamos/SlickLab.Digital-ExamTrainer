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
}: {
  questions: QuestionPagerMeta[];
  children: ReactNode[];
  submitButtonId: string;
}) {
  const [active, setActive] = useState(0);
  const [filter, setFilter] = useState<PagerFilter>("all");
  const total = questions.length;
  const isLastQuestion = active === total - 1;

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
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Questions</span>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Filter
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as PagerFilter)}
            className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs transition-colors focus:border-brand-primary focus:outline-none"
          >
            <option value="all">All</option>
            <option value="unanswered">Unanswered</option>
            <option value="flagged">Flagged</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {visible.length === 0 ? (
          <p className="text-xs text-slate-400">No questions match this filter.</p>
        ) : (
          visible.map(({ q, i }) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setActive(i)}
              aria-current={i === active}
              className={
                "relative h-8 w-8 rounded-lg border text-xs font-medium transition-colors " +
                (i === active
                  ? "border-brand-primary bg-brand-primary text-white"
                  : q.answered
                    ? "border-slate-300 bg-slate-100 text-slate-700"
                    : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50")
              }
            >
              {i + 1}
              {q.flagged && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400" aria-label="Flagged" />
              )}
            </button>
          ))
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
          onClick={() => setActive((i) => Math.max(0, i - 1))}
          disabled={active === 0}
        >
          ← Previous
        </Button>
        <span className="text-xs text-slate-500">
          Question {active + 1} of {total}
        </span>
        {isLastQuestion ? (
          <Button type="button" onClick={() => document.getElementById(submitButtonId)?.click()}>
            Submit →
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setActive((i) => Math.min(total - 1, i + 1))}>
            Next →
          </Button>
        )}
      </div>
    </div>
  );
}
