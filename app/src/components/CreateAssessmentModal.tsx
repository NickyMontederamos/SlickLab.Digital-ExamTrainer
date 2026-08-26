"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Button, inputClassName, labelClassName } from "./ui";

/** The reference template's "Create Assessment" floating window (PAGE TEMPLATE/Create and Post an Exam). */
export function CreateAssessmentModal({
  isBenchmarkBank,
  createExamAction,
}: {
  isBenchmarkBank: boolean;
  createExamAction: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="success" onClick={() => setOpen(true)}>
        Create Assessment
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create Assessment">
        <form action={createExamAction} onSubmit={() => setOpen(false)} className="flex flex-col gap-4">
          {isBenchmarkBank && (
            <fieldset className="flex flex-col gap-2.5">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Assessment Type
              </legend>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="radio" name="kind" value="STANDARD" defaultChecked className="mt-0.5" />
                <span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">Question bank</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Auto- or manually-graded, using Multiple Choice, Multiple Response, True/False, Short Answer, and
                    Essay questions.
                  </p>
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="radio" name="kind" value="BENCHMARK" className="mt-0.5" />
                <span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">Benchmark Assessment</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Create and post a reusable Benchmark Assessment, with combined reporting across every course
                    it&apos;s posted to.
                  </p>
                </span>
              </label>
            </fieldset>
          )}
          <label className={labelClassName}>
            Title
            <input name="title" required className={inputClassName} />
          </label>
          <label className={labelClassName}>
            Time limit (minutes)
            <input name="timeLimitMinutes" type="number" defaultValue={60} className={inputClassName} />
          </label>
          <label className={labelClassName}>
            Available from (optional)
            <input name="availableFrom" type="datetime-local" className={inputClassName} />
          </label>
          <label className={labelClassName}>
            Available until (optional)
            <input name="availableUntil" type="datetime-local" className={inputClassName} />
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success">
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
