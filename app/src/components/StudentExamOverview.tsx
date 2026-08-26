"use client";

import { useState } from "react";
import { LinkButton } from "@/components/ui";
import type { StudentExamGroup } from "@/lib/student-exam-overview";

export interface StudentExamOverviewItem {
  examId: string;
  examTitle: string;
  courseCode: string;
  courseName: string;
  group: StudentExamGroup;
  attemptId: string | null;
  isFullyGraded: boolean;
  availableFrom: Date | null;
  availableUntil: Date | null;
  submittedAt: Date | null;
}

const GROUP_ORDER: StudentExamGroup[] = ["DOWNLOADED", "READY_FOR_DOWNLOAD", "UPCOMING", "COMPLETED", "EXPIRED"];
const GROUP_LABELS: Record<StudentExamGroup, string> = {
  DOWNLOADED: "Downloaded",
  READY_FOR_DOWNLOAD: "Ready For Download",
  UPCOMING: "Upcoming",
  COMPLETED: "Completed",
  EXPIRED: "Expired",
};

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" }).format(d);
}

function subtitleFor(item: StudentExamOverviewItem): string {
  switch (item.group) {
    case "DOWNLOADED":
      return "Exam In Progress";
    case "READY_FOR_DOWNLOAD":
      return "Ready For Download";
    case "UPCOMING":
      return item.availableFrom ? `Download available on: ${formatDateTime(item.availableFrom)}` : "Not yet available";
    case "COMPLETED":
      return item.submittedAt ? `Completed: ${formatDateTime(item.submittedAt)}` : "Exam uploaded";
    case "EXPIRED":
      return item.availableUntil ? `Expired on: ${formatDateTime(item.availableUntil)}` : "Expired";
  }
}

/**
 * The ExamSoft Portal's "My Exams" screen (PAGE TEMPLATE/Student Overview_Exam/
 * StudentOverview_Dashboard.jpg) — every exam across every enrolled course in
 * one flat list grouped by real status, with a detail panel on the right for
 * whichever one is selected. Replaces the student dashboard's old flat
 * course list. The status groups and their labels are literal (Downloaded /
 * Ready For Download / Upcoming / Completed / Expired), matching the
 * reference — this web app doesn't literally download a file to disk any
 * more than ExamDownloadGate's own ceremony does, but the same honest-
 * ceremony precedent applies: the label describes the equivalent real state
 * (an unlocked, in-progress attempt), not a fabricated download.
 */
export function StudentExamOverview({ items }: { items: StudentExamOverviewItem[] }) {
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);

  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.examId ?? null);
  const selected = items.find((i) => i.examId === selectedId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-6 md:flex-row">
      <aside className="flex w-full flex-col gap-1 md:w-72 md:flex-none">
        <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">My Exams</h2>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Don&apos;t see your exam here? Contact your instructor.
        </p>
        {grouped.map(({ group, items: groupItems }) => (
          <div key={group} className="flex flex-col">
            <div className="border-b border-slate-200 bg-slate-100 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              {GROUP_LABELS[group]}
            </div>
            {groupItems.map((item) => (
              <button
                key={item.examId}
                type="button"
                onClick={() => setSelectedId(item.examId)}
                className={
                  "flex flex-col items-start gap-0.5 border-b border-slate-100 px-2 py-2.5 text-left transition-colors dark:border-slate-800 " +
                  (item.examId === selectedId
                    ? "bg-brand-primary/10"
                    : "hover:bg-slate-50 dark:hover:bg-slate-900")
                }
              >
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.examTitle}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{subtitleFor(item)}</span>
              </button>
            ))}
          </div>
        ))}
      </aside>

      <div className="flex-1">
        {!selected ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Select an exam to see its details.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selected.examTitle}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {selected.courseCode} — {selected.courseName}
            </p>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              {selected.group === "COMPLETED" &&
                (selected.isFullyGraded
                  ? "You have completed this exam and it has been fully graded."
                  : "You have completed this exam and successfully uploaded it. Some answers are still pending manual grading.")}
              {selected.group === "DOWNLOADED" && "You have an exam in progress. Resume where you left off."}
              {selected.group === "READY_FOR_DOWNLOAD" && "This exam is ready — book it to begin."}
              {selected.group === "UPCOMING" &&
                (selected.availableFrom
                  ? `This exam becomes available on ${formatDateTime(selected.availableFrom)}.`
                  : "This exam is not yet available.")}
              {selected.group === "EXPIRED" && "This exam's availability window has closed."}
            </p>
            <div className="mt-3">
              {selected.group === "DOWNLOADED" && selected.attemptId && (
                <LinkButton href={`/attempts/${selected.attemptId}`}>Continue Exam</LinkButton>
              )}
              {selected.group === "READY_FOR_DOWNLOAD" && (
                <LinkButton href={`/exams/${selected.examId}`}>Open Exam</LinkButton>
              )}
              {selected.group === "COMPLETED" && selected.attemptId && (
                <LinkButton href={`/attempts/${selected.attemptId}/result`} variant="secondary">
                  View Result
                </LinkButton>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
