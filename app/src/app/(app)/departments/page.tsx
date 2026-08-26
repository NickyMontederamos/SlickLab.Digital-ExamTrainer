import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import { createDepartment, DepartmentNameTakenError, listDepartments } from "@/lib/departments";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Section, inputClassName, labelClassName } from "@/components/ui";

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.institutionId) {
    redirect("/login");
  }

  const { error } = await searchParams;
  const institutionId = session.user.institutionId;

  const departments = await listDepartments(institutionId, session.user);
  const canCreate = can(session.user.role, "department", "create");

  async function createDepartmentAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }

    const name = String(formData.get("name") ?? "").trim();

    try {
      await createDepartment(authSession.user.institutionId, authSession.user, { name });
    } catch (err) {
      if (err instanceof DepartmentNameTakenError) {
        redirect(`/departments?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    revalidatePath("/departments");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <PageHeader title="My Departments" />

      <Section title={`Departments (${departments.length})`}>
        {departments.length === 0 ? (
          <EmptyState>No departments yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {departments.map((department) => (
              <li key={department.id}>
                <a href={`/departments/${department.id}`}>
                  <Card interactive className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{department.name}</span>
                    <Badge tone="gray">
                      {department._count.courses} course{department._count.courses === 1 ? "" : "s"}
                    </Badge>
                  </Card>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {canCreate && (
        <Section title="Create a department">
          <Card>
            {error && (
              <div className="mb-3">
                <Alert tone="error">{error}</Alert>
              </div>
            )}
            <form action={createDepartmentAction} className="flex flex-col gap-3">
              <label className={labelClassName}>
                Name
                <input name="name" required placeholder="College of Law" className={inputClassName} />
              </label>
              <Button type="submit" className="self-start">
                Create department
              </Button>
            </form>
          </Card>
        </Section>
      )}
    </main>
  );
}
