import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import { DepartmentNotFoundError, getDepartmentWithCourses } from "@/lib/departments";
import { createCourse, CourseCodeTakenError } from "@/lib/courses";
import { PortalTable, type PortalTableRow } from "@/components/PortalTable";
import { Alert, Button, Card, EmptyState, LinkButton, PageHeader, Section, inputClassName, labelClassName } from "@/components/ui";

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

  const rows: PortalTableRow[] = department.courses.map((course) => ({
    id: course.id,
    label: `${course.code} — ${course.name}`,
    href: `/courses/${course.id}`,
    meta: course.academicYear,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <div>
        <nav className="mb-1 text-xs text-slate-500 dark:text-slate-400">
          <a href="/departments" className="hover:text-brand-primary hover:underline">
            {department.name}
          </a>{" "}
          / My Courses
        </nav>
        <PageHeader
          title="My Courses"
          actions={canCreateCourse && <LinkButton href="#create-course" variant="success">Create A Course</LinkButton>}
        />
      </div>

      {department.courses.length === 0 ? (
        <EmptyState>No courses in this department yet.</EmptyState>
      ) : (
        <PortalTable columnLabel="Course Name" searchPlaceholder="Find Courses" totalLabel="Total Courses" rows={rows} />
      )}

      {canCreateCourse && (
        <div id="create-course">
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
                <Button type="submit" variant="success" className="self-start">
                  Create course
                </Button>
              </form>
            </Card>
          </Section>
        </div>
      )}
    </main>
  );
}
