"use client";

import { useMemo, useState } from "react";

export interface PortalTableRow {
  id: string;
  label: string;
  href: string;
  meta?: string;
}

/**
 * The Enterprise Portal's own list chrome (PAGE TEMPLATE/Create and Post an
 * Exam — "My Departments", "My Courses", "Select Assessment"): a search bar,
 * a dark sortable column header, and rows with an edit icon. Search and sort
 * are real (client-side, the row set is always small), not decorative —
 * "Items per page"/"Total" mirror the template's own chrome but this app
 * never has enough rows to need real pagination.
 */
export function PortalTable({
  columnLabel,
  searchPlaceholder,
  totalLabel,
  rows,
}: {
  columnLabel: string;
  searchPlaceholder: string;
  totalLabel: string;
  rows: PortalTableRow[];
}) {
  const [query, setQuery] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.label.toLowerCase().includes(q)) : rows;
    return [...list].sort((a, b) => (sortAsc ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label)));
  }, [rows, query, sortAsc]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
        <label className="flex items-center gap-2">
          Items per page:
          <select
            disabled
            defaultValue={50}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value={50}>50</option>
          </select>
        </label>
        <span>
          {totalLabel}: {rows.length}
        </span>
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
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
        </div>

        <button
          type="button"
          onClick={() => setSortAsc((s) => !s)}
          className="flex w-full items-center gap-1.5 bg-slate-600 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-white dark:bg-slate-700"
        >
          {columnLabel}
          <span aria-hidden="true">{sortAsc ? "▲" : "▼"}</span>
        </button>

        {filtered.length === 0 ? (
          <div className="bg-white px-3 py-6 text-center text-sm text-slate-400 dark:bg-slate-900 dark:text-slate-500">
            No results.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 bg-white px-3 py-2.5 text-sm dark:bg-slate-900"
              >
                <a href={row.href} className="font-medium text-brand-primary hover:underline">
                  {row.label}
                </a>
                <div className="flex items-center gap-3">
                  {row.meta && <span className="text-xs text-slate-500 dark:text-slate-400">{row.meta}</span>}
                  <a href={row.href} aria-label={`Edit ${row.label}`} className="text-brand-primary">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a1 1 0 01-.464.263l-3 .75a.5.5 0 01-.606-.606l.75-3a1 1 0 01.263-.464l8.5-8.5z" />
                    </svg>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
