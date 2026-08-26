"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Alert, Button, inputClassName, labelClassName } from "./ui";

export function CreateDepartmentModal({
  createDepartmentAction,
  error,
}: {
  createDepartmentAction: (formData: FormData) => Promise<void>;
  error?: string;
}) {
  const [open, setOpen] = useState(Boolean(error));

  return (
    <>
      <Button type="button" variant="success" onClick={() => setOpen(true)}>
        Create Department
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create Department">
        <form action={createDepartmentAction} className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <label className={labelClassName}>
            Name
            <input name="name" required placeholder="College of Law" className={inputClassName} />
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
