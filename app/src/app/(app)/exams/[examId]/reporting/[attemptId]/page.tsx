import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ExamNotFoundError } from "@/lib/exams";
import { AttemptOwnershipError } from "@/lib/attempts";
import { AttemptNotGradedError, ResultsNotReleasedError, getStudentReportDetail } from "@/lib/reporting";
import { ForbiddenError } from "@/lib/rbac";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";

/**
 * The Individual Strengths & Opportunities (S&O) report — Student Overview
 * + per-question breakdown + Previous/Next navigation (faculty/admin only —
 * see getStudentReportDetail's docstring).
 *
 * Two audiences share this route: FACULTY/ADMIN browsing any student's
 * report in their course (unchanged), and a STUDENT opening their own
 * released result — the real product's "ExamSoft Portal: View Your Exam
 * Results". A student whose results aren't released yet sees a plain
 * "not released" state here instead of a 404, matching the real product's
 * own framing rather than looking like a broken link.
 */
export default async function StudentReportPage({
  params,
}: {
  params: Promise<{ examId: string; attemptId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.institutionId) {
    redirect("/login");
  }

  const { examId, attemptId } = await params;
  const institutionId = session.user.institutionId;
  const isStudent = session.user.role === "STUDENT";
  const backHref = isStudent ? `/attempts/${attemptId}/result` : `/exams/${examId}/reporting`;
  const backLabel = isStudent ? "Your Result" : "Reporting";

  let report: Awaited<ReturnType<typeof getStudentReportDetail>>;
  try {
    report = await getStudentReportDetail(institutionId, session.user, examId, attemptId);
  } catch (error) {
    if (error instanceof ResultsNotReleasedError) {
      return (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
          <PageHeader backHref={backHref} backLabel={backLabel} title="Individual Strengths & Opportunities report" />
          <Alert tone="info">
            Your results haven&apos;t been released yet. Check back once your instructor releases them — this page
            will show your report automatically.
          </Alert>
        </main>
      );
    }
    if (error instanceof ExamNotFoundError || error instanceof AttemptNotGradedError) {
      notFound();
    }
    if (error instanceof ForbiddenError || error instanceof AttemptOwnershipError) {
      redirect("/dashboard");
    }
    throw error;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <PageHeader
        backHref={backHref}
        backLabel={backLabel}
        title="Individual Strengths & Opportunities report"
        subtitle={report.studentName}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            {report.previousAttemptId && (
              <LinkButton href={`/exams/${examId}/reporting/${report.previousAttemptId}`} variant="secondary" className="px-2.5 py-1 text-xs">
                ← Previous
              </LinkButton>
            )}
            {report.nextAttemptId && (
              <LinkButton href={`/exams/${examId}/reporting/${report.nextAttemptId}`} variant="secondary" className="px-2.5 py-1 text-xs">
                Next →
              </LinkButton>
            )}
          </div>
        }
      />

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{report.studentPercent.toFixed(2)}%</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">Student Score</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {report.classAveragePercent !== null ? `${report.classAveragePercent.toFixed(2)}%` : "—"}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">Class Average</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {report.simulatedNationalAveragePercent !== null ? `${report.simulatedNationalAveragePercent.toFixed(2)}%` : "—"}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">National Average</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {report.rank} / {report.totalGradedStudents}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">Rank</span>
        </div>
      </Card>

      {report.simulatedNationalAveragePercent !== null && (
        <Alert tone="info">
          Simulated national average — for demonstration only, not derived from real student data.
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Question-by-question performance</h3>
        {report.breakdown.map((row, i) => (
          <Card key={i} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-700 dark:text-slate-300">
              Q{i + 1} — {row.prompt.slice(0, 80)}
            </span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">
              {row.pointsAwarded ?? 0} / {row.maxPoints}
            </span>
          </Card>
        ))}
      </div>

      <PrintButton />
    </main>
  );
}
