"use client";

import { useState } from "react";
import { inputClassName, labelClassName } from "./ui";

function randomPassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** Matches the reference template's "Assessment Password" + green "Regenerate" button (PAGE TEMPLATE/Create and Post an Exam — "Manage your postings"). */
export function AssessmentPasswordField({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="flex flex-col gap-2">
      <label className={labelClassName}>Assessment Password (optional — any non-empty value unlocks if left blank)</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="assessmentPassword"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Leave blank to accept any password"
          className={`${inputClassName} max-w-xs`}
        />
        <button
          type="button"
          onClick={() => setValue(randomPassword())}
          className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-800 hover:shadow-md"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}

/** Matches the reference's "Hide/Show Universal Resume Code" toggle. */
export function UniversalResumeCodeField({ initialValue }: { initialValue: string }) {
  const [visible, setVisible] = useState(true);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="w-fit text-sm font-medium text-brand-primary hover:underline"
      >
        {visible ? "Hide" : "Show"} Universal Resume Code
      </button>
      <input
        name="universalResumeCode"
        defaultValue={initialValue}
        type={visible ? "text" : "password"}
        placeholder="Optional — lets a student self-resume a paused attempt"
        className={`${inputClassName} max-w-xs`}
      />
    </div>
  );
}
