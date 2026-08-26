import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import { ExamEntryGate } from "@/components/ExamEntryGate";
import { ExamDownloadGate } from "@/components/ExamDownloadGate";
import { AssessmentPasswordField, UniversalResumeCodeField } from "@/components/PostAssessmentSettingsFields";
import { DuplicateAssessmentModal } from "@/components/DuplicateAssessmentModal";
import {
  addExamQuestion,
  addExamQuestions,
  deleteExam,
  ExamNotFoundError,
  getExam,
  publishExam,
  QuestionNotFoundError,
  updatePostAssessmentSettings,
  removeExamQuestion,
  updateExam,
} from "@/lib/exams";
import { duplicateBenchmarkExam, SourceExamNotBenchmarkError, TargetIsBenchmarkBankError } from "@/lib/benchmarks";
import { listCoursesForUser } from "@/lib/courses";
import { listQuestionsForCourse } from "@/lib/questions";
import { importQuestionsFromCsv, QuestionImportValidationError } from "@/lib/question-import";
import {
  bookAttempt,
  findAttemptForStudent,
  ScheduledTimeOutOfWindowError,
  validateAndRecordDownload,
} from "@/lib/attempts";
import { beginAttemptAction, checkProctorApprovalAction, requestProctorApprovalAction } from "./actions";
import { Alert, Badge, Button, Card, EmptyState, LinkButton, PageHeader, Section, inputClassName, labelClassName } from "@/components/ui";

function formatWindow(from: Date | null, until: Date | null): string | null {
  if (!from && !until) return null;
  const fmt = (d: Date) => d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  if (from && until) return `${fmt(from)} – ${fmt(until)}`;
  if (from) return `Opens ${fmt(from)}`;
  return `Closes ${fmt(until!)}`;
}

/** `datetime-local` inputs need "YYYY-MM-DDTHH:mm" in the browser's local time, not an ISO string with a timezone. */
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function ExamBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{
    importError?: string;
    imported?: string;
    bulkError?: string;
    bookingError?: string;
    duplicateError?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.institutionId) {
    redirect("/login");
  }

  const { examId } = await params;
  const { importError, imported, bulkError, bookingError, duplicateError } = await searchParams;
  const institutionId = session.user.institutionId;

  let exam: Awaited<ReturnType<typeof getExam>>;
  try {
    exam = await getExam(institutionId, session.user, examId);
  } catch (error) {
    if (error instanceof ExamNotFoundError) {
      notFound();
    }
    throw error;
  }

  const version = exam.versions[0];
  const isDraft = exam.status === "DRAFT";

  if (session.user.role === "STUDENT") {
    const myAttempt = version ? await findAttemptForStudent(institutionId, session.user, version.id) : null;
    const windowLabel = version ? formatWindow(version.availableFrom, version.availableUntil) : null;
    const hasWindow = Boolean(version?.availableFrom || version?.availableUntil);
    const scheduledForLabel = myAttempt?.scheduledFor
      ? myAttempt.scheduledFor.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : null;

    async function confirmBookingAction(formData: FormData) {
      "use server";
      const authSession = await auth();
      if (!authSession?.user?.institutionId) {
        redirect("/login");
      }
      const scheduledForRaw = String(formData.get("scheduledFor") ?? "");
      const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw) : undefined;

      try {
        await bookAttempt(authSession.user.institutionId, authSession.user, examId, scheduledFor);
      } catch (err) {
        if (err instanceof ScheduledTimeOutOfWindowError) {
          redirect(`/exams/${examId}?bookingError=${encodeURIComponent(err.message)}`);
        }
        throw err;
      }
      revalidatePath(`/exams/${examId}`);
    }

    async function validateDownloadPasswordAction(password: string): Promise<{ ok: boolean; error?: string }> {
      "use server";
      const authSession = await auth();
      if (!authSession?.user?.institutionId || !myAttempt) {
        return { ok: false, error: "Sign in again and retry." };
      }
      try {
        await validateAndRecordDownload(authSession.user.institutionId, authSession.user, myAttempt.id, password);
        revalidatePath(`/exams/${examId}`);
        return { ok: true };
      } catch (err) {
        if (err instanceof Error) {
          return { ok: false, error: err.message };
        }
        throw err;
      }
    }

    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
        <PageHeader
          backHref={`/courses/${exam.courseId}/exams`}
          backLabel="Exams"
          title={exam.title}
          subtitle={version && `${version.timeLimitMinutes} minutes · ${version.examQuestions.length} question(s)`}
        />

        {bookingError && <Alert tone="error">{bookingError}</Alert>}

        {!myAttempt && (
          <Card className="flex flex-col gap-4">
            <div>
              <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">Book This Exam</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Available: {windowLabel ?? "No fixed window — book anytime"}</p>
            </div>
            <form action={confirmBookingAction} className="flex flex-col gap-3">
              {hasWindow && (
                <label className={labelClassName}>
                  Pick a time within the window
                  <input
                    name="scheduledFor"
                    type="datetime-local"
                    required
                    min={version?.availableFrom ? toDatetimeLocalValue(version.availableFrom) : undefined}
                    max={version?.availableUntil ? toDatetimeLocalValue(version.availableUntil) : undefined}
                    className={inputClassName}
                  />
                </label>
              )}
              <Button type="submit" className="self-start">
                Confirm Booking
              </Button>
            </form>
          </Card>
        )}
        {myAttempt?.status === "NOT_STARTED" && (
          <ExamDownloadGate
            attemptId={myAttempt.id}
            examTitle={exam.title}
            timeLimitMinutes={version?.timeLimitMinutes ?? 60}
            questionCount={version?.examQuestions.length ?? 0}
            totalPoints={version?.examQuestions.reduce((sum, eq) => sum + eq.points, 0) ?? 0}
            downloadStartAt={version?.downloadStartAt ? version.downloadStartAt.getTime() : null}
            downloadEndAt={version?.downloadEndAt ? version.downloadEndAt.getTime() : null}
            maxDownloads={version?.maxDownloads ?? null}
            downloadCount={myAttempt.downloadCount}
            remoteDeletionAt={version?.remoteDeletionAt ? version.remoteDeletionAt.getTime() : null}
            validateDownloadAction={validateDownloadPasswordAction}
          >
            <ExamEntryGate
              attemptId={myAttempt.id}
              examTitle={exam.title}
              windowLabel={windowLabel}
              scheduledForLabel={scheduledForLabel}
              confirmationCode={myAttempt.id}
              beginAttemptAction={beginAttemptAction}
              requestProctorApprovalAction={requestProctorApprovalAction}
              checkProctorApprovalAction={checkProctorApprovalAction}
            />
          </ExamDownloadGate>
        )}
        {myAttempt?.status === "IN_PROGRESS" && (
          <LinkButton href={`/attempts/${myAttempt.id}`} className="justify-center">
            Continue Exam
          </LinkButton>
        )}
        {myAttempt?.status === "INTERRUPTED" && <Alert tone="warning">Your exam is paused pending faculty review.</Alert>}
        {(myAttempt?.status === "SUBMITTED" || myAttempt?.status === "GRADED" || myAttempt?.status === "TERMINATED") && (
          <LinkButton href={`/attempts/${myAttempt.id}/result`} variant="secondary" className="justify-center">
            View Result
          </LinkButton>
        )}
      </main>
    );
  }

  const canEdit = can(session.user.role, "exam", "update") && isDraft;
  const canPublish = can(session.user.role, "exam", "publish") && isDraft;
  const canDelete = can(session.user.role, "exam", "delete") && isDraft;
  // Admin-only (exam_attempt:"delete" — rbac.ts): force-delete a PUBLISHED
  // exam too, cascading every attempt/answer/event/submission with it. Kept
  // separate from canDelete above so FACULTY (who shares exam:"delete")
  // never gets this — deleteExam() itself also enforces this, this is only
  // the UI gate.
  const canForceDelete = !isDraft && can(session.user.role, "exam_attempt", "delete");
  const questionsLocked = Boolean(exam.linkedAsCopy);
  const canEditQuestions = canEdit && !questionsLocked;
  const hasBenchmarkPostings = exam.linkedAsSource.length > 0;
  const canDuplicate = exam.kind === "BENCHMARK" && exam.status === "PUBLISHED" && can(session.user.role, "exam", "create");
  const duplicateTargets = canDuplicate
    ? (await listCoursesForUser(institutionId, session.user))
        .filter((c) => !c.isBenchmarkBank)
        .map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))
    : [];

  const availableQuestions = canEditQuestions
    ? await listQuestionsForCourse(institutionId, session.user, exam.courseId)
    : [];
  const usedQuestionIds = new Set(version?.examQuestions.map((eq) => eq.questionId) ?? []);
  const unusedQuestions = availableQuestions.filter((q) => !usedQuestionIds.has(q.id));

  async function updateExamAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }

    const title = String(formData.get("title") ?? "").trim();
    const timeLimitMinutes = Number(formData.get("timeLimitMinutes") ?? 60);
    const availableFromRaw = String(formData.get("availableFrom") ?? "");
    const availableUntilRaw = String(formData.get("availableUntil") ?? "");

    await updateExam(authSession.user.institutionId, authSession.user, examId, {
      title,
      timeLimitMinutes,
      availableFrom: availableFromRaw ? new Date(availableFromRaw) : undefined,
      availableUntil: availableUntilRaw ? new Date(availableUntilRaw) : undefined,
    });
    revalidatePath(`/exams/${examId}`);
  }

  async function removeQuestionAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }

    const examQuestionId = String(formData.get("examQuestionId") ?? "");
    if (!examQuestionId) return;

    await removeExamQuestion(authSession.user.institutionId, authSession.user, examId, examQuestionId);
    revalidatePath(`/exams/${examId}`);
  }

  async function deleteExamAction() {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }

    await deleteExam(authSession.user.institutionId, authSession.user, examId);
    redirect(`/courses/${exam.courseId}/exams`);
  }

  async function addQuestionAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }

    const questionId = String(formData.get("questionId") ?? "");
    const points = Number(formData.get("points") ?? 1);
    if (!questionId) return;

    await addExamQuestion(authSession.user.institutionId, authSession.user, { examId, questionId, points });
    revalidatePath(`/exams/${examId}`);
  }

  async function addSelectedQuestionsAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }

    const questionIds = formData.getAll("questionIds").map(String).filter(Boolean);
    if (questionIds.length === 0) return;

    try {
      await addExamQuestions(authSession.user.institutionId, authSession.user, examId, questionIds);
    } catch (err) {
      if (err instanceof QuestionNotFoundError) {
        redirect(`/exams/${examId}?bulkError=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }
    revalidatePath(`/exams/${examId}`);
  }

  async function importCsvIntoExamAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    const actorId = authSession?.user?.id;
    const actorInstitutionId = authSession?.user?.institutionId;
    const actorRole = authSession?.user?.role;
    if (!actorId || !actorInstitutionId || !actorRole) {
      redirect("/login");
    }

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      redirect(`/exams/${examId}?importError=${encodeURIComponent("Choose a CSV file first")}`);
    }

    const text = await file.text();
    let result: { imported: number };
    try {
      result = await importQuestionsFromCsv(
        actorInstitutionId,
        { id: actorId, role: actorRole },
        exam.courseId,
        text,
        examId
      );
    } catch (err) {
      if (err instanceof QuestionImportValidationError) {
        const summary = err.errors.map((e) => `Row ${e.row}: ${e.message}`).join(" · ");
        redirect(`/exams/${examId}?importError=${encodeURIComponent(summary)}`);
      }
      throw err;
    }

    revalidatePath(`/exams/${examId}`);
    redirect(`/exams/${examId}?imported=${result.imported}`);
  }

  async function updatePostSettingsAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }

    const assessmentPassword = String(formData.get("assessmentPassword") ?? "").trim();
    const universalResumeCode = String(formData.get("universalResumeCode") ?? "").trim();
    const downloadStartAtRaw = String(formData.get("downloadStartAt") ?? "");
    const downloadEndAtRaw = String(formData.get("downloadEndAt") ?? "");
    const maxDownloadsRaw = String(formData.get("maxDownloads") ?? "");
    const remoteDeletionAtRaw = String(formData.get("remoteDeletionAt") ?? "");

    await updatePostAssessmentSettings(authSession.user.institutionId, authSession.user, examId, {
      assessmentPassword: assessmentPassword || undefined,
      universalResumeCode: universalResumeCode || undefined,
      downloadStartAt: downloadStartAtRaw ? new Date(downloadStartAtRaw) : undefined,
      downloadEndAt: downloadEndAtRaw ? new Date(downloadEndAtRaw) : undefined,
      maxDownloads: maxDownloadsRaw ? Number(maxDownloadsRaw) : undefined,
      remoteDeletionAt: remoteDeletionAtRaw ? new Date(remoteDeletionAtRaw) : undefined,
      pingAndRelease: formData.get("pingAndRelease") === "on",
      sendDownloadEndReminder: formData.get("sendDownloadEndReminder") === "on",
      sendUploadDeadlineReminder: formData.get("sendUploadDeadlineReminder") === "on",
    });
    revalidatePath(`/exams/${examId}`);
  }

  async function duplicateAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    const actorId = authSession?.user?.id;
    const actorInstitutionId = authSession?.user?.institutionId;
    const actorRole = authSession?.user?.role;
    if (!actorId || !actorInstitutionId || !actorRole) {
      redirect("/login");
    }

    const targetCourseId = String(formData.get("targetCourseId") ?? "");
    if (!targetCourseId) {
      redirect(`/exams/${examId}?duplicateError=${encodeURIComponent("Pick a course to assign this posting to")}`);
    }

    let linked;
    try {
      linked = await duplicateBenchmarkExam(actorInstitutionId, { id: actorId, role: actorRole }, {
        sourceExamId: examId,
        targetCourseId,
      });
    } catch (err) {
      if (err instanceof SourceExamNotBenchmarkError || err instanceof TargetIsBenchmarkBankError) {
        redirect(`/exams/${examId}?duplicateError=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect(`/exams/${linked.id}`);
  }

  async function publishAction() {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.institutionId) {
      redirect("/login");
    }

    await publishExam(authSession.user.institutionId, authSession.user, examId);
    revalidatePath(`/exams/${examId}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <PageHeader
        backHref={`/courses/${exam.courseId}/exams`}
        backLabel="Exams"
        title={exam.title}
        badge={<Badge tone={exam.status === "PUBLISHED" ? "green" : "gray"}>{exam.status}</Badge>}
        subtitle={version && `${version.timeLimitMinutes} minutes`}
        actions={
          <>
            {can(session.user.role, "grade", "read") && exam.status === "PUBLISHED" && (
              <LinkButton href={`/exams/${examId}/grading`} variant="secondary">
                Grading
              </LinkButton>
            )}
            {can(session.user.role, "grade", "read") && exam.status === "PUBLISHED" && (
              <LinkButton href={`/exams/${examId}/reporting`} variant="secondary">
                Reporting
              </LinkButton>
            )}
            {hasBenchmarkPostings && (
              <LinkButton href={`/exams/${examId}/benchmark-report`} variant="secondary">
                Combined Report
              </LinkButton>
            )}
            {canDuplicate && (
              <DuplicateAssessmentModal
                examTitle={exam.title}
                targetCourses={duplicateTargets}
                duplicateAction={duplicateAction}
                error={duplicateError}
              />
            )}
          </>
        }
      />

      {questionsLocked && (
        <Alert tone="info">
          This exam was duplicated from a Benchmark Assessment — its questions are shared with the source and can&apos;t
          be added or removed here.
        </Alert>
      )}

      {hasBenchmarkPostings && (
        <Section title="Manage your postings" description="Every course this Benchmark Assessment has been posted to, as a Linked Assessment.">
          <div className="flex flex-col gap-2">
            {exam.linkedAsSource.map((link) => (
              <Card key={link.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-900 dark:text-slate-100">{link.linkedExam.course.name}</span>
                <div className="flex items-center gap-2">
                  <Badge tone={link.linkedExam.status === "PUBLISHED" ? "green" : "gray"}>{link.linkedExam.status}</Badge>
                  <LinkButton href={`/exams/${link.linkedExam.id}`} variant="secondary" className="px-2.5 py-1 text-xs">
                    Manage posting
                  </LinkButton>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {imported && <Alert tone="success">Imported and attached {imported} question(s) to this exam.</Alert>}
      {importError && <Alert tone="error">Import failed — nothing was added: {importError}</Alert>}
      {bulkError && <Alert tone="error">Couldn&apos;t add the selected questions: {bulkError}</Alert>}

      {canEdit && version && (
        <Section title="Exam details">
          <Card>
            <form action={updateExamAction} className="flex flex-col gap-3">
              <label className={labelClassName}>
                Title
                <input name="title" required defaultValue={exam.title} className={inputClassName} />
              </label>
              <label className={labelClassName}>
                Time limit (minutes)
                <input
                  name="timeLimitMinutes"
                  type="number"
                  defaultValue={version.timeLimitMinutes}
                  className={inputClassName}
                />
              </label>
              <label className={labelClassName}>
                Available from (optional)
                <input
                  name="availableFrom"
                  type="datetime-local"
                  defaultValue={version.availableFrom ? toDatetimeLocalValue(version.availableFrom) : undefined}
                  className={inputClassName}
                />
              </label>
              <label className={labelClassName}>
                Available until (optional)
                <input
                  name="availableUntil"
                  type="datetime-local"
                  defaultValue={version.availableUntil ? toDatetimeLocalValue(version.availableUntil) : undefined}
                  className={inputClassName}
                />
              </label>
              <Button type="submit" variant="secondary" className="self-start">
                Save changes
              </Button>
            </form>
          </Card>
        </Section>
      )}

      {canEdit && version && (
        <div className="flex flex-col gap-4">
          <div className="border-b-4 border-slate-200 pb-2 dark:border-slate-800">
            <h2 className="text-sm font-bold uppercase tracking-wide text-brand-primary">Post Assessment Settings</h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ping &amp; Release and the email reminder toggles are stored but inert — this app has no email
            infrastructure to send a real reminder, and there&apos;s no meaningful offline/online distinction in a
            web app that already requires network to load at all.
          </p>

          <form action={updatePostSettingsAction} className="flex flex-col gap-5">
            <AssessmentPasswordField initialValue={version.assessmentPassword ?? ""} />
            <UniversalResumeCodeField initialValue={version.universalResumeCode ?? ""} />

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClassName}>
                Download Start
                <input
                  name="downloadStartAt"
                  type="datetime-local"
                  defaultValue={version.downloadStartAt ? toDatetimeLocalValue(version.downloadStartAt) : undefined}
                  className={inputClassName}
                />
              </label>
              <label className={labelClassName}>
                Download End
                <input
                  name="downloadEndAt"
                  type="datetime-local"
                  defaultValue={version.downloadEndAt ? toDatetimeLocalValue(version.downloadEndAt) : undefined}
                  className={inputClassName}
                />
              </label>
            </div>

            <label className={`${labelClassName} max-w-xs`}>
              Maximum Downloads
              <input
                name="maxDownloads"
                type="number"
                min={1}
                defaultValue={version.maxDownloads ?? ""}
                className={inputClassName}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClassName}>
                Remote Assessment Deletion (optional)
                <input
                  name="remoteDeletionAt"
                  type="datetime-local"
                  defaultValue={version.remoteDeletionAt ? toDatetimeLocalValue(version.remoteDeletionAt) : undefined}
                  className={inputClassName}
                />
              </label>
              <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" name="pingAndRelease" defaultChecked={version.pingAndRelease} />
                Ping &amp; Release (optional)
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" name="sendDownloadEndReminder" defaultChecked={version.sendDownloadEndReminder} />
                Send a reminder for the download end
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  name="sendUploadDeadlineReminder"
                  defaultChecked={version.sendUploadDeadlineReminder}
                />
                Send a reminder for the upload deadline
              </label>
            </div>

            <Button type="submit" variant="success" className="self-start">
              Save Post Assessment Settings
            </Button>
          </form>
        </div>
      )}

      <Section
        title={
          <>
            Questions ({version?.examQuestions.length ?? 0})
            {version && version.examQuestions.length > 0 && (
              <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                · {version.examQuestions.reduce((sum, eq) => sum + eq.points, 0)} pt(s) total
              </span>
            )}
          </>
        }
      >
        {(!version || version.examQuestions.length === 0) && <EmptyState>No questions added yet.</EmptyState>}
        <div className="flex flex-col gap-2">
          {version?.examQuestions.map((eq) => (
            <Card key={eq.id} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900 dark:text-slate-100">Q{eq.order + 1}</span>
                <span className="flex items-center gap-3">
                  <span className="text-slate-500 dark:text-slate-400">{eq.points} pt(s)</span>
                  {canEditQuestions && (
                    <form action={removeQuestionAction}>
                      <input type="hidden" name="examQuestionId" value={eq.id} />
                      <Button type="submit" variant="danger" className="px-2.5 py-1 text-xs">
                        Remove
                      </Button>
                    </form>
                  )}
                </span>
              </div>
              <p className="mt-1 text-slate-700 dark:text-slate-300">{eq.questionVersion.prompt}</p>
            </Card>
          ))}
        </div>
      </Section>

      {canEditQuestions && (
        <>
          <Section
            title="Import from CSV directly into this exam"
            description="Creates the questions in the course's reusable bank and attaches all of them to this exam in one step. All-or-nothing, same as the question bank's import."
          >
            <Card className="flex flex-col gap-3">
              <LinkButton href="/templates/question-bank-template.csv" download variant="secondary" className="self-start">
                Download the template
              </LinkButton>
              <form action={importCsvIntoExamAction} className="flex items-center gap-2">
                <input name="file" type="file" accept=".csv,text/csv" required className="flex-1 text-sm" />
                <Button type="submit" variant="secondary">
                  Import into exam
                </Button>
              </form>
            </Card>
          </Section>

          {unusedQuestions.length > 0 && (
            <Section title="Add multiple questions from the bank at once">
              <Card>
                <form action={addSelectedQuestionsAction} className="flex flex-col gap-2">
                  <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                    {unusedQuestions.map((q) => (
                      <label key={q.id} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" name="questionIds" value={q.id} className="mt-1" />
                        <span>
                          [{q.type}] {q.versions[0]?.prompt.slice(0, 80)} ({q.versions[0]?.points} pt(s) default)
                        </span>
                      </label>
                    ))}
                  </div>
                  <Button type="submit" className="self-start">
                    Add selected to exam
                  </Button>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Each question is added at its own default points.</p>
                </form>
              </Card>
            </Section>
          )}

          <Section title="Add one question with custom points">
            <Card>
              {availableQuestions.length === 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-slate-500 dark:text-slate-400">No questions in this course&apos;s bank yet.</p>
                  <LinkButton href={`/courses/${exam.courseId}/questions`} variant="secondary" className="px-2.5 py-1 text-xs">
                    Go to question bank
                  </LinkButton>
                </div>
              )}
              {availableQuestions.length > 0 && (
                <form action={addQuestionAction} className="flex flex-col gap-3">
                  <label className={labelClassName}>
                    Question
                    <select name="questionId" required className={inputClassName}>
                      {availableQuestions.map((q) => (
                        <option key={q.id} value={q.id} disabled={usedQuestionIds.has(q.id)}>
                          [{q.type}] {q.versions[0]?.prompt.slice(0, 60)}
                          {usedQuestionIds.has(q.id) ? " (already added)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClassName}>
                    Points
                    <input name="points" type="number" step="0.5" defaultValue={1} className={inputClassName} />
                  </label>
                  <Button type="submit" className="self-start">
                    Add to exam
                  </Button>
                </form>
              )}
            </Card>
          </Section>
        </>
      )}

      {canPublish && (
        <Card>
          <form action={publishAction}>
            <Button type="submit" variant="success">
              Publish exam
            </Button>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Freezes this version — no more edits to it once published (Phase 1 has no re-versioning yet).
            </p>
          </form>
        </Card>
      )}

      {canDelete && (
        <Card>
          <form action={deleteExamAction}>
            <Button type="submit" variant="danger">
              Delete exam
            </Button>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Safe while still a draft — no student can have an attempt against an unpublished exam.
            </p>
          </form>
        </Card>
      )}

      {canForceDelete && (
        <Card className="border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950">
          <h2 className="mb-2 text-sm font-semibold text-red-900 dark:text-red-300">Danger zone (admin only)</h2>
          <form action={deleteExamAction}>
            <Button type="submit" variant="danger">
              Force-delete this exam
            </Button>
            <p className="mt-2 text-xs text-red-800 dark:text-red-300">
              This exam has already been published — deleting it also erases every student&apos;s attempt, answers,
              integrity events, and submission record against it. This cannot be undone. Only use this for cleaning up
              test/demo data, not a real academic record.
            </p>
          </form>
        </Card>
      )}
    </main>
  );
}
