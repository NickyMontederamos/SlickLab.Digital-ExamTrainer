import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import { createExam, listExamsForCourse } from "@/lib/exams";
import { forTenant } from "@/lib/tenant-db";
import { CreateAssessmentModal } from "@/components/CreateAssessmentModal";
import { PortalTable, type PortalTableRow } from "@/components/PortalTable";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";

export default async function CourseExamsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.institutionId) {
    redirect("/login");
  }

  const { courseId } = await params;
  const institutionId = session.user.institutionId;

  const course = await forTenant(institutionId).course.findFirst({ where: { id: courseId } });
  if (!course) {
    notFound();
  }

  const exams = can(session.user.role, "exam", "read")
    ? await listExamsForCourse(institutionId, session.user, courseId)
    : [];
  const canCreate = can(session.user.role, "exam", "create");

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

  const rows: PortalTableRow[] = exams.map((exam) => {
    const version = exam.versions[0];
    return {
      id: exam.id,
      label: exam.title,
      href: `/exams/${exam.id}`,
      status: exam.status,
      meta: `${exam.status}${version ? ` · ${version.examQuestions.length} question(s) · ${version.timeLimitMinutes} min` : ""}`,
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <PageHeader
        backHref={session.user.role === "STUDENT" ? "/dashboard" : `/courses/${courseId}`}
        title={`${course.code} — ${course.name}`}
        subtitle="Assessments"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={`/courses/${courseId}/questions`} variant="secondary">
              Question bank
            </LinkButton>
            {canCreate && <CreateAssessmentModal isBenchmarkBank={course.isBenchmarkBank} createExamAction={createExamAction} />}
          </div>
        }
      />

      {exams.length === 0 ? (
        <EmptyState>No assessments found. Assessments have not yet been created for this course.</EmptyState>
      ) : (
        <PortalTable
          columnLabel="Assessment Name"
          searchPlaceholder="Find Assessment"
          totalLabel="Total Assessments"
          rows={rows}
          filterOptions={["DRAFT", "PUBLISHED"]}
        />
      )}
    </main>
  );
}
