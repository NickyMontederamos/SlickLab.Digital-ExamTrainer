import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ExamNotFoundError } from "@/lib/exams";
import { AttemptNotGradedError, getStudentReportDetail } from "@/lib/reporting";
import { ForbiddenError } from "@/lib/rbac";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";

/** The Individual Strengths & Opportunities (S&O) report — Student Overview + per-question breakdown + Previous/Next navigation. */
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

  let report: Awaited<ReturnType<typeof getStudentReportDetail>>;
  try {
    report = await getStudentReportDetail(institutionId, session.user, examId, attemptId);
  } catch (error) {
    if (error instanceof ExamNotFoundError || error instanceof AttemptNotGradedError) {
      notFound();
    }
    if (error instanceof ForbiddenError) {
      redirect("/dashboard");
    }
    throw error;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <PageHeader
        backHref={`/exams/${examId}/reporting`}
        backLabel="Reporting"
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
