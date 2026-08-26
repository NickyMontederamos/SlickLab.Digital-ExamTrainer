import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { ExamNotFoundError } from "@/lib/exams";
import { getExamReportingOverview, releaseResults } from "@/lib/reporting";
import { ForbiddenError } from "@/lib/rbac";
import { ReportingStudentsTable } from "@/components/ReportingStudentsTable";
import { ReleaseResultsModal } from "@/components/ReleaseResultsModal";
import { Alert, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export default async function ExamReportingPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.institutionId) {
    redirect("/login");
  }

  const { examId } = await params;
  const { view } = await searchParams;
  const institutionId = session.user.institutionId;
  const activeView = view === "summary" ? "summary" : "students";

  let overview: Awaited<ReturnType<typeof getExamReportingOverview>>;
  try {
    overview = await getExamReportingOverview(institutionId, session.user, examId);
  } catch (error) {
    if (error instanceof ExamNotFoundError) {
      notFound();
    }
    if (error instanceof ForbiddenError) {
      redirect("/dashboard");
    }
    throw error;
  }

  async function releaseResultsAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.id || !authSession.user.institutionId) {
      redirect("/login");
    }

    const attemptIds = formData.getAll("attemptIds").map(String);
    await releaseResults(authSession.user.institutionId, authSession.user, examId, attemptIds);
    revalidatePath(`/exams/${examId}/reporting`);
  }

  const maxCount = Math.max(1, ...overview.histogram.map((b) => b.count));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <PageHeader
        backHref={`/exams/${examId}`}
        backLabel="Exam"
        title={`Student Performance: ${overview.examTitle}`}
        actions={
          <ReleaseResultsModal
            students={overview.students
              .filter((s) => s.isGraded)
              .map((s) => ({ attemptId: s.attemptId, studentName: s.studentName, released: Boolean(s.resultsReleasedAt) }))}
            releaseResultsAction={releaseResultsAction}
          />
        }
      />

      {overview.linkedCourseNames.length > 0 && (
        <Alert tone="info">
          This exam is one of multiple linked assessments ({overview.linkedCourseNames.join(", ")}). Combined
          reporting is available from the source exam&apos;s Combined Report link.
        </Alert>
      )}

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <a
          href={`/exams/${examId}/reporting?view=students`}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            activeView === "students"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          Students
        </a>
        <a
          href={`/exams/${examId}/reporting?view=summary`}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            activeView === "summary"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          Summary
        </a>
      </div>

      {overview.students.length === 0 ? (
        <EmptyState>No submissions to report on yet.</EmptyState>
      ) : activeView === "students" ? (
        <ReportingStudentsTable
          examId={examId}
          rows={overview.students.map((s) => ({
            attemptId: s.attemptId,
            studentName: s.studentName,
            percentCorrect: s.percentCorrect,
            totalPoints: s.totalPoints,
            maxPoints: s.maxPoints,
            isGraded: s.isGraded,
            released: Boolean(s.resultsReleasedAt),
          }))}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="flex flex-col items-center gap-1 py-4 text-center">
              <span className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {overview.classAveragePercent !== null ? `${overview.classAveragePercent.toFixed(0)}%` : "—"}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Class Average</span>
            </Card>
            <Card className="flex flex-col items-center gap-1 py-4 text-center">
              <span className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {overview.lowScorePercent !== null ? `${overview.lowScorePercent.toFixed(0)}%` : "—"}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Low Score</span>
            </Card>
            <Card className="flex flex-col items-center gap-1 py-4 text-center">
              <span className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {overview.highScorePercent !== null ? `${overview.highScorePercent.toFixed(0)}%` : "—"}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">High Score</span>
            </Card>
            <Card className="flex flex-col items-center gap-1 py-4 text-center">
              <span className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {overview.simulatedNationalAveragePercent !== null
                  ? `${overview.simulatedNationalAveragePercent.toFixed(0)}%`
                  : "—"}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">National Average</span>
            </Card>
          </div>

          {overview.simulatedNationalAveragePercent !== null && (
            <Alert tone="info">
              Simulated national average — for demonstration only, not derived from real student data. This trainer
              has no connection to ExamSoft&apos;s actual national norms.
            </Alert>
          )}

          <Card>
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Total Student Performance Histogram
            </h3>
            <div className="flex items-end gap-1.5" style={{ height: 140 }}>
              {overview.histogram.map((bucket) => (
                <div key={bucket.band} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-brand-primary"
                    style={{ height: `${(bucket.count / maxCount) * 110}px`, minHeight: bucket.count > 0 ? 3 : 0 }}
                    title={`${bucket.count} student(s)`}
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{bucket.band}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <LinkButton href={`/exams/${examId}/grading`} variant="secondary" className="self-start">
        Update Scores
      </LinkButton>
    </main>
  );
}
