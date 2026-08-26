import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import { createExam, listExamsForCourse } from "@/lib/exams";
import { duplicateBenchmarkExam, listBenchmarkExamsForInstitution } from "@/lib/benchmarks";
import { forTenant } from "@/lib/tenant-db";
import { Alert, Badge, Button, Card, EmptyState, LinkButton, PageHeader, Section, inputClassName, labelClassName } from "@/components/ui";

export default async function CourseExamsPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ duplicateError?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.institutionId) {
    redirect("/login");
  }

  const { courseId } = await params;
  const { duplicateError } = await searchParams;
  const institutionId = session.user.institutionId;

  const course = await forTenant(institutionId).course.findFirst({ where: { id: courseId } });
  if (!course) {
    notFound();
  }

  const exams = can(session.user.role, "exam", "read")
    ? await listExamsForCourse(institutionId, session.user, courseId)
    : [];
  const canCreate = can(session.user.role, "exam", "create");
  const benchmarkExams =
    canCreate && !course.isBenchmarkBank ? await listBenchmarkExamsForInstitution(institutionId, session.user) : [];

  async function createExamAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    const actorId = authSession?.user?.id;
    const actorInstitutionId = authSession?.user?.institutionId;
    const actorRole = authSession?.user?.role;
    if (!actorId || !actorInstitutionId || !actorRole) {
      redirect("/login");
    }

    const title = String(formData.get("title") ?? "").trim();
    const timeLimitMinutes = Number(formData.get("timeLimitMinutes") ?? 60);
    const availableFromRaw = String(formData.get("availableFrom") ?? "");
    const availableUntilRaw = String(formData.get("availableUntil") ?? "");
    const kindRaw = String(formData.get("kind") ?? "STANDARD");

    await createExam(actorInstitutionId, { id: actorId, role: actorRole }, {
      courseId,
      title,
      timeLimitMinutes,
      availableFrom: availableFromRaw ? new Date(availableFromRaw) : undefined,
      availableUntil: availableUntilRaw ? new Date(availableUntilRaw) : undefined,
      kind: kindRaw === "BENCHMARK" ? "BENCHMARK" : "STANDARD",
    });

    revalidatePath(`/courses/${courseId}/exams`);
  }

  async function duplicateBenchmarkAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    const actorId = authSession?.user?.id;
    const actorInstitutionId = authSession?.user?.institutionId;
    const actorRole = authSession?.user?.role;
    if (!actorId || !actorInstitutionId || !actorRole) {
      redirect("/login");
    }

    const sourceExamId = String(formData.get("sourceExamId") ?? "");
    if (!sourceExamId) {
      redirect(`/courses/${courseId}/exams?duplicateError=${encodeURIComponent("Pick a benchmark assessment first")}`);
    }

    const linked = await duplicateBenchmarkExam(actorInstitutionId, { id: actorId, role: actorRole }, {
      sourceExamId,
      targetCourseId: courseId,
    });

    redirect(`/exams/${linked.id}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <PageHeader
        backHref={session.user.role === "STUDENT" ? "/dashboard" : `/courses/${courseId}`}
        title={`${course.code} — ${course.name}`}
        subtitle="Exams"
        actions={
          <LinkButton href={`/courses/${courseId}/questions`} variant="secondary">
            Question bank
          </LinkButton>
        }
      />

      <Section title={`Exams (${exams.length})`}>
        {exams.length === 0 ? (
          <EmptyState>No exams yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {exams.map((exam) => {
              const version = exam.versions[0];
              return (
                <li key={exam.id}>
                  <a href={`/exams/${exam.id}`}>
                    <Card interactive className="flex items-center justify-between">
                      <span className="text-sm">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{exam.title}</span>
                        {version && (
                          <span className="text-slate-500 dark:text-slate-400">
                            {" "}
                            · {version.examQuestions.length} question(s) · {version.timeLimitMinutes} min
                          </span>
                        )}
                      </span>
                      <Badge tone={exam.status === "PUBLISHED" ? "green" : "gray"}>{exam.status}</Badge>
                    </Card>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {canCreate && (
        <Section title="Create an exam">
          <Card>
            <form action={createExamAction} className="flex flex-col gap-3">
              {course.isBenchmarkBank && (
                <fieldset className="flex flex-col gap-1.5">
                  <legend className={labelClassName}>Assessment type</legend>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="radio" name="kind" value="STANDARD" defaultChecked />
                    Question bank
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="radio" name="kind" value="BENCHMARK" />
                    Benchmark Assessment
                  </label>
                </fieldset>
              )}
              <label className={labelClassName}>
                Title
                <input name="title" required className={inputClassName} />
              </label>
              <label className={labelClassName}>
                Time limit (minutes)
                <input name="timeLimitMinutes" type="number" defaultValue={60} className={inputClassName} />
              </label>
              <label className={labelClassName}>
                Available from (optional)
                <input name="availableFrom" type="datetime-local" className={inputClassName} />
              </label>
              <label className={labelClassName}>
                Available until (optional)
                <input name="availableUntil" type="datetime-local" className={inputClassName} />
              </label>
              <Button type="submit" className="self-start">
                Create exam (draft)
              </Button>
            </form>
          </Card>
        </Section>
      )}

      {canCreate && !course.isBenchmarkBank && (
        <Section
          title="Post from Benchmark"
          description="Duplicate a published Benchmark Assessment from a benchmark-bank course into this one. The copy shares the same questions and can't have questions added or removed."
        >
          <Card>
            {duplicateError && (
              <div className="mb-3">
                <Alert tone="error">{duplicateError}</Alert>
              </div>
            )}
            {benchmarkExams.length === 0 ? (
              <EmptyState>No published Benchmark Assessments are available to post yet.</EmptyState>
            ) : (
              <form action={duplicateBenchmarkAction} className="flex flex-col gap-3">
                <label className={labelClassName}>
                  Benchmark Assessment
                  <select name="sourceExamId" required className={inputClassName}>
                    {benchmarkExams.map((exam) => (
                      <option key={exam.id} value={exam.id}>
                        {exam.title} · {exam.course.name} · {exam.versions[0]?.examQuestions.length ?? 0} question(s)
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" className="self-start">
                  Duplicate into this course
                </Button>
              </form>
            )}
          </Card>
        </Section>
      )}
    </main>
  );
}
