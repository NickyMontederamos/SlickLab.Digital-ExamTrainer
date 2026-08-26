import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError } from "../rbac";
import { CourseAccessDeniedError } from "../courses";
import { forPlatform } from "../tenant-db";
import { createQuestion } from "../questions";
import { addExamQuestion, createExam, publishExam } from "../exams";
import { saveAnswers, startAttempt, submitAttempt, AttemptOwnershipError } from "../attempts";
import { gradeAnswer } from "../grading";
import { getExamReportingOverview, getStudentReportDetail, releaseResults, ResultsNotReleasedError } from "../reporting";

/**
 * Regression coverage for the fix to a real, previously-shipped bug:
 * getExamReportingOverview/getStudentReportDetail/releaseResults gated on
 * "grade":"read" (which every STUDENT holds, for reading their own result)
 * instead of the faculty-tier "grade":"grade" action, and relied on
 * assertFacultyAssignedToCourse, which is a documented no-op for non-FACULTY
 * roles. Net effect before this fix: any authenticated student could load
 * ANY exam's full class roster and scores, including a classmate's
 * individual report, by navigating to the URL directly. This file did not
 * exist before that fix — see reporting.ts's docstrings for the design.
 */
describe("reporting.ts authorization", () => {
  const runId = Math.random().toString(36).slice(2, 10);
  let institutionA: { id: string };
  let courseA: { id: string };
  let faculty: { id: string };
  let unassignedFaculty: { id: string };
  let studentA: { id: string };
  let studentB: { id: string };
  let examId: string;
  let examQuestionId: string;
  let attemptAId: string;

  beforeAll(async () => {
    const platform = forPlatform();
    institutionA = await platform.institution.create({
      data: { name: `Tenant A ${runId}`, slug: `reporting-tenant-a-${runId}` },
    });
    courseA = await platform.course.create({
      data: { institutionId: institutionA.id, code: "LAW601", name: "Evidence", academicYear: "2026-2027" },
    });
    faculty = await platform.user.create({
      data: { institutionId: institutionA.id, email: `reporting-faculty-${runId}@test.local`, name: "Faculty", role: "FACULTY", passwordHash: "x" },
    });
    await platform.courseFaculty.create({ data: { institutionId: institutionA.id, courseId: courseA.id, userId: faculty.id } });
    unassignedFaculty = await platform.user.create({
      data: { institutionId: institutionA.id, email: `reporting-unassigned-${runId}@test.local`, name: "Unassigned", role: "FACULTY", passwordHash: "x" },
    });
    studentA = await platform.user.create({
      data: { institutionId: institutionA.id, email: `reporting-student-a-${runId}@test.local`, name: "Student A", role: "STUDENT", passwordHash: "x" },
    });
    studentB = await platform.user.create({
      data: { institutionId: institutionA.id, email: `reporting-student-b-${runId}@test.local`, name: "Student B", role: "STUDENT", passwordHash: "x" },
    });
    await platform.enrollment.create({ data: { institutionId: institutionA.id, courseId: courseA.id, userId: studentA.id } });

    const { exam } = await createExam(institutionA.id, { id: faculty.id, role: "FACULTY" }, {
      courseId: courseA.id,
      title: "Reporting Auth Test Exam",
      timeLimitMinutes: 60,
    });
    examId = exam.id;

    const { question } = await createQuestion(institutionA.id, { id: faculty.id, role: "FACULTY" }, {
      courseId: courseA.id,
      type: "MULTIPLE_CHOICE",
      prompt: "Pick the correct choice.",
      choices: [{ id: "0", text: "Right" }, { id: "1", text: "Wrong" }],
      correctAnswer: { choiceIds: ["0"] },
      points: 2,
    });
    const eq = await addExamQuestion(institutionA.id, { id: faculty.id, role: "FACULTY" }, { examId, questionId: question.id, points: 2 });
    examQuestionId = eq.id;

    await publishExam(institutionA.id, { id: faculty.id, role: "FACULTY" }, examId);

    const attemptA = await startAttempt(institutionA.id, { id: studentA.id, role: "STUDENT" }, examId);
    attemptAId = attemptA.id;
    await saveAnswers(institutionA.id, { id: studentA.id, role: "STUDENT" }, attemptAId, [
      { examQuestionId, responseJson: { choiceIds: ["0"] } },
    ]);
    await submitAttempt(institutionA.id, { id: studentA.id, role: "STUDENT" }, attemptAId);
    const answer = await platform.examAnswer.findFirstOrThrow({ where: { attemptId: attemptAId, examQuestionId } });
    await gradeAnswer(institutionA.id, { id: faculty.id, role: "FACULTY" }, answer.id, 2);
  });

  afterAll(async () => {
    const platform = forPlatform();
    await platform.submission.deleteMany({ where: { attempt: { institutionId: institutionA.id } } });
    await platform.examAnswer.deleteMany({ where: { attempt: { institutionId: institutionA.id } } });
    await platform.examAttempt.deleteMany({ where: { institutionId: institutionA.id } });
    await platform.examQuestion.deleteMany({ where: { examVersion: { exam: { institutionId: institutionA.id } } } });
    await platform.examVersion.deleteMany({ where: { exam: { institutionId: institutionA.id } } });
    await platform.exam.deleteMany({ where: { institutionId: institutionA.id } });
    await platform.questionVersion.deleteMany({ where: { question: { institutionId: institutionA.id } } });
    await platform.question.deleteMany({ where: { institutionId: institutionA.id } });
    await platform.enrollment.deleteMany({ where: { institutionId: institutionA.id } });
    await platform.courseFaculty.deleteMany({ where: { institutionId: institutionA.id } });
    await platform.user.deleteMany({ where: { institutionId: institutionA.id } });
    await platform.course.deleteMany({ where: { institutionId: institutionA.id } });
    await platform.institution.deleteMany({ where: { id: institutionA.id } });
  });

  describe("getExamReportingOverview — the class roster", () => {
    it("refuses a STUDENT outright, even one enrolled in the course", async () => {
      await expect(
        getExamReportingOverview(institutionA.id, { id: studentA.id, role: "STUDENT" }, examId)
      ).rejects.toThrow(ForbiddenError);
    });

    it("refuses a FACULTY member who isn't assigned to the course", async () => {
      await expect(
        getExamReportingOverview(institutionA.id, { id: unassignedFaculty.id, role: "FACULTY" }, examId)
      ).rejects.toThrow(CourseAccessDeniedError);
    });

    it("lets the assigned faculty member see the roster, including the graded student", async () => {
      const overview = await getExamReportingOverview(institutionA.id, { id: faculty.id, role: "FACULTY" }, examId);
      expect(overview.students).toHaveLength(1);
      expect(overview.students[0].studentId).toBe(studentA.id);
      expect(overview.students[0].percentCorrect).toBe(100);
    });
  });

  describe("getStudentReportDetail — one student's S&O report", () => {
    it("refuses the owning student before results are released", async () => {
      await expect(
        getStudentReportDetail(institutionA.id, { id: studentA.id, role: "STUDENT" }, examId, attemptAId)
      ).rejects.toThrow(ResultsNotReleasedError);
    });

    it("refuses a DIFFERENT student even after release — the exact original exploit", async () => {
      await releaseResults(institutionA.id, { id: faculty.id, role: "FACULTY" }, examId, [attemptAId]);
      await expect(
        getStudentReportDetail(institutionA.id, { id: studentB.id, role: "STUDENT" }, examId, attemptAId)
      ).rejects.toThrow(AttemptOwnershipError);
    });

    it("lets the owning student see their own released report, with no Previous/Next into another student", async () => {
      const report = await getStudentReportDetail(institutionA.id, { id: studentA.id, role: "STUDENT" }, examId, attemptAId);
      expect(report.attemptId).toBe(attemptAId);
      expect(report.studentPercent).toBe(100);
      expect(report.previousAttemptId).toBeNull();
      expect(report.nextAttemptId).toBeNull();
    });

    it("still lets the assigned faculty member browse any student's report in their course", async () => {
      const report = await getStudentReportDetail(institutionA.id, { id: faculty.id, role: "FACULTY" }, examId, attemptAId);
      expect(report.attemptId).toBe(attemptAId);
    });
  });

  describe("releaseResults", () => {
    it("refuses a STUDENT outright", async () => {
      await expect(
        releaseResults(institutionA.id, { id: studentA.id, role: "STUDENT" }, examId, [attemptAId])
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
