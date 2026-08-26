import type { Role } from "@prisma/client";
import { assertCan } from "./rbac";
import { forTenant } from "./tenant-db";
import { assertFacultyAssignedToCourse, CourseNotFoundError } from "./courses";
import { ExamNotFoundError } from "./exams";
import { averageScorePercent } from "./grading";
import { AUDIT_ACTIONS, logAudit } from "./audit";

export class SourceExamNotBenchmarkError extends Error {
  constructor(examId: string) {
    super(`Exam ${examId} is not a published Benchmark Assessment and cannot be duplicated`);
    this.name = "SourceExamNotBenchmarkError";
  }
}

export class TargetIsBenchmarkBankError extends Error {
  constructor(courseId: string) {
    super(`Course ${courseId} is a benchmark bank — duplicate into a live course instead`);
    this.name = "TargetIsBenchmarkBankError";
  }
}

/** Admin-only toggle — mirrors the real product's "Benchmark Course" designation. */
export async function setBenchmarkBank(
  institutionId: string,
  actor: { role: Role },
  courseId: string,
  isBenchmarkBank: boolean
) {
  assertCan(actor.role, "course", "update");

  const db = forTenant(institutionId);
  const course = await db.course.findFirst({ where: { id: courseId } });
  if (!course) {
    throw new CourseNotFoundError(courseId);
  }

  return db.course.update({ where: { id: courseId }, data: { isBenchmarkBank } });
}

/**
 * Every PUBLISHED BENCHMARK exam across every benchmark-bank course in the
 * institution — the catalog a faculty member picks from when posting to
 * their own live course. Deliberately institution-wide, not scoped to
 * assertFacultyAssignedToCourse: the benchmark bank is a shared catalog,
 * not a course a given faculty member necessarily teaches, and most
 * faculty aren't assigned to it. Without this, most faculty could never
 * see anything to duplicate.
 */
export async function listBenchmarkExamsForInstitution(institutionId: string, actor: { role: Role }) {
  assertCan(actor.role, "exam", "read");

  const db = forTenant(institutionId);
  return db.exam.findMany({
    where: { kind: "BENCHMARK", status: "PUBLISHED", course: { isBenchmarkBank: true } },
    include: {
      course: true,
      versions: { where: { isActive: true }, include: { examQuestions: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Duplicates a published Benchmark exam into a live course as a new DRAFT
 * STANDARD exam, sharing the exact same question/questionVersion rows (the
 * copy can never edit questions — see the lock check in exams.ts) and
 * recording the link for combined reporting. The new exam still requires
 * an explicit "Publish exam" click — this reuses the existing DRAFT/PUBLISH
 * state machine rather than a parallel auto-publish path.
 */
export async function duplicateBenchmarkExam(
  institutionId: string,
  actor: { id: string; role: Role },
  input: { sourceExamId: string; targetCourseId: string }
) {
  assertCan(actor.role, "exam", "create");

  const db = forTenant(institutionId);

  const source = await db.exam.findFirst({
    where: { id: input.sourceExamId },
    include: { versions: { where: { isActive: true }, include: { examQuestions: true }, take: 1 } },
  });
  if (!source || source.kind !== "BENCHMARK" || source.status !== "PUBLISHED") {
    throw new SourceExamNotBenchmarkError(input.sourceExamId);
  }
  const sourceVersion = source.versions[0];
  if (!sourceVersion) {
    throw new SourceExamNotBenchmarkError(input.sourceExamId);
  }

  const targetCourse = await db.course.findFirst({ where: { id: input.targetCourseId } });
  if (!targetCourse) {
    throw new CourseNotFoundError(input.targetCourseId);
  }
  if (targetCourse.isBenchmarkBank) {
    throw new TargetIsBenchmarkBankError(input.targetCourseId);
  }
  await assertFacultyAssignedToCourse(institutionId, actor, input.targetCourseId);

  const { exam: linkedExam } = await db.$transaction(async (tx) => {
    const exam = await tx.exam.create({
      data: {
        courseId: input.targetCourseId,
        title: source.title,
        status: "DRAFT",
        kind: "STANDARD",
        createdById: actor.id,
      } as never,
    });

    const version = await tx.examVersion.create({
      data: {
        examId: exam.id,
        versionNumber: 1,
        isActive: true,
        instructions: sourceVersion.instructions,
        timeLimitMinutes: sourceVersion.timeLimitMinutes,
        allowBacktracking: sourceVersion.allowBacktracking,
        randomizeQuestions: sourceVersion.randomizeQuestions,
        randomizeAnswers: sourceVersion.randomizeAnswers,
        calculatorAllowed: sourceVersion.calculatorAllowed,
        attachmentsAllowed: sourceVersion.attachmentsAllowed,
      },
    });

    // Shared, frozen question content — the copy points at the SAME
    // questionId/questionVersionId as the source, never its own copies.
    await Promise.all(
      sourceVersion.examQuestions.map((eq) =>
        tx.examQuestion.create({
          data: {
            examVersionId: version.id,
            questionId: eq.questionId,
            questionVersionId: eq.questionVersionId,
            order: eq.order,
            points: eq.points,
          },
        })
      )
    );

    await tx.linkedAssessment.create({
      data: {
        sourceExamId: source.id,
        linkedExamId: exam.id,
        createdById: actor.id,
      } as never,
    });

    return { exam };
  });

  await logAudit({
    institutionId,
    actorUserId: actor.id,
    action: AUDIT_ACTIONS.examDuplicate,
    resourceType: "exam",
    resourceId: linkedExam.id,
    result: "SUCCESS",
    metadata: { sourceExamId: source.id, targetCourseId: input.targetCourseId, title: source.title },
  });

  return linkedExam;
}

export interface BenchmarkReportRow {
  examId: string;
  courseId: string;
  courseName: string;
  gradedCount: number;
  averageScorePercent: number | null;
}

export interface BenchmarkCombinedReport {
  sourceExamId: string;
  sourceTitle: string;
  rows: BenchmarkReportRow[];
  combinedGradedCount: number;
  combinedAverageScorePercent: number | null;
  /**
   * NOT real external data — this app has no connection to ExamSoft's
   * actual national norms. A deterministic placeholder in a plausible band,
   * seeded from sourceExamId so it's stable across loads, shown for
   * demonstration purposes only. Never present this as real.
   */
  simulatedNationalAveragePercent: number;
}

function seededSimulatedAverage(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  // Band chosen to look like a plausible exam average, nothing more.
  return 65 + (hash % 2000) / 100;
}

/**
 * Combined reporting across every course a benchmark exam has been linked
 * into. The per-row and combined averages are REAL, computed from this
 * app's own grading data with the same formula getCourseExamSummaries
 * uses. simulatedNationalAveragePercent is explicitly not that — see its
 * docstring above.
 */
export async function getBenchmarkCombinedReport(
  institutionId: string,
  actor: { role: Role },
  sourceExamId: string
): Promise<BenchmarkCombinedReport> {
  // Cross-course aggregate data — faculty/admin only. STUDENT holds
  // "grade":"read" for their own single result, which is too coarse here.
  assertCan(actor.role, "grade", "grade");

  const db = forTenant(institutionId);

  const source = await db.exam.findFirst({ where: { id: sourceExamId } });
  if (!source) {
    throw new ExamNotFoundError(sourceExamId);
  }

  const links = await db.linkedAssessment.findMany({
    where: { sourceExamId },
    include: {
      linkedExam: {
        include: {
          course: true,
          versions: {
            where: { isActive: true },
            take: 1,
            include: {
              examQuestions: { select: { points: true } },
              examAttempts: {
                where: { status: "GRADED" },
                select: { answers: { select: { pointsAwarded: true } } },
              },
            },
          },
        },
      },
    },
  });

  const rows: BenchmarkReportRow[] = links.map(({ linkedExam }) => {
    const version = linkedExam.versions[0];
    const maxPoints = version?.examQuestions.reduce((sum, q) => sum + q.points, 0) ?? 0;
    const graded = version?.examAttempts ?? [];
    return {
      examId: linkedExam.id,
      courseId: linkedExam.courseId,
      courseName: linkedExam.course.name,
      gradedCount: graded.length,
      averageScorePercent: averageScorePercent(graded, maxPoints),
    };
  });

  const allGraded = links.flatMap(({ linkedExam }) => linkedExam.versions[0]?.examAttempts ?? []);
  const combinedMaxPoints = links.reduce(
    (max, { linkedExam }) =>
      Math.max(max, linkedExam.versions[0]?.examQuestions.reduce((sum, q) => sum + q.points, 0) ?? 0),
    0
  );

  return {
    sourceExamId,
    sourceTitle: source.title,
    rows,
    combinedGradedCount: allGraded.length,
    combinedAverageScorePercent: averageScorePercent(allGraded, combinedMaxPoints),
    simulatedNationalAveragePercent: seededSimulatedAverage(sourceExamId),
  };
}
