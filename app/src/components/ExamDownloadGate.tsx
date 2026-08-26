"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button, Card, inputClassName, labelClassName } from "@/components/ui";

type Stage = "loading" | "not-downloaded" | "downloading" | "downloaded" | "unlocked";

const DOWNLOAD_MS = 1500;

/**
 * Mimics Examplify's own pre-exam ceremony (docs/EXAMPLIFY_ARCHITECTURE_REFERENCE.md,
 * stage 2 — download the encrypted package, then unlock it with a password
 * on exam day) as a step BEFORE the existing ExamEntryGate, not a
 * replacement for it. Booking and proctor approval still happen in
 * ExamEntryGate (passed as `children`) exactly as before — this component
 * only adds the download/password ceremony in front of it.
 *
 * There is no real exam package or password here — "download" is a fake
 * progress bar and any non-empty password unlocks it. This is deliberate:
 * the trainer is teaching the INTERACTION PATTERN (download, then wait,
 * then unlock with a password, then see your exam's settings before it
 * starts), not re-implementing encrypted package delivery. Real gating
 * (booking window, proctor approval) is unchanged and still enforced by
 * the code this wraps.
 *
 * Progress persists to localStorage per attempt so a refresh doesn't force
 * the student to redo the ceremony, matching Examplify remembering a
 * downloaded exam across launches.
 */
export function ExamDownloadGate({
  attemptId,
  examTitle,
  timeLimitMinutes,
  questionCount,
  totalPoints,
  children,
}: {
  attemptId: string;
  examTitle: string;
  timeLimitMinutes: number;
  questionCount: number;
  totalPoints: number;
  children: ReactNode;
}) {
  const storageKey = `examDownload:${attemptId}`;
  const [stage, setStage] = useState<Stage>("loading");
  const [progress, setProgress] = useState(0);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Avoids a hydration mismatch the same way ExamCountdown/ThemeToggle do —
  // localStorage only exists client-side, so the real stage is unknown
  // until mount.
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    setStage(saved === "unlocked" ? "unlocked" : saved === "downloaded" ? "downloaded" : "not-downloaded");
  }, [storageKey]);

  useEffect(() => {
    if (stage !== "downloading") return;
    const start = Date.now();
    const id = window.setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - start) / DOWNLOAD_MS) * 100));
      setProgress(pct);
      if (pct >= 100) {
        window.clearInterval(id);
        window.localStorage.setItem(storageKey, "downloaded");
        setStage("downloaded");
      }
    }, 80);
    return () => window.clearInterval(id);
  }, [stage, storageKey]);

  function removeDownload() {
    window.localStorage.removeItem(storageKey);
    setProgress(0);
    setPassword("");
    setError(null);
    setStage("not-downloaded");
  }

  function submitPassword() {
    if (!password.trim()) {
      setError("Enter the exam password to continue.");
      return;
    }
    window.localStorage.setItem(storageKey, "unlocked");
    setStage("unlocked");
  }

  if (stage === "loading") return null;
  if (stage === "unlocked") return <>{children}</>;

  if (stage === "not-downloaded") {
    return (
      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">{examTitle}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Download this exam file to prepare for your exam. Only download exams to the computer you will use to
            take the exam.
          </p>
        </div>
        <Button type="button" onClick={() => setStage("downloading")} className="self-start">
          Download Exam
        </Button>
      </Card>
    );
  }

  if (stage === "downloading") {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{examTitle}</h2>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
            <span>Downloading</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <Button type="button" variant="secondary" className="self-start" onClick={removeDownload}>
          Cancel Download
        </Button>
      </Card>
    );
  }

  // stage === "downloaded"
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">{examTitle}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Please enter the exam password to start this exam.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className={labelClassName}>
            Exam Password
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && submitPassword()}
              placeholder="Enter Exam Password"
              className={inputClassName}
            />
          </label>
          <Button type="button" onClick={submitPassword}>
            Enter
          </Button>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          onClick={removeDownload}
          className="w-fit text-xs font-medium text-brand-primary hover:underline"
        >
          Remove Exam Download
        </button>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SettingTile icon={<LockIcon />} label="Non-Secure" hint="Browser-based, not OS-locked" />
        <SettingTile icon={<ClockIcon />} label={formatDuration(timeLimitMinutes)} />
        <SettingTile icon={<WifiIcon />} label="WiFi On" />
        <SettingTile icon={<NavigateIcon />} label="Navigate" hint="Free movement between questions" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <DetailList title="Exam Details" rows={[["Instructor", "–"], ["Posting ID #", attemptId.slice(-6).toUpperCase()]]} />
        <DetailList
          title="Exam Tools"
          rows={[
            ["Spell Check", "ON"],
            ["Copy & Paste", "ON"],
            ["Calculators", "ON"],
            ["Highlighting", "OFF"],
            ["% Time", "100"],
          ]}
        />
        <DetailList title="Overview" rows={[["Questions", String(questionCount)], ["Total points", String(totalPoints)]]} />
      </div>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

function SettingTile({ icon, label, hint }: { icon: ReactNode; label: string; hint?: string }) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center dark:border-slate-800 dark:bg-slate-900"
      title={hint}
    >
      <span className="text-slate-500 dark:text-slate-400">{icon}</span>
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
    </div>
  );
}

function DetailList({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <dl className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-3 py-2">
            <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
            <dd className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <rect x="4" y="9" width="12" height="8" rx="1.5" />
      <path d="M6.5 9V6.5a3.5 3.5 0 117 0V9" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <path d="M3 8a10 10 0 0114 0M5.5 10.8a6.5 6.5 0 019 0M8 13.5a3 3 0 014 0" strokeLinecap="round" />
      <circle cx="10" cy="16" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NavigateIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <path d="M3 10h14M9 5l-5 5 5 5M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
