import type { Role } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import { EmailTakenError, inviteUser, listUsers, resetUserPassword, setUserActive } from "@/lib/users";
import { createInviteToken } from "@/lib/account-tokens";
import { Alert, Badge, Button, Card, PageHeader, Section, inputClassName, labelClassName } from "@/components/ui";

const ASSIGNABLE_ROLES: Role[] = ["INSTITUTION_ADMIN", "FACULTY", "PROCTOR", "STUDENT"];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.institutionId) {
    redirect("/login");
  }
  if (!can(session.user.role, "user", "create")) {
    redirect("/dashboard");
  }

  const { error, invite } = await searchParams;
  const institutionId = session.user.institutionId;
  const users = await listUsers(institutionId, session.user);

  // Only ever set right after inviteUserAction's own redirect, from a raw
  // token that exists nowhere else once this render finishes — the token
  // hash is what's actually persisted (see account-tokens.ts). A page
  // reload or a shared/bookmarked URL doesn't reveal anything: the token
  // was already used or the link simply won't be here anymore.
  const inviteUrl = invite ? `${(await headers()).get("x-forwarded-proto") ?? "https"}://${(await headers()).get("host")}/accept-invite/${invite}` : null;

  async function inviteUserAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }

    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const role = String(formData.get("role") ?? "STUDENT") as Role;

    let token: string;
    try {
      const created = await inviteUser(authSession.user.institutionId, authSession.user, { name, email, role });
      token = await createInviteToken(authSession.user.institutionId, authSession.user, created.id);
    } catch (err) {
      if (err instanceof EmailTakenError) {
        redirect(`/users?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    revalidatePath("/users");
    redirect(`/users?invite=${token}`);
  }

  async function toggleActiveAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }
    const userId = String(formData.get("userId") ?? "");
    const nextActive = formData.get("nextActive") === "true";
    if (!userId) return;
    await setUserActive(authSession.user.institutionId, authSession.user, userId, nextActive);
    revalidatePath("/users");
  }

  async function resetPasswordAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }
    const userId = String(formData.get("userId") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    if (!userId || newPassword.length < 8) return;
    await resetUserPassword(authSession.user.institutionId, authSession.user, userId, newPassword);
    revalidatePath("/users");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <PageHeader backHref="/dashboard" title={`Users (${users.length})`} />

      <Section title="Roster">
        <ul className="flex flex-col gap-2">
          {users.map((user) => (
            <li key={user.id}>
              <Card className="text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{user.name}</span>{" "}
                    <span className="text-slate-500 dark:text-slate-400">({user.email})</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge>{user.role}</Badge>
                    {!user.isActive && <Badge tone="red">Inactive</Badge>}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <form action={toggleActiveAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="nextActive" value={(!user.isActive).toString()} />
                    <Button type="submit" variant={user.isActive ? "danger" : "secondary"} className="px-2.5 py-1 text-xs">
                      {user.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </form>
                  <form action={resetPasswordAction} className="flex items-center gap-2">
                    <input
                      name="newPassword"
                      type="password"
                      placeholder="New password"
                      minLength={8}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
                    />
                    <input type="hidden" name="userId" value={user.id} />
                    <Button type="submit" variant="secondary" className="px-2.5 py-1 text-xs">
                      Reset password
                    </Button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Invite a user"
        description="They set their own password — nobody here ever sees or types it for them."
      >
        <Card>
          {error && (
            <div className="mb-3">
              <Alert tone="error">{error}</Alert>
            </div>
          )}
          {inviteUrl && (
            <div className="mb-3 flex flex-col gap-1.5">
              <Alert tone="success">Account created. Send this one-time link to complete setup — it won&apos;t be shown again:</Alert>
              <code className="break-all rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {inviteUrl}
              </code>
            </div>
          )}
          <form action={inviteUserAction} className="flex flex-col gap-3">
            <label className={labelClassName}>
              Name
              <input name="name" required className={inputClassName} />
            </label>
            <label className={labelClassName}>
              Email
              <input name="email" type="email" required className={inputClassName} />
            </label>
            <label className={labelClassName}>
              Role
              <select name="role" required className={inputClassName} defaultValue="STUDENT">
                {ASSIGNABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" className="self-start">
              Create invite
            </Button>
          </form>
        </Card>
      </Section>
    </main>
  );
}
