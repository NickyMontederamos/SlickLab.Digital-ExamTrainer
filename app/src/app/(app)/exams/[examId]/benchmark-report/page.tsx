import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import { getBenchmarkCombinedReport } from "@/lib/benchmarks";
import { ExamNotFoundError } from "@/lib/exams";
import { Alert, Card, PageHeader } from "@/components/ui";

export default async function BenchmarkReportPage({ params }: { params: Promise<{ examId: string }> }) {
  const session = await auth();
  if (!session?.user?.institutionId) {
    redirect("/login");
  }
  if (!can(session.user.role, "grade", "read")) {
    redirect("/dashboard");
  }

  const { examId } = await params;
  const institutionId = session.user.institutionId;

  let report: Awaited<ReturnType<typeof getBenchmarkCombinedReport>>;
  try {
    report = await getBenchmarkCombinedReport(institutionId, session.user, examId);
  } catch (err) {
    if (err instanceof ExamNotFoundError) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <PageHeader backHref={`/exams/${examId}`} backLabel="Exam" title={report.sourceTitle} subtitle="Combined Report" />

      <Card className="flex flex-col items-center gap-1 py-6 text-center">
        <span className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {report.combinedAverageScorePercent !== null ? `${report.combinedAverageScorePercent.toFixed(1)}%` : "—"}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Combined average across {report.rows.length} course{report.rows.length === 1 ? "" : "s"} ·{" "}
          {report.combinedGradedCount} graded attempt{report.combinedGradedCount === 1 ? "" : "s"}
        </span>
      </Card>

      <div className="flex flex-col gap-2">
        {report.rows.map((row) => (
          <Card key={row.examId} className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-900 dark:text-slate-100">{row.courseName}</span>
            <span className="text-slate-500 dark:text-slate-400">
              {row.averageScorePercent !== null ? `${row.averageScorePercent.toFixed(1)}%` : "no graded attempts yet"} ·{" "}
              {row.gradedCount} graded
            </span>
          </Card>
        ))}
      </div>

      <Alert tone="info">
        Simulated national average: {report.simulatedNationalAveragePercent.toFixed(1)}% — for demonstration only, not
        derived from real student data. This trainer has no connection to ExamSoft&apos;s actual national norms.
      </Alert>
    </main>
  );
}
