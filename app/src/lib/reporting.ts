import type { Role } from "@prisma/client";
import { assertCan } from "./rbac";
import { forTenant } from "./tenant-db";
import { ExamNotFoundError } from "./exams";
import { assertFacultyAssignedToCourse } from "./courses";
import { averageScorePercent } from "./grading";
import { AttemptOwnershipError } from "./attempts";
import { AUDIT_ACTIONS, logAudit } from "./audit";

export class AttemptNotGradedError extends Error {
  constructor(attemptId: string) {
    super(`Attempt ${attemptId} has not been graded yet`);
    this.name = "AttemptNotGradedError";
  }
}

/**
 * A student tried to open their S&O report before faculty released it —
 * distinct from AttemptOwnershipError (wrong student) or AttemptNotGradedError
 * (not graded yet). Matches the real product: "if the [View Results] button
 * does not appear, this means that your results have not been released yet
 * by the exam maker" (ExamSoft Portal: View Your Exam Results).
 */
export class ResultsNotReleasedError extends Error {
  constructor(attemptId: string) {
    super(`Results for attempt ${attemptId} have not been released yet`);
    this.name = "ResultsNotReleasedError";
  }
}

/**
 * Deterministic, clearly-labeled placeholder — NOT real external data, see
 * docs/EXAMPLIFY_ARCHITECTURE_REFERENCE.md's scope boundary and
 * benchmarks.ts's identical pattern. Only shown for BENCHMARK exams,
 * matching the real product's "national average (if available)" — a
 * STANDARD exam has no comparison data of any kind to show, real or
 * simulated.
 */
function seededSimulatedAverage(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return 65 + (hash % 2000) / 100;
}

export interface ReportingStudentRow {
  attemptId: string;
  studentId: string;
  studentName: string;
  percentCorrect: number | null;
  totalPoints: number;
  maxPoints: number;
  isGraded: boolean;
  resultsReleasedAt: Date | null;
}

export interface ExamReportingOverview {
  examId: string;
  examTitle: string;
  maxPoints: number;
  students: ReportingStudentRow[];
  classAveragePercent: number | null;
  lowScorePercent: number | null;
  highScorePercent: number | null;
  /** One bucket per 10-point band, 0-9 through 90-100, count of graded students in each. */
  histogram: { band: string; count: number }[];
  simulatedNationalAveragePercent: number | null;
  linkedCourseNames: string[];
}

/**
 * The actual data fetch, deliberately NOT exported. It still calls
 * assertFacultyAssignedToCourse (correct, real scoping for a FACULTY actor;
 * a no-op for everyone else — see that function's own docstring), but that
 * alone is NOT sufficient authorization, since it does nothing to stop a
 * STUDENT: the shape returned here always includes every student's name and
 * score, so every caller in this file is responsible for a coarser role
 * check (or an explicit, independently-verified ownership check) BEFORE
 * calling this. See getExamReportingOverview and getStudentReportDetail
 * below for the two legitimate ways in.
 */
async function fetchReportingOverview(
  institutionId: string,
  actor: { id: string; role: Role },
  examId: string
): Promise<ExamReportingOverview> {
  const db = forTenant(institutionId);

  const exam = await db.exam.findFirst({
    where: { id: examId },
    include: {
      versions: {
        where: { isActive: true },
        take: 1,
        include: {
          examQuestions: { select: { points: true } },
          examAttempts: {
            where: { status: { in: ["SUBMITTED", "GRADED"] } },
            include: { student: true, answers: true, submission: true },
          },
        },
      },
      linkedAsCopy: { include: { sourceExam: { include: { course: true } } } },
      linkedAsSource: { include: { linkedExam: { include: { course: true } } } },
    },
  });
  if (!exam) {
    throw new ExamNotFoundError(examId);
  }
  await assertFacultyAssignedToCourse(institutionId, actor, exam.courseId);

  const version = exam.versions[0];
  const maxPoints = version?.examQuestions.reduce((sum, q) => sum + q.points, 0) ?? 0;
  const attempts = version?.examAttempts ?? [];

  const students: ReportingStudentRow[] = attempts.map((a) => {
    const totalPoints = a.answers.reduce((sum, ans) => sum + (ans.pointsAwarded ?? 0), 0);
    const isGraded = a.status === "GRADED";
    return {
      attemptId: a.id,
      studentId: a.studentId,
      studentName: a.student.name,
      percentCorrect: isGraded && maxPoints > 0 ? (totalPoints / maxPoints) * 100 : null,
      totalPoints,
      maxPoints,
      isGraded,
      resultsReleasedAt: a.submission?.resultsReleasedAt ?? null,
    };
  });

  const graded = attempts.filter((a) => a.status === "GRADED");
  const classAveragePercent = averageScorePercent(graded, maxPoints);
  const gradedPercents = students.filter((s) => s.percentCorrect !== null).map((s) => s.percentCorrect as number);
  const lowScorePercent = gradedPercents.length > 0 ? Math.min(...gradedPercents) : null;
  const highScorePercent = gradedPercents.length > 0 ? Math.max(...gradedPercents) : null;

  const histogram = Array.from({ length: 10 }, (_, i) => {
    const bandStart = i * 10;
    const band = i === 9 ? "90-100" : `${bandStart}-${bandStart + 9}`;
    const count = gradedPercents.filter((p) => (i === 9 ? p >= 90 : p >= bandStart && p < bandStart + 10)).length;
    return { band, count };
  });

  const linkedCourseNames: string[] = [];
  if (exam.linkedAsCopy) {
    linkedCourseNames.push(exam.linkedAsCopy.sourceExam.course.name);
  }
  for (const link of exam.linkedAsSource) {
    linkedCourseNames.push(link.linkedExam.course.name);
  }

  const isBenchmarkFamily = exam.kind === "BENCHMARK" || Boolean(exam.linkedAsCopy);

  return {
    examId: exam.id,
    examTitle: exam.title,
    maxPoints,
    students,
    classAveragePercent,
    lowScorePercent,
    highScorePercent,
    histogram,
    simulatedNationalAveragePercent: isBenchmarkFamily ? seededSimulatedAverage(examId) : null,
    linkedCourseNames,
  };
}

/**
 * The Reporting tab's "Students" list + "Summary" data in one call — real
 * throughout (class average, histogram, low/high all computed from this
 * exam's own graded attempts). "Combined Reporting" (the real product's
 * "Linked Assessment" notification) is handled the same way
 * benchmarks.ts's Combined Report already does: if this exam is itself a
 * linked copy OR a benchmark source, linkedCourseNames lists every course
 * in the group so the Reporting page can show the same notification.
 *
 * FACULTY/ADMIN ONLY — this returns every student's name and score, so it
 * gates on the "grade":"grade" action (assigning/managing grades), not the
 * coarser "grade":"read" that STUDENT also holds for their own result. A
 * previous version of this function used "read" here, which let any
 * authenticated student pull any exam's full class roster — see
 * getStudentReportDetail below for the actual, ownership-scoped path a
 * student uses to see their own result.
 */
export async function getExamReportingOverview(
  institutionId: string,
  actor: { id: string; role: Role },
  examId: string
): Promise<ExamReportingOverview> {
  assertCan(actor.role, "grade", "grade");
  return fetchReportingOverview(institutionId, actor, examId);
}

export interface StudentReportDetail {
  attemptId: string;
  studentName: string;
  studentPercent: number;
  classAveragePercent: number | null;
  simulatedNationalAveragePercent: number | null;
  rank: number;
  totalGradedStudents: number;
  breakdown: { prompt: string; maxPoints: number; pointsAwarded: number | null }[];
  previousAttemptId: string | null;
  nextAttemptId: string | null;
}

/**
 * The S&O (Individual Strengths & Opportunities) report for one student.
 * Real: score, class average, rank/percentile, per-question breakdown.
 * "Category Performance" from the reference is deliberately NOT
 * reproduced — this app has no question-category field, and fabricating
 * categories to fill that section would misrepresent real data as
 * meaningful groupings. The per-question breakdown below is the honest,
 * more granular equivalent this app actually has.
 *
 * Two legitimate callers, two different checks — this is the ExamSoft
 * Portal's real "View Your Exam Results" split: faculty/admin can open any
 * student's report in a course they're scoped to (unchanged from before);
 * a STUDENT may only ever open their OWN attempt, and only once
 * resultsReleasedAt is actually set ("if the [View Results] button does
 * not appear, this means that your results have not been released yet by
 * the exam maker"). Previous/Next navigation across the roster is a
 * faculty-only affordance — a student's own report never exposes a
 * classmate's attemptId to browse into.
 */
export async function getStudentReportDetail(
  institutionId: string,
  actor: { id: string; role: Role },
  examId: string,
  attemptId: string
): Promise<StudentReportDetail> {
  if (actor.role === "STUDENT") {
    const db = forTenant(institutionId);
    const ownAttempt = await db.examAttempt.findFirst({
      where: { id: attemptId },
      select: { studentId: true, submission: { select: { resultsReleasedAt: true } }, examVersion: { select: { examId: true } } },
    });
    if (!ownAttempt || ownAttempt.examVersion.examId !== examId) {
      throw new AttemptNotGradedError(attemptId);
    }
    if (ownAttempt.studentId !== actor.id) {
      throw new AttemptOwnershipError(attemptId);
    }
    if (!ownAttempt.submission?.resultsReleasedAt) {
      throw new ResultsNotReleasedError(attemptId);
    }
  } else {
    assertCan(actor.role, "grade", "grade");
  }

  const overview = await fetchReportingOverview(institutionId, actor, examId);
  const sorted = [...overview.students]
    .filter((s) => s.isGraded)
    .sort((a, b) => (b.percentCorrect ?? 0) - (a.percentCorrect ?? 0));
  const index = sorted.findIndex((s) => s.attemptId === attemptId);
  if (index === -1) {
    throw new AttemptNotGradedError(attemptId);
  }
  const row = sorted[index];
  const isStudentCaller = actor.role === "STUDENT";

  const db = forTenant(institutionId);
  const attempt = await db.examAttempt.findFirst({
    where: { id: attemptId },
    include: {
      answers: true,
      examVersion: { include: { examQuestions: { include: { questionVersion: true }, orderBy: { order: "asc" } } } },
    },
  });
  if (!attempt) {
    throw new AttemptNotGradedError(attemptId);
  }
  const answersByQuestion = new Map(attempt.answers.map((a) => [a.examQuestionId, a]));
  const breakdown = attempt.examVersion.examQuestions.map((eq) => ({
    prompt: eq.questionVersion.prompt,
    maxPoints: eq.points,
    pointsAwarded: answersByQuestion.get(eq.id)?.pointsAwarded ?? null,
  }));

  return {
    attemptId,
    studentName: row.studentName,
    studentPercent: row.percentCorrect ?? 0,
    classAveragePercent: overview.classAveragePercent,
    simulatedNationalAveragePercent: overview.simulatedNationalAveragePercent,
    rank: index + 1,
    totalGradedStudents: sorted.length,
    breakdown,
    previousAttemptId: isStudentCaller || index === 0 ? null : sorted[index - 1].attemptId,
    nextAttemptId: isStudentCaller || index >= sorted.length - 1 ? null : sorted[index + 1].attemptId,
  };
}

/**
 * "Release Results" — Release Now only (real: stamps resultsReleasedAt on
 * each selected student's Submission). The reference's "Future Date"
 * scheduling option is not implemented: no background job scheduler
 * exists in this project to act on a future timestamp (same limitation
 * already documented for ExamDownloadGate's remoteDeletionAt).
 */
export async function releaseResults(
  institutionId: string,
  actor: { id: string; role: Role },
  examId: string,
  attemptIds: string[]
) {
  assertCan(actor.role, "grade", "grade");
  if (attemptIds.length === 0) {
    return;
  }

  const db = forTenant(institutionId);
  const exam = await db.exam.findFirst({ where: { id: examId } });
  if (!exam) {
    throw new ExamNotFoundError(examId);
  }
  await assertFacultyAssignedToCourse(institutionId, actor, exam.courseId);

  // Submission carries no institutionId of its own (see tenant-db.ts) — the
  // nested attempt.examVersion.examId filter is what actually confines
  // this update to the already institution-verified exam above, closing
  // the cross-tenant gap an unscoped updateMany(attemptId in [...]) would
  // otherwise leave open.
  const now = new Date();
  await db.submission.updateMany({
    where: { attemptId: { in: attemptIds }, attempt: { examVersion: { examId } } },
    data: { resultsReleasedAt: now },
  });

  await logAudit({
    institutionId,
    actorUserId: actor.id,
    action: AUDIT_ACTIONS.resultsRelease,
    resourceType: "exam",
    resourceId: examId,
    result: "SUCCESS",
    metadata: { attemptIds, count: attemptIds.length },
  });
}
