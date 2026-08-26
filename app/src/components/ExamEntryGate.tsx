"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card } from "@/components/ui";
import { DeviceAndIdentityCheck } from "@/components/DeviceAndIdentityCheck";

type GateStep = "receipt" | "rules" | "device" | "proctor" | "starting";

const STEP_LABELS: Record<Extract<GateStep, "proctor" | "starting">, string> = {
  proctor: "Waiting for proctor approval…",
  starting: "Starting your exam…",
};

/**
 * How often the "proctor" step re-checks whether it's been approved (see
 * checkProctorApprovalAction). A few seconds of lag is an accepted
 * trade-off — this app has no WebSocket/SSE infrastructure anywhere else
 * (docs/NEXT_PHASE_PLAN.md), so short-interval polling is the
 * pattern-consistent choice, not a real-time push.
 */
const PROCTOR_POLL_INTERVAL_MS = 5000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Races a promise against a timeout. Needed specifically for
 * requestFullscreen(): some browsers/automation contexts neither resolve nor
 * reject it, they just leave it pending forever — a plain try/catch doesn't
 * protect against that, and this is a "soft" check that must never block the
 * exam from starting (see ERROR-005 in docs/ERROR_LOG.md).
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, wait(ms).then(() => undefined)]);
}

/**
 * Everything after "Confirm Booking" and before the exam actually starts: a
 * receipt, the Exam Rules agreement, then the device-check/proctor sequence
 * (docs/PITCH_ROADMAP.md). Fullscreen is a real soft check here — exiting/
 * denying it never blocks the exam, it just becomes the first thing the
 * in-exam integrity monitor can flag once questions start.
 *
 * The proctor step is real as of Milestone 5: it signals the student's
 * attempt is ready (requestProctorApprovalAction) and polls
 * (checkProctorApprovalAction) until an actual proctor approves it on their
 * dashboard — no fallback if no proctor is available yet, by deliberate
 * choice (see docs/NEXT_PHASE_PLAN.md); this can wait indefinitely.
 *
 * `examMonitoringEnabled` (ExamVersion field, faculty-set) is Examplify's
 * real ExamID + ExamMonitor distinction — some exams require them, some
 * don't. When true, the "device" step renders DeviceAndIdentityCheck, which
 * is genuinely real (real getUserMedia permission, real live preview, real
 * mic level, real photo capture — see that component's docstring for what's
 * deliberately not persisted). When false, that step is skipped entirely
 * and the sequence goes straight from Exam Rules to the proctor wait; the
 * human-proctor gate itself is a separate, always-on feature in this app
 * and isn't tied to ExamMonitor.
 *
 * NOTE for later hardening: the booked window doesn't currently gate when
 * "Start Exam" can be clicked — it's available immediately after booking,
 * by deliberate choice while the app is still being tested/developed. A
 * real deployment should disable Start Exam until the booked window opens.
 * See docs/PITCH_ROADMAP.md's booking-flow section.
 */
export function ExamEntryGate({
  attemptId,
  examTitle,
  windowLabel,
  scheduledForLabel,
  confirmationCode,
  examMonitoringEnabled,
  beginAttemptAction,
  requestProctorApprovalAction,
  checkProctorApprovalAction,
}: {
  attemptId: string;
  examTitle: string;
  windowLabel: string | null;
  scheduledForLabel: string | null;
  confirmationCode: string;
  examMonitoringEnabled: boolean;
  beginAttemptAction: (attemptId: string) => Promise<void>;
  requestProctorApprovalAction: (attemptId: string) => Promise<void>;
  checkProctorApprovalAction: (attemptId: string) => Promise<boolean>;
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState<GateStep>("receipt");
  const [error, setError] = useState<string | null>(null);

  async function runGateSequence() {
    try {
      const request = document.documentElement.requestFullscreen?.();
      if (request) {
        await withTimeout(request, 1500);
      }
    } catch {
      // Soft check — proceed regardless. See this file's top comment.
    }

    if (examMonitoringEnabled) {
      setStep("device");
      return;
    }

    await proceedToProctorAndStart();
  }

  async function proceedToProctorAndStart() {
    setStep("proctor");
    try {
      await requestProctorApprovalAction(attemptId);
      let approved = await checkProctorApprovalAction(attemptId);
      while (!approved) {
        await wait(PROCTOR_POLL_INTERVAL_MS);
        approved = await checkProctorApprovalAction(attemptId);
      }
    } catch {
      setError("Couldn't reach a proctor. Please try again.");
      setStep("rules");
      return;
    }

    setStep("starting");
    try {
      await beginAttemptAction(attemptId);
      router.push(`/attempts/${attemptId}`);
    } catch {
      setError("Couldn't start the exam. Please try again.");
      setStep("rules");
    }
  }

  if (step === "receipt") {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Booking Confirmed</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Confirmation code</dt>
          <dd className="font-mono text-slate-900 dark:text-slate-100">{confirmationCode}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Exam</dt>
          <dd className="text-slate-900 dark:text-slate-100">{examTitle}</dd>
          {scheduledForLabel ? (
            <>
              <dt className="text-slate-500 dark:text-slate-400">Your scheduled time</dt>
              <dd className="text-slate-900 dark:text-slate-100">{scheduledForLabel}</dd>
            </>
          ) : (
            <>
              <dt className="text-slate-500 dark:text-slate-400">Available window</dt>
              <dd className="text-slate-900 dark:text-slate-100">{windowLabel ?? "No fixed window — start anytime"}</dd>
            </>
          )}
        </dl>
        <Button type="button" onClick={() => setStep("rules")} className="self-start">
          Continue to Exam Rules
        </Button>
      </Card>
    );
  }

  if (step === "rules") {
    return (
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-slate-100">Exam Rules</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
            <li>You get one attempt at this exam — there are no retakes.</li>
            <li>The timer starts the moment you begin and cannot be paused.</li>
            <li>Leaving the exam window or switching tabs is logged and limited.</li>
            <li>You may flag a question and return to it before submitting.</li>
            <li>Submit before time runs out — the exam auto-submits at zero.</li>
          </ul>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
          I have read and agree to the exam rules above.
        </label>
        <Button type="button" disabled={!agreed} onClick={runGateSequence} className="self-start">
          Start Exam
        </Button>
      </Card>
    );
  }

  if (step === "device") {
    return <DeviceAndIdentityCheck onComplete={proceedToProctorAndStart} />;
  }

  return (
    <Card className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand-primary dark:border-slate-800" />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{STEP_LABELS[step]}</p>
    </Card>
  );
}
