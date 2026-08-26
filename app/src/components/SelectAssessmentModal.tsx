"use client";

import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./ui";

export interface SelectableAssessment {
  id: string;
  title: string;
  courseName: string;
  questionCount: number;
}

/** The reference template's "Select Assessment" floating window (PAGE TEMPLATE/Create and Post an Exam) — posts a Benchmark Assessment into this course as a Linked Assessment. */
export function SelectAssessmentModal({
  assessments,
  duplicateBenchmarkAction,
}: {
  assessments: SelectableAssessment[];
  duplicateBenchmarkAction: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? assessments.filter((a) => a.title.toLowerCase().includes(q)) : assessments;
  }, [assessments, query]);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} disabled={assessments.length === 0}>
        Select Assessment
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Select Assessment">
        <form action={duplicateBenchmarkAction} onSubmit={() => setOpen(false)} className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Items per page: 50</span>
            <span>Total Assessments: {assessments.length}</span>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 flex-none text-slate-400">
                <circle cx="9" cy="9" r="6" />
                <path d="m17 17-4-4" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find Assessment"
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
              />
            </div>
            <div className="bg-slate-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white dark:bg-slate-700">
              Name
            </div>
            {filtered.length === 0 ? (
              <div className="bg-white px-3 py-6 text-center text-sm text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                No published Benchmark Assessments found.
              </div>
            ) : (
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {filtered.map((a, i) => (
                  <li key={a.id} className="bg-white px-3 py-2.5 dark:bg-slate-900">
                    <label className="flex items-start gap-2.5 text-sm">
                      <input type="radio" name="sourceExamId" value={a.id} defaultChecked={i === 0} className="mt-0.5" />
                      <span className="text-slate-900 dark:text-slate-100">
                        {a.title}
                        <span className="text-slate-500 dark:text-slate-400">
                          {" "}
                          · {a.courseName} · {a.questionCount} question(s)
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success" disabled={filtered.length === 0}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
