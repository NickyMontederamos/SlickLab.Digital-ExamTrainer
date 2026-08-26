import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listCoursesForUser } from "@/lib/courses";
import { clearDeviceRegistration } from "@/lib/device-registration";
import { groupStudentExamRow, listExamOverviewForStudent } from "@/lib/student-exam-overview";
import { StudentExamOverview, type StudentExamOverviewItem } from "@/components/StudentExamOverview";
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

  async function clearDeviceRegistrationAction() {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.id || !authSession.user.institutionId) {
      redirect("/login");
    }
    await clearDeviceRegistration(authSession.user.institutionId, authSession.user);
    redirect("/register-device");
  }

  // ExamSoft Portal's "My Exams" screen (PAGE TEMPLATE/Student Overview_Exam)
  // — a flat, status-grouped list of every exam across every enrolled
  // course, not the course-by-course hierarchy FACULTY/ADMIN still use
  // below. See StudentExamOverview.tsx for why the group labels are literal.
  if (session.user.role === "STUDENT") {
    // Server Component computing a server-authoritative "now" once per
    // request, not a client render the purity rule is meant to protect —
    // same reasoning as attempts/[attemptId]/page.tsx's own deadline check.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const rows = await listExamOverviewForStudent(institutionId, session.user);
    const items: StudentExamOverviewItem[] = rows.map((row) => ({
      examId: row.examId,
      examTitle: row.examTitle,
      courseCode: row.courseCode,
      courseName: row.courseName,
      group: groupStudentExamRow(row, now),
      attemptId: row.attemptId,
      isFullyGraded: row.attemptStatus === "GRADED",
      availableFrom: row.availableFrom,
      availableUntil: row.availableUntil,
      submittedAt: row.submittedAt,
    }));

    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
        <PageHeader title={`Welcome, ${session.user.name}`} subtitle={`Signed in as ${session.user.role}`} />

        {items.length === 0 ? (
          <EmptyState>No exams yet — your instructor hasn&apos;t published one for your courses.</EmptyState>
        ) : (
          <StudentExamOverview items={items} />
        )}

        <form action={clearDeviceRegistrationAction}>
          <button type="submit" className="w-fit text-xs text-slate-400 hover:text-brand-primary hover:underline dark:text-slate-500">
            Not your device? Clear registration
          </button>
        </form>
      </main>
    );
  }

  const courses = await listCoursesForUser(institutionId, session.user);
  const coursesLabel = session.user.role === "FACULTY" ? "Courses I Teach" : "Courses";

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
    </main>
  );
}
