"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Alert, Button, inputClassName, labelClassName } from "./ui";

export interface DuplicateTargetCourse {
  id: string;
  label: string;
}

/**
 * Matches the reference template's "DUPLICATE {title}" floating window
 * (PAGE TEMPLATE/Create and Post an Exam — "radio button to select Linked
 * Assessment"), sourced from ExamSoft's own "Enterprise Portal: Duplicate
 * an Assessment (Linked and Unlinked)" article. Triggered from the
 * BENCHMARK exam's own page (the "Select the assessment... select More,
 * then Duplicate" step), not from the target course — that's the real
 * product's actual direction, and this replaces an earlier build that had
 * it backwards.
 *
 * Only "Linked Assessment" is offered — this app has no "Unlinked
 * Assessment" (a plain copy with no combined reporting) concept, so there
 * is nothing honest to offer for that option.
 */
export function DuplicateAssessmentModal({
  examTitle,
  targetCourses,
  duplicateAction,
  error,
}: {
  examTitle: string;
  targetCourses: DuplicateTargetCourse[];
  duplicateAction: (formData: FormData) => Promise<void>;
  error?: string;
}) {
  const [open, setOpen] = useState(Boolean(error));

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} disabled={targetCourses.length === 0}>
        Duplicate
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Duplicate ${examTitle}`}>
        <form action={duplicateAction} className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}

          <div className="rounded-lg border-2 border-brand-primary p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
              <input type="radio" name="mode" value="linked" defaultChecked readOnly />
              Linked Assessment
            </label>
            <ul className="mt-2 flex flex-col gap-1 pl-6 text-xs text-slate-500 dark:text-slate-400">
              <li>Combined reports available.</li>
              <li>Assessments may only be linked within a Course, or posted to any live course.</li>
              <li>Combined reports available to users with access to each instance of a Linked Assessment.</li>
              <li>Cannot edit assessment options on existing or new assessment.</li>
              <li>Cannot add or remove questions on existing or new assessment.</li>
            </ul>
          </div>

          <label className={labelClassName}>
            Assign to Course
            {targetCourses.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No live courses available — create one first.
              </p>
            ) : (
              <select name="targetCourseId" required className={inputClassName}>
                {targetCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </label>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success" disabled={targetCourses.length === 0}>
              Continue
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
