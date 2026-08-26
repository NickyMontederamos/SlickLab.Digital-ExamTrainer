import type { AttemptStatus, Role } from "@prisma/client";
import { assertCan } from "./rbac";
import { forTenant } from "./tenant-db";

/**
 * The ExamSoft Portal's "My Exams" screen (PAGE TEMPLATE/Student Overview_Exam/
 * StudentOverview_Dashboard.jpg): every exam across every enrolled course in
 * ONE flat, status-grouped list, not the course-by-course hierarchy the rest
 * of this app uses. Real throughout — every row is a real exam this student
 * can see, annotated with their own real attempt (or none) on it. Grouping
 * into DOWNLOADED/READY FOR DOWNLOAD/UPCOMING/COMPLETED/EXPIRED happens in
 * the page component, from these real fields — see groupStudentExamRows.
 */
export interface StudentExamOverviewRow {
  examId: string;
  examTitle: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  availableFrom: Date | null;
  availableUntil: Date | null;
  attemptId: string | null;
  attemptStatus: AttemptStatus | null;
  submittedAt: Date | null;
}

export async function listExamOverviewForStudent(
  institutionId: string,
  actor: { id: string; role: Role }
): Promise<StudentExamOverviewRow[]> {
  assertCan(actor.role, "exam", "read");

  const db = forTenant(institutionId);
  const enrollments = await db.enrollment.findMany({ where: { userId: actor.id }, select: { courseId: true } });
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) {
    return [];
  }

  const exams = await db.exam.findMany({
    where: { courseId: { in: courseIds }, status: "PUBLISHED" },
    include: {
      course: true,
      versions: {
        where: { isActive: true },
        take: 1,
        include: {
          examAttempts: { where: { studentId: actor.id }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return exams.map((exam) => {
    const version = exam.versions[0];
    const attempt = version?.examAttempts[0] ?? null;
    return {
      examId: exam.id,
      examTitle: exam.title,
      courseId: exam.courseId,
      courseCode: exam.course.code,
      courseName: exam.course.name,
      availableFrom: version?.availableFrom ?? null,
      availableUntil: version?.availableUntil ?? null,
      attemptId: attempt?.id ?? null,
      attemptStatus: attempt?.status ?? null,
      submittedAt: attempt?.submittedAt ?? null,
    };
  });
}

export type StudentExamGroup = "DOWNLOADED" | "READY_FOR_DOWNLOAD" | "UPCOMING" | "COMPLETED" | "EXPIRED";

/**
 * Real categorization, not decorative labels — mirrors what each reference
 * group actually means: COMPLETED wins over everything once submitted
 * (even past the window), EXPIRED only applies to an exam nobody ever
 * finished, DOWNLOADED means a real in-progress/paused attempt exists,
 * READY FOR DOWNLOAD means bookable/startable right now, UPCOMING means the
 * window hasn't opened yet.
 */
export function groupStudentExamRow(row: StudentExamOverviewRow, now: number): StudentExamGroup {
  if (row.attemptStatus === "SUBMITTED" || row.attemptStatus === "GRADED" || row.attemptStatus === "TERMINATED") {
    return "COMPLETED";
  }
  if (row.attemptStatus === "IN_PROGRESS" || row.attemptStatus === "INTERRUPTED") {
    return "DOWNLOADED";
  }
  if (row.availableUntil && row.availableUntil.getTime() < now) {
    return "EXPIRED";
  }
  if (row.availableFrom && row.availableFrom.getTime() > now) {
    return "UPCOMING";
  }
  return "READY_FOR_DOWNLOAD";
}
