import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import {
  DepartmentHasCoursesError,
  DepartmentNotFoundError,
  deleteDepartment,
  getDepartmentWithCourses,
} from "@/lib/departments";
import { createCourse, CourseCodeTakenError } from "@/lib/courses";
import { PortalTable, type PortalTableRow } from "@/components/PortalTable";
import { CreateCourseModal } from "@/components/CreateCourseModal";
import { Alert, Button, EmptyState, PageHeader } from "@/components/ui";

export default async function DepartmentCoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ departmentId: string }>;
  searchParams: Promise<{ error?: string; deleteError?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.institutionId) {
    redirect("/login");
  }

  const { departmentId } = await params;
  const { error, deleteError } = await searchParams;
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
  const canDeleteDepartment = can(session.user.role, "department", "delete");

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

  async function removeDepartmentAction() {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }

    try {
      await deleteDepartment(authSession.user.institutionId, authSession.user, departmentId);
    } catch (err) {
      if (err instanceof DepartmentHasCoursesError) {
        redirect(`/departments/${departmentId}?deleteError=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect("/departments");
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
          actions={canCreateCourse && <CreateCourseModal createCourseAction={createCourseAction} error={error} />}
        />
      </div>

      {deleteError && <Alert tone="error">{deleteError}</Alert>}

      {department.courses.length === 0 ? (
        <EmptyState>No courses in this department yet.</EmptyState>
      ) : (
        <PortalTable columnLabel="Course Name" searchPlaceholder="Find Courses" totalLabel="Total Courses" rows={rows} />
      )}

      {canDeleteDepartment && (
        <form action={removeDepartmentAction} className="flex items-center gap-2">
          <Button type="submit" variant="danger" className="self-start">
            Remove Department
          </Button>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Only possible while this department has no courses.
          </span>
        </form>
      )}
    </main>
  );
}
