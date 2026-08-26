import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AttemptNotFoundError, AttemptOwnershipError, getAttemptResult } from "@/lib/attempts";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Alert, Card, PageHeader } from "@/components/ui";

export default async function AttemptResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ expired?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.institutionId) {
    redirect("/login");
  }

  const { attemptId } = await params;
  const { expired } = await searchParams;
  const institutionId = session.user.institutionId;

  let result;
  try {
    result = await getAttemptResult(institutionId, session.user, attemptId);
  } catch (error) {
    if (error instanceof AttemptNotFoundError) {
      notFound();
    }
    if (error instanceof AttemptOwnershipError) {
      redirect("/dashboard");
    }
    throw error;
  }

  // Real "approve to finish" step (docs/PITCH_ROADMAP.md Milestone 5): a
  // student who wasn't terminated for an integrity violation sees their
  // result only once a proctor verifies the submission. TERMINATED attempts
  // never get a Submission row (see resolveIntegrityReview in integrity.ts)
  // and skip this gate entirely — that result is shown immediately below.
  if (result.attempt.status !== "TERMINATED" && !result.attempt.submission?.verifiedAt) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
        <AutoRefresh intervalMs={5000} />
        <PageHeader backHref="/dashboard" title={result.attempt.examVersion.exam.title} />
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-primary" />
          <Alert tone="warning">
            Your exam has been submitted. Waiting for your proctor to approve closing out your session — this page
            updates automatically once that happens.
          </Alert>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <PageHeader backHref="/dashboard" title={`${result.attempt.examVersion.exam.title} — Result`} />

      {expired === "1" && <Alert tone="warning">Time expired — this exam was auto-submitted.</Alert>}

      {result.attempt.status !== "TERMINATED" && result.attempt.submission?.verifiedAt && (
        <UploadConfirmation verifiedAt={result.attempt.submission.verifiedAt} />
      )}

      {result.attempt.status === "TERMINATED" ? (
        <Alert tone="error">
          This attempt was terminated following an integrity review — a faculty member confirmed a violation after
          repeated warnings during the exam. Contact your instructor if you believe this was in error.
        </Alert>
      ) : (
        <Card className="flex flex-col items-center gap-1 py-6 text-center">
          <span className="text-4xl font-semibold tracking-tight text-slate-900">
            {result.scoredPoints} <span className="text-2xl font-normal text-slate-400">/ {result.totalPoints}</span>
          </span>
          <span className="text-sm text-slate-500">
            {result.isFullyGraded ? "Final score" : "Partial score so far — some answers pending manual grading"}
          </span>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {result.breakdown.map((row, i) => (
          <Card key={i} className="flex items-start gap-3 text-sm">
            <ReviewMark row={row} />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">Q{i + 1}</span>
                <span className="text-slate-500">
                  {row.pending ? "Pending grading" : `${row.pointsAwarded} / ${row.maxPoints} pt(s)`}
                </span>
              </div>
              <p className="mt-1 text-slate-700">{row.prompt}</p>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}

/**
 * Mirrors the real app's own post-upload confirmation — a green checkmark
 * plus a timestamp the student can point to (docs/EXAMPLIFY_ARCHITECTURE_REFERENCE.md,
 * stage 7: "a green checkmark next to the exam name... confirm upload date
 * and time"). `verifiedAt` is the proctor's "approve to finish" timestamp
 * here rather than a raw upload timestamp, since this app's sync step is the
 * proctor confirming the submission, not a network re-upload.
 */
function UploadConfirmation({ verifiedAt }: { verifiedAt: Date }) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(verifiedAt);

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z" clipRule="evenodd" />
        </svg>
      </span>
      <span>
        Submitted and confirmed <span className="text-emerald-600">·</span> {formatted}
      </span>
    </div>
  );
}

/**
 * Per-question correct/incorrect/pending mark — green check, red X, or an
 * amber clock, matching the review-screen convention the app this trainer
 * practices for uses (a check/X/blank indicator per question). "Correct"
 * is defined as full credit; anything short of that, including partial
 * credit on a manually-graded answer, reads as incorrect rather than a
 * misleading in-between state — there is no partial-credit icon to give.
 */
function ReviewMark({ row }: { row: { pending: boolean; pointsAwarded: number | null; maxPoints: number } }) {
  if (row.pending) {
    return (
      <span
        className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-100 text-amber-700"
        aria-label="Pending grading"
        title="Pending grading"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .2.08.39.22.53l3.5 3.5a.75.75 0 101.06-1.06L10.75 9.7V5z" clipRule="evenodd" />
        </svg>
      </span>
    );
  }
  const isCorrect = row.pointsAwarded !== null && row.pointsAwarded >= row.maxPoints;
  if (isCorrect) {
    return (
      <span
        className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
        aria-label="Correct"
        title="Correct"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z" clipRule="evenodd" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-red-100 text-red-700"
      aria-label="Incorrect"
      title="Incorrect"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path fillRule="evenodd" d="M5.3 5.3a1 1 0 011.4 0L10 8.6l3.3-3.3a1 1 0 111.4 1.4L11.4 10l3.3 3.3a1 1 0 01-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 01-1.4-1.4L8.6 10 5.3 6.7a1 1 0 010-1.4z" clipRule="evenodd" />
      </svg>
    </span>
  );
}
