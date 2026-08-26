import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listCoursesForUser } from "@/lib/courses";
import { Card, EmptyState, PageHeader, Section } from "@/components/ui";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // SUPER_ADMIN / PLATFORM_ADMIN operate cross-tenant and have no
  // institutionId of their own — they get their own landing page, not
  // this tenant dashboard.
  if (session.user.role === "SUPER_ADMIN" || session.user.role === "PLATFORM_ADMIN") {
    redirect("/admin");
  }

  // Proctors act on queues (docs/PITCH_ROADMAP.md Milestone 5), not browse
  // courses — the generic course-list dashboard below isn't their job here.
  if (session.user.role === "PROCTOR") {
    redirect("/proctor");
  }

  if (!session.user.institutionId) {
    redirect("/login");
  }

  const institutionId = session.user.institutionId;
  const courses = await listCoursesForUser(institutionId, session.user);
  const courseLinkPath = session.user.role === "STUDENT" ? "exams" : "";

  const coursesLabel =
    session.user.role === "STUDENT" ? "My Courses" : session.user.role === "FACULTY" ? "Courses I Teach" : "Courses";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <PageHeader title={`Welcome, ${session.user.name}`} subtitle={`Signed in as ${session.user.role}`} />

      <Section title={coursesLabel}>
        {courses.length === 0 ? (
          <EmptyState>No courses yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {courses.map((course) => (
              <li key={course.id}>
                <a href={courseLinkPath ? `/courses/${course.id}/${courseLinkPath}` : `/courses/${course.id}`}>
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
    </main>
  );
}
