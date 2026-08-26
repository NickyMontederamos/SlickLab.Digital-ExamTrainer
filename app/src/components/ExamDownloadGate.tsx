"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, inputClassName, labelClassName } from "@/components/ui";

type Stage = "loading" | "system-check" | "not-downloaded" | "downloading" | "downloaded" | "unlocked";

const DOWNLOAD_MS = 1500;

const REQUIRED_WIDTH = 1280;
const REQUIRED_HEIGHT = 720;
const REQUIRED_RAM_GB = 4;

interface RequirementRow {
  label: string;
  required: string;
  available: string;
  met: boolean;
}

/**
 * Mirrors Examplify's own "Minimum System Requirements" screen — shown only
 * when there's an actual issue, same as the real product (it runs silently
 * on every launch otherwise). Screen resolution is the one row that's
 * genuinely measured AND genuinely gates: `window.screen` is real. RAM uses
 * `navigator.deviceMemory` where the browser reports it (Chromium only) —
 * real when present, and only counted against the student when it is,
 * never guessed. Hard Drive Space and Operating System version aren't
 * obtainable from a browser at all, so they're labeled as such rather than
 * filled with a fabricated number — they're shown for reference only and
 * never fail the check.
 */
function checkSystemRequirements(): { rows: RequirementRow[]; allMet: boolean } {
  const width = window.screen.width;
  const height = window.screen.height;
  const resolutionMet = width >= REQUIRED_WIDTH && height >= REQUIRED_HEIGHT;

  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const ramMet = deviceMemory === undefined || deviceMemory >= REQUIRED_RAM_GB;

  const ua = navigator.userAgent;
  const osName = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : /Android|iPhone|iPad/.test(ua) ? "Mobile OS" : "Unknown";

  const rows: RequirementRow[] = [
    { label: "Hard Drive Space", required: `${REQUIRED_RAM_GB} GB`, available: "Not measurable in a browser", met: true },
    {
      label: "RAM",
      required: `${REQUIRED_RAM_GB} GB`,
      available: deviceMemory !== undefined ? `${deviceMemory} GB` : "Not reported by this browser",
      met: ramMet,
    },
    { label: "Operating System", required: "—", available: osName, met: true },
    { label: "Screen Resolution", required: `${REQUIRED_WIDTH} x ${REQUIRED_HEIGHT}`, available: `${width} x ${height}`, met: resolutionMet },
  ];

  return { rows, allMet: rows.every((r) => r.met) };
}

/**
 * Mimics Examplify's own pre-exam ceremony (docs/EXAMPLIFY_ARCHITECTURE_REFERENCE.md,
 * stage 2 — download the encrypted package, then unlock it with a password
 * on exam day) as a step BEFORE the existing ExamEntryGate, not a
 * replacement for it. Booking and proctor approval still happen in
 * ExamEntryGate (passed as `children`) exactly as before — this component
 * only adds the download/password ceremony in front of it.
 *
 * The "download" itself is still a fake progress bar — there's no real
 * exam package to transfer. But the password IS real once a faculty
 * member sets one via Post Assessment Settings: submitPassword calls
 * validateDownloadAction (a server action backed by
 * validateAndRecordDownload in attempts.ts), which checks it against
 * ExamVersion.assessmentPassword, the download window, and the download
 * count cap server-side. An exam with no password set (every exam created
 * before this phase) keeps the original "any non-empty value unlocks"
 * behavior for backward compatibility. Real gating (booking window,
 * proctor approval) is unchanged and still enforced by the code this wraps.
 *
 * Progress persists to localStorage per attempt so a refresh doesn't force
 * the student to redo the ceremony, matching Examplify remembering a
 * downloaded exam across launches. remoteDeletionAt is checked here too —
 * client-side, on render, since no background job scheduler exists in this
 * project to push a real remote deletion.
 *
 * A "system-check" stage runs first (see checkSystemRequirements above),
 * matching Examplify: a Minimum System Requirements screen that only
 * appears when there's an actual issue. The settings screen after password
 * entry (the "downloaded" stage below) is wired to real ExamVersion fields
 * wherever this app actually has one — timer, backward-navigation,
 * calculator/spell-check/copy-paste/highlighting flags, ExamID/ExamMonitor,
 * instructor name, and Sections — rather than the hardcoded placeholder
 * values this component used before.
 */
export function ExamDownloadGate({
  attemptId,
  examId,
  examTitle,
  timeLimitMinutes,
  questionCount,
  totalPoints,
  downloadStartAt,
  downloadEndAt,
  maxDownloads,
  downloadCount,
  remoteDeletionAt,
  validateDownloadAction,
  instructorName,
  allowBacktracking,
  calculatorAllowed,
  spellCheckAllowed,
  copyPasteAllowed,
  highlightingAllowed,
  examMonitoringEnabled,
  sections,
  children,
}: {
  attemptId: string;
  examId: string;
  examTitle: string;
  timeLimitMinutes: number;
  questionCount: number;
  totalPoints: number;
  downloadStartAt?: number | null;
  downloadEndAt?: number | null;
  maxDownloads?: number | null;
  downloadCount: number;
  remoteDeletionAt?: number | null;
  validateDownloadAction: (password: string) => Promise<{ ok: boolean; error?: string }>;
  instructorName: string | null;
  allowBacktracking: boolean;
  calculatorAllowed: boolean;
  spellCheckAllowed: boolean;
  copyPasteAllowed: boolean;
  highlightingAllowed: boolean;
  examMonitoringEnabled: boolean;
  sections: string[];
  children: ReactNode;
}) {
  const router = useRouter();
  const storageKey = `examDownload:${attemptId}`;
  const [stage, setStage] = useState<Stage>("loading");
  const [requirementRows, setRequirementRows] = useState<RequirementRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const now = Date.now();
  const windowNotOpenYet = Boolean(downloadStartAt && now < downloadStartAt);
  const windowClosed = Boolean(downloadEndAt && now > downloadEndAt);
  const limitReached = Boolean(maxDownloads != null && downloadCount >= maxDownloads);
  const downloadBlocked = windowNotOpenYet || windowClosed || limitReached;

  function resumeAfterSystemCheck() {
    if (remoteDeletionAt && Date.now() > remoteDeletionAt) {
      window.localStorage.removeItem(storageKey);
      setStage("not-downloaded");
      return;
    }
    const saved = window.localStorage.getItem(storageKey);
    setStage(saved === "unlocked" ? "unlocked" : saved === "downloaded" ? "downloaded" : "not-downloaded");
  }

  // Avoids a hydration mismatch the same way ExamCountdown/ThemeToggle do —
  // window.screen/localStorage only exist client-side, so the real stage is
  // unknown until mount.
  useEffect(() => {
    const { rows, allMet } = checkSystemRequirements();
    if (!allMet) {
      setRequirementRows(rows);
      setStage("system-check");
      return;
    }
    resumeAfterSystemCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, remoteDeletionAt]);

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

  async function submitPassword() {
    if (!password.trim()) {
      setError("Enter the exam password to continue.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await validateDownloadAction(password);
      if (!result.ok) {
        setError(result.error ?? "That password wasn't right — try again.");
        return;
      }
      window.localStorage.setItem(storageKey, "unlocked");
      setStage("unlocked");
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "loading") return null;
  if (stage === "unlocked") return <>{children}</>;

  if (stage === "system-check") {
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.72-1.36 3.486 0l6.28 11.18c.75 1.334-.213 2.98-1.743 2.98H3.72c-1.53 0-2.493-1.646-1.743-2.98l6.28-11.18zM11 14a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.75a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z" clipRule="evenodd" />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Minimum System Requirements Not Met</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Your device does not meet the Minimum System Requirements for this assessment. Please correct the
              following items.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Required</th>
                <th className="px-3 py-2 font-medium">Available</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {requirementRows.map((row) => (
                <tr key={row.label} className={row.met ? "" : "bg-red-50 dark:bg-red-950/40"}>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.label}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-500 dark:text-slate-400">{row.required}</td>
                  <td className={`px-3 py-2 tabular-nums ${row.met ? "text-slate-700 dark:text-slate-300" : "font-medium text-red-700 dark:text-red-400"}`}>
                    {row.available}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <Button type="button" onClick={() => router.push("/dashboard")}>
            Return to Dashboard
          </Button>
          <Button type="button" variant="secondary" onClick={resumeAfterSystemCheck}>
            Continue
          </Button>
        </div>
      </Card>
    );
  }

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
        {downloadBlocked ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {windowNotOpenYet && "Downloads for this exam aren't open yet."}
            {windowClosed && "The download window for this exam has closed."}
            {limitReached && "This attempt has reached its maximum number of downloads."}
          </p>
        ) : (
          <Button type="button" onClick={() => setStage("downloading")} className="self-start">
            Download Exam
          </Button>
        )}
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
          <Button type="button" onClick={submitPassword} disabled={submitting}>
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
        <SettingTile icon={<LockIcon />} label="Non-Secure" hint="Browser-based, not OS-locked — this trainer never locks down a device" />
        <SettingTile icon={<ClockIcon />} label={formatDuration(timeLimitMinutes)} />
        <SettingTile icon={<WifiIcon />} label="WiFi On" hint="An internet connection is required throughout" />
        <SettingTile
          icon={<NavigateIcon />}
          label={allowBacktracking ? "Navigate" : "Forward Only"}
          hint={allowBacktracking ? "Free movement between questions" : "Backward navigation is disabled for this exam"}
        />
        {examMonitoringEnabled && (
          <>
            <SettingTile icon={<CameraIcon />} label="ExamID" hint="Identity verification before you begin" />
            <SettingTile icon={<CameraIcon />} label="ExamMonitor" hint="Device and room checks before you begin" />
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <DetailList
          title="Exam Details"
          rows={[
            ["Instructor", instructorName ?? "Staff"],
            ["Posting ID #", examId.slice(-6).toUpperCase()],
          ]}
        />
        <DetailList
          title="Exam Tools"
          rows={[
            ["Spell Check", spellCheckAllowed ? "ON" : "OFF"],
            ["Copy & Paste", copyPasteAllowed ? "ON" : "OFF"],
            ["Calculators", calculatorAllowed ? "ON" : "OFF"],
            ["Highlighting", highlightingAllowed ? "ON" : "OFF"],
          ]}
        />
        {sections.length > 0 ? (
          <DetailList title="Sections" rows={sections.map((s, i) => [`${i + 1}`, s])} />
        ) : (
          <DetailList title="Overview" rows={[["Questions", String(questionCount)], ["Total points", String(totalPoints)]]} />
        )}
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

function CameraIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <rect x="2.5" y="6" width="15" height="10" rx="2" />
      <circle cx="10" cy="11" r="3" />
      <path d="M7 6l1-2h4l1 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
