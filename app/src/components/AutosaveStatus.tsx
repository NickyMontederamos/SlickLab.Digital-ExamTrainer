"use client";

import { useEffect, useRef, useState } from "react";

const AUTOSAVE_INTERVAL_MS = 60_000;

/**
 * Silently resubmits the answers form on a fixed cadence and shows how long
 * ago that last happened. Mirrors the real app this trainer practices for —
 * Examplify autosaves to encrypted local backups roughly every 60 seconds
 * during a sitting (see docs/EXAMPLIFY_ARCHITECTURE_REFERENCE.md) — but
 * this is still a browser tab, not that offline client: the save only
 * reaches the server if the connection is up, same limits as the existing
 * "Save Progress" button this reuses (form.requestSubmit() invokes the same
 * saveProgressAction as clicking it).
 */
export function AutosaveStatus({ formId }: { formId: string }) {
  const [secondsAgo, setSecondsAgo] = useState(0);
  // Set inside the effect below, not here — Date.now() is impure and this
  // component body must stay a pure render function.
  const lastSavedRef = useRef<number | null>(null);

  useEffect(() => {
    lastSavedRef.current = Date.now();

    const displayTimer = window.setInterval(() => {
      setSecondsAgo(Math.round((Date.now() - (lastSavedRef.current ?? Date.now())) / 1000));
    }, 1000);

    const saveTimer = window.setInterval(() => {
      const form = document.getElementById(formId);
      if (form instanceof HTMLFormElement) {
        form.requestSubmit();
      }
      lastSavedRef.current = Date.now();
      setSecondsAgo(0);
    }, AUTOSAVE_INTERVAL_MS);

    return () => {
      window.clearInterval(displayTimer);
      window.clearInterval(saveTimer);
    };
  }, [formId]);

  return (
    <p className="inline-flex w-fit items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 tabular-nums" aria-live="polite">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
      Autosaves every 60s · last saved {secondsAgo === 0 ? "just now" : `${secondsAgo}s ago`}
    </p>
  );
}
