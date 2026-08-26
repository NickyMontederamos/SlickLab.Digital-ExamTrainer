import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import { createDepartment, DepartmentNameTakenError, listDepartments } from "@/lib/departments";
import { PortalTable, type PortalTableRow } from "@/components/PortalTable";
import { Alert, Button, Card, EmptyState, LinkButton, PageHeader, Section, inputClassName, labelClassName } from "@/components/ui";

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

  const rows: PortalTableRow[] = departments.map((department) => ({
    id: department.id,
    label: department.name,
    href: `/departments/${department.id}`,
    meta: `${department._count.courses} course${department._count.courses === 1 ? "" : "s"}`,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <PageHeader title="My Departments" actions={canCreate && <LinkButton href="#create-department" variant="success">Create Department</LinkButton>} />

      {departments.length === 0 ? (
        <EmptyState>No departments yet.</EmptyState>
      ) : (
        <PortalTable
          columnLabel="Department Name"
          searchPlaceholder="Find Departments"
          totalLabel="Total Departments"
          rows={rows}
        />
      )}

      {canCreate && (
        <div id="create-department">
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
                <Button type="submit" variant="success" className="self-start">
                  Create department
                </Button>
              </form>
            </Card>
          </Section>
        </div>
      )}
    </main>
  );
}
