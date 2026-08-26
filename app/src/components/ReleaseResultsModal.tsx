"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Button, inputClassName, labelClassName } from "./ui";

export interface ReleasableStudent {
  attemptId: string;
  studentName: string;
  released: boolean;
}

/**
 * Matches the reference's "Release Results" flow — Report Sections /
 * Schedule / Students. "Release Now" is real (releaseResultsAction stamps
 * Submission.resultsReleasedAt). The Future Date field is stored-but-inert
 * — no background job scheduler exists in this project to act on it later,
 * same honesty precedent as ExamDownloadGate's remoteDeletionAt.
 */
export function ReleaseResultsModal({
  students,
  releaseResultsAction,
}: {
  students: ReleasableStudent[];
  releaseResultsAction: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} disabled={students.length === 0}>
        Release Results
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Release Results">
        <form action={releaseResultsAction} className="flex flex-col gap-4">
          <div>
            <label className={labelClassName}>Future Date (optional, not yet actioned)</label>
            <input
              type="datetime-local"
              disabled
              placeholder="ex: 12/10/2017 10:00 am"
              className={`${inputClassName} max-w-xs opacity-60`}
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Scheduling a future release isn&apos;t implemented — this app has no background job scheduler. Use
              Release Now instead.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className={labelClassName}>Students</label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
              {students.map((s) => (
                <label
                  key={s.attemptId}
                  className="flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2 text-sm last:border-b-0 dark:border-slate-800 dark:bg-slate-900"
                >
                  <span className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                    <input type="checkbox" name="attemptIds" value={s.attemptId} defaultChecked={!s.released} />
                    {s.studentName}
                  </span>
                  {s.released && <span className="text-xs text-emerald-600 dark:text-emerald-400">Already released</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success">
              Release Now
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
