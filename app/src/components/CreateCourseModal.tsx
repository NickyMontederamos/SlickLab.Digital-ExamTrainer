"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Alert, Button, inputClassName, labelClassName } from "./ui";

export function CreateCourseModal({
  createCourseAction,
  error,
}: {
  createCourseAction: (formData: FormData) => Promise<void>;
  error?: string;
}) {
  const [open, setOpen] = useState(Boolean(error));

  return (
    <>
      <Button type="button" variant="success" onClick={() => setOpen(true)}>
        Create A Course
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create A Course">
        <form action={createCourseAction} className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <label className={labelClassName}>
            Code
            <input name="code" required placeholder="LAW101" className={inputClassName} />
          </label>
          <label className={labelClassName}>
            Name
            <input name="name" required className={inputClassName} />
          </label>
          <label className={labelClassName}>
            Academic year
            <input name="academicYear" required placeholder="2026-2027" className={inputClassName} />
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
