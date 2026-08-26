import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDemoInstitutionBranding } from "@/lib/branding";
import { hasRegisteredDevice, registerDevice } from "@/lib/device-registration";
import { listCoursesForUser } from "@/lib/courses";
import { InstallCeremony } from "@/components/InstallCeremony";

/**
 * The install/register ceremony — the first thing a new student does,
 * mirroring Examplify's own download/install/register flow (see
 * docs/EXAMPLIFY_ARCHITECTURE_REFERENCE.md and the plan this was built from).
 * Sits outside the (app) route group deliberately: (app)/layout.tsx redirects
 * an unregistered student HERE, so this page must not itself be wrapped by
 * that same gate (would be a redirect loop) and doesn't get the authenticated
 * AppHeader shell — same reasoning /login sits outside (app) too.
 */
export default async function RegisterDevicePage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.institutionId) {
    redirect("/login");
  }
  if (session.user.role !== "STUDENT") {
    redirect("/dashboard");
  }

  const registered = await hasRegisteredDevice(session.user.institutionId, session.user);
  if (registered) {
    redirect("/dashboard");
  }

  const [branding, courses] = await Promise.all([
    getDemoInstitutionBranding(),
    listCoursesForUser(session.user.institutionId, session.user),
  ]);

  async function completeRegistrationAction(deviceFingerprint: string) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.id || !authSession.user.institutionId || authSession.user.role !== "STUDENT") {
      redirect("/login");
    }
    await registerDevice(authSession.user.institutionId, authSession.user, deviceFingerprint);
  }

  return (
    <InstallCeremony
      studentName={session.user.name ?? "Student"}
      studentEmail={session.user.email ?? ""}
      institutionName={branding?.name ?? "College of Maasin — College of Law"}
      courses={courses.map((c) => ({ id: c.id, code: c.code, name: c.name, academicYear: c.academicYear }))}
      completeRegistrationAction={completeRegistrationAction}
    />
  );
}
