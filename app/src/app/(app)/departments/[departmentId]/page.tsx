import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import { DepartmentNotFoundError, getDepartmentWithCourses } from "@/lib/departments";
import { createCourse, CourseCodeTakenError } from "@/lib/courses";
import { Alert, Button, Card, EmptyState, PageHeader, Section, inputClassName, labelClassName } from "@/components/ui";

export default async function DepartmentCoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ departmentId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.institutionId) {
    redirect("/login");
  }

  const { departmentId } = await params;
  const { error } = await searchParams;
  const institutionId = session.user.institutionId;

  let department: Awaited<ReturnType<typeof getDepartmentWithCourses>>;
  try {
    department = await getDepartmentWithCourses(institutionId, session.user, departmentId);
  } catch (err) {
    if (err instanceof DepartmentNotFoundError) {
      notFound();
    }
    throw err;
  }

  const canCreateCourse = can(session.user.role, "course", "create");

  async function createCourseAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }

    const code = String(formData.get("code") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const academicYear = String(formData.get("academicYear") ?? "").trim();

    try {
      await createCourse(authSession.user.institutionId, authSession.user, { code, name, academicYear, departmentId });
    } catch (err) {
      if (err instanceof CourseCodeTakenError) {
        redirect(`/departments/${departmentId}?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    revalidatePath(`/departments/${departmentId}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <PageHeader backHref="/departments" backLabel="Departments" title="My Courses" subtitle={department.name} />

      <Section title={`Courses (${department.courses.length})`}>
        {department.courses.length === 0 ? (
          <EmptyState>No courses in this department yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {department.courses.map((course) => (
              <li key={course.id}>
                <a href={`/courses/${course.id}`}>
                  <Card interactive className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {course.code} — {course.name}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{course.academicYear}</span>
                  </Card>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {canCreateCourse && (
        <Section title="Create a course">
          <Card>
            {error && (
              <div className="mb-3">
                <Alert tone="error">{error}</Alert>
              </div>
            )}
            <form action={createCourseAction} className="flex flex-col gap-3">
              <label className={labelClassName}>
                Code
                <input name="code" required placeholder="LAW101" className={inputClassName} />
              </label>
              <label className={labelClassName}>
                Name
                <input name="name" required className={inputClassName} />
              </label>
              <label className={labelClassName}>
                Academic year
                <input name="academicYear" required placeholder="2026-2027" className={inputClassName} />
              </label>
              <Button type="submit" className="self-start">
                Create course
              </Button>
            </form>
          </Card>
        </Section>
      )}
    </main>
  );
}
