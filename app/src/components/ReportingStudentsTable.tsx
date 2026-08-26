"use client";

import { useMemo, useState } from "react";

export interface ReportingStudentTableRow {
  attemptId: string;
  studentName: string;
  percentCorrect: number | null;
  totalPoints: number;
  maxPoints: number;
  isGraded: boolean;
  released: boolean;
}

/** Matches the reference's Reporting "Students" (S&O) list: search + Exam Taker/% Correct/Total Points columns + an eye icon into the individual report. */
export function ReportingStudentsTable({ rows, examId }: { rows: ReportingStudentTableRow[]; examId: string }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.studentName.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{rows.length} student{rows.length === 1 ? "" : "s"}</span>
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
            placeholder="Search"
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
        </div>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 bg-slate-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white dark:bg-slate-700">
          <span>Exam Taker</span>
          <span className="w-20 text-right">% Correct</span>
          <span className="w-24 text-right">Total Points</span>
          <span className="w-6" />
        </div>
        {filtered.length === 0 ? (
          <div className="bg-white px-3 py-6 text-center text-sm text-slate-400 dark:bg-slate-900 dark:text-slate-500">
            No results.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((row) => (
              <li
                key={row.attemptId}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 bg-white px-3 py-2.5 text-sm dark:bg-slate-900"
              >
                <span className="text-slate-900 dark:text-slate-100">
                  {row.studentName}
                  {row.released && <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">Released</span>}
                </span>
                <span className="w-20 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {row.percentCorrect !== null ? `${row.percentCorrect.toFixed(2)}%` : "—"}
                </span>
                <span className="w-24 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {row.totalPoints} / {row.maxPoints}
                </span>
                {row.isGraded ? (
                  <a
                    href={`/exams/${examId}/reporting/${row.attemptId}`}
                    aria-label={`View ${row.studentName}'s report`}
                    className="w-6 text-brand-primary"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M10 3.5c-4.5 0-7.7 3.3-8.9 6.1a1 1 0 000 .8C2.3 13.2 5.5 16.5 10 16.5s7.7-3.3 8.9-6.1a1 1 0 000-.8C17.7 6.8 14.5 3.5 10 3.5zM10 14a4 4 0 110-8 4 4 0 010 8z" />
                    </svg>
                  </a>
                ) : (
                  <span className="w-6" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
