import type { Prisma, QuestionType } from "@prisma/client";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDemoInstitutionBranding } from "@/lib/branding";
import { AutosaveStatus } from "@/components/AutosaveStatus";
import { ExamCountdown } from "@/components/ExamCountdown";
import { ExamControlsMenu } from "@/components/ExamControlsMenu";
import { ExamToolbar } from "@/components/ExamToolbar";
import { ExamQuestionPager, type QuestionPagerMeta } from "@/components/ExamQuestionPager";
import { IntegrityMonitor } from "@/components/IntegrityMonitor";
import {
  AttemptNotFoundError,
  AttemptOwnershipError,
  attemptDeadline,
  getAttemptForTaking,
  saveAnswers,
  submitAttempt,
} from "@/lib/attempts";

// Autosave and submit each run a per-question DB transaction — see
// saveAnswers/finalizeAttempt's matching $transaction timeout for why a
// large exam needs headroom past Vercel's default function duration.
export const maxDuration = 60;
import { getWarningCount, InvalidResumeCodeError, resumeAttemptWithCode } from "@/lib/integrity";
import { seededShuffle } from "@/lib/shuffle";
import { recordIntegrityEventAction } from "./actions";
import { Alert, Badge, Button, Card, inputClassName, labelClassName } from "@/components/ui";

type AttemptView = Awaited<ReturnType<typeof getAttemptForTaking>>;
type ExamQuestionView = AttemptView["examVersion"]["examQuestions"][number];
type AnswerRow = AttemptView["answers"][number];
type AnswerShape = { choiceIds?: string[]; text?: string };

const SUBMIT_BUTTON_ID = "submit-exam-button";
const ANSWERS_FORM_ID = "exam-answers-form";

function parseAnswerFromForm(formData: FormData, examQuestionId: string, questionType: QuestionType): Prisma.InputJsonValue | null {
  const name = `answer_${examQuestionId}`;
  if (questionType === "MULTIPLE_CHOICE" || questionType === "TRUE_FALSE") {
    const value = formData.get(name);
    return value ? { choiceIds: [String(value)] } : null;
  }
  if (questionType === "MULTIPLE_RESPONSE") {
    const values = formData.getAll(name).map(String);
    return values.length > 0 ? { choiceIds: values } : null;
  }
  const text = formData.get(name);
  return text ? { text: String(text) } : null;
}

function readAnswersFromForm(examQuestions: ExamQuestionView[], formData: FormData) {
  return examQuestions
    .map((eq) => ({
      examQuestionId: eq.id,
      responseJson: parseAnswerFromForm(formData, eq.id, eq.question.type),
      isFlagged: formData.get(`flag_${eq.id}`) === "on",
    }))
    // A question with neither a response nor a flag has nothing worth
    // writing — this is what lets "flag it, come back later" work for a
    // question the student hasn't answered yet.
    .filter((a) => a.responseJson !== null || a.isFlagged);
}

const CHOICE_LETTERS = "ABCDEFGHIJ".split("");

/**
 * Pill-style choice rows with a lettered badge and a checkmark on the
 * selected one — matches PAGE TEMPLATE/Student Overview_Exam/MultipleChoice.jpg.
 * The pill border/background and the checkmark's visibility are pure CSS
 * (`has-checked:` / `hidden group-has-checked:block`), not JavaScript — the
 * native radio/checkbox still drives it, so clicking a different choice
 * updates the highlight immediately, before any Save Progress round trip,
 * unlike the "Currently Selected" text line above these rows (that one's
 * server-rendered text, so it only reflects the last-saved state, same
 * documented limitation as the Flagged badge elsewhere on this page).
 */
function ChoicePill({ letter, text, children }: { letter: string; text: string; children: React.ReactNode }) {
  return (
    <label className="group flex cursor-pointer items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition-colors hover:bg-slate-100 has-checked:border-brand-primary has-checked:bg-brand-primary/5 has-checked:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:has-checked:text-slate-100">
      {children}
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-current text-xs font-semibold">
        {letter}
      </span>
      <span className="flex-1">{text}</span>
      <svg viewBox="0 0 20 20" fill="currentColor" className="hidden h-4 w-4 flex-none text-brand-primary group-has-checked:block">
        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z" clipRule="evenodd" />
      </svg>
    </label>
  );
}

function renderInput(eq: ExamQuestionView, existingRow: AnswerRow | undefined, choices: { id: string; text: string }[]) {
  const existing = existingRow?.responseJson as AnswerShape | undefined;
  const name = `answer_${eq.id}`;

  if (eq.question.type === "MULTIPLE_CHOICE" || eq.question.type === "TRUE_FALSE") {
    const selected = existing?.choiceIds?.[0];
    const selectedLetters = choices
      .map((c, i) => (c.id === selected ? CHOICE_LETTERS[i] : null))
      .filter((l): l is string => l !== null);
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Currently Selected: {selectedLetters.length > 0 ? selectedLetters.join(", ") : "—"}
        </p>
        <div className="flex flex-col gap-2">
          {choices.map((c, i) => (
            <ChoicePill key={c.id} letter={CHOICE_LETTERS[i]} text={c.text}>
              <input type="radio" name={name} value={c.id} defaultChecked={c.id === selected} className="sr-only" />
            </ChoicePill>
          ))}
        </div>
      </div>
    );
  }
  if (eq.question.type === "MULTIPLE_RESPONSE") {
    const selectedIds = existing?.choiceIds ?? [];
    const selectedLetters = choices
      .map((c, i) => (selectedIds.includes(c.id) ? CHOICE_LETTERS[i] : null))
      .filter((l): l is string => l !== null);
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Currently Selected: {selectedLetters.length > 0 ? selectedLetters.join(", ") : "—"}
        </p>
        <div className="flex flex-col gap-2">
          {choices.map((c, i) => (
            <ChoicePill key={c.id} letter={CHOICE_LETTERS[i]} text={c.text}>
              <input type="checkbox" name={name} value={c.id} defaultChecked={selectedIds.includes(c.id)} className="sr-only" />
            </ChoicePill>
          ))}
        </div>
      </div>
    );
  }
  if (eq.question.type === "SHORT_ANSWER") {
    return <input name={name} defaultValue={existing?.text ?? ""} className={`w-full ${inputClassName}`} />;
  }
  return <textarea name={name} defaultValue={existing?.text ?? ""} rows={4} className={`w-full ${inputClassName}`} />;
}

export default async function TakeExamPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ resumeError?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.institutionId) {
    redirect("/login");
  }

  const { attemptId } = await params;
  const { resumeError } = await searchParams;
  const institutionId = session.user.institutionId;

  let attempt: AttemptView;
  try {
    attempt = await getAttemptForTaking(institutionId, session.user, attemptId);
  } catch (error) {
    if (error instanceof AttemptNotFoundError) {
      notFound();
    }
    if (error instanceof AttemptOwnershipError) {
      redirect("/dashboard");
    }
    throw error;
  }

  if (attempt.status === "INTERRUPTED") {
    async function resumeWithCodeAction(formData: FormData) {
      "use server";
      const authSession = await auth();
      if (!authSession?.user?.id || !authSession.user.institutionId) {
        redirect("/login");
      }

      const code = String(formData.get("code") ?? "").trim();
      try {
        await resumeAttemptWithCode(authSession.user.institutionId, authSession.user, attemptId, code);
      } catch (err) {
        if (err instanceof InvalidResumeCodeError) {
          redirect(`/attempts/${attemptId}?resumeError=${encodeURIComponent(err.message)}`);
        }
        throw err;
      }
      revalidatePath(`/attempts/${attemptId}`);
    }

    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{attempt.examVersion.exam.title}</h1>
        <Alert tone="warning">
          Your exam was paused after repeated warnings (leaving the window or exiting fullscreen). A faculty member
          will review your session — you&apos;ll be notified once it&apos;s resolved. Your answers so far are saved.
        </Alert>
        {attempt.examVersion.universalResumeCode && (
          <Card className="flex flex-col gap-3">
            <div>
              <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Have a resume code?</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                If your instructor gave you a resume code (e.g. after an outage affecting multiple students), enter
                it here to continue without waiting for individual review.
              </p>
            </div>
            {resumeError && <Alert tone="error">{resumeError}</Alert>}
            <form action={resumeWithCodeAction} className="flex flex-wrap items-end gap-2">
              <label className={labelClassName}>
                Resume code
                <input name="code" required className={inputClassName} />
              </label>
              <Button type="submit">Resume exam</Button>
            </form>
          </Card>
        )}
      </main>
    );
  }

  if (attempt.status !== "IN_PROGRESS") {
    redirect(`/attempts/${attemptId}/result`);
  }

  // Server-authoritative timer: read from the attempt's stored deadline
  // (attemptDeadline, which also accounts for time spent paused under
  // integrity review), never trusted from the client. This render-time
  // check is a convenience that redirects an expired attempt promptly —
  // it is NOT the enforcement boundary. saveAnswers() enforces the same
  // deadline server-side, so skipping this page entirely (direct server
  // action call, stale tab, disabled JS) cannot buy extra time.
  // This is a Server Component computing a server-authoritative timestamp once per
  // request (not a client render the purity rule is meant to protect) — Date.now() here IS the point.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const deadline = attemptDeadline(attempt, attempt.examVersion.timeLimitMinutes);
  const deadlineEpochMs = deadline ? deadline.getTime() : now;

  if (deadline && now > deadline.getTime()) {
    await submitAttempt(institutionId, session.user, attemptId);
    redirect(`/attempts/${attemptId}/result?expired=1`);
  }

  const answersByQuestion = new Map(attempt.answers.map((a) => [a.examQuestionId, a]));
  // Presentation-only reorder — see shuffle.ts. Seeded by attemptId so the
  // order is stable across reloads of the same attempt, not the exam's
  // authored order every other exam question list in this app uses.
  const examQuestions = attempt.examVersion.randomizeQuestions
    ? seededShuffle(attempt.examVersion.examQuestions, `${attemptId}:questions`)
    : attempt.examVersion.examQuestions;
  const warningCount = await getWarningCount(institutionId, attemptId);
  const branding = await getDemoInstitutionBranding();
  const questionMeta: QuestionPagerMeta[] = examQuestions.map((eq) => {
    const row = answersByQuestion.get(eq.id);
    return { id: eq.id, flagged: row?.isFlagged ?? false, answered: row?.responseJson != null };
  });

  async function saveProgressAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.id || !authSession.user.institutionId) {
      redirect("/login");
    }

    await saveAnswers(authSession.user.institutionId, authSession.user, attemptId, readAnswersFromForm(examQuestions, formData));
    revalidatePath(`/attempts/${attemptId}`);
  }

  async function submitExamAction(formData: FormData) {
    "use server";
    const authSession = await auth();
    if (!authSession?.user?.id || !authSession.user.institutionId) {
      redirect("/login");
    }

    await saveAnswers(authSession.user.institutionId, authSession.user, attemptId, readAnswersFromForm(examQuestions, formData));
    await submitAttempt(authSession.user.institutionId, authSession.user, attemptId);
    redirect(`/attempts/${attemptId}/result`);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {branding?.sealUrl && (
              <Image src={branding.sealUrl} alt="College of Maasin seal" width={28} height={28} className="rounded-full" />
            )}
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{attempt.examVersion.exam.title}</h1>
          </div>
          <ExamControlsMenu submitButtonId={SUBMIT_BUTTON_ID} />
        </div>
        <div className="flex items-center gap-3">
          <ExamCountdown deadlineEpochMs={deadlineEpochMs} submitButtonId={SUBMIT_BUTTON_ID} />
          <AutosaveStatus formId={ANSWERS_FORM_ID} />
        </div>
        <IntegrityMonitor attemptId={attemptId} initialWarningCount={warningCount} recordEventAction={recordIntegrityEventAction} />
      </div>

      <form id={ANSWERS_FORM_ID} action={saveProgressAction} className="flex flex-col gap-6">
        <ExamQuestionPager questions={questionMeta} submitButtonId={SUBMIT_BUTTON_ID} allowBacktracking={attempt.examVersion.allowBacktracking}>
          {examQuestions.map((eq, index) => {
            const existingRow = answersByQuestion.get(eq.id);
            const rawChoices = (eq.questionVersion.choices as { id: string; text: string }[] | null) ?? [];
            const choices = attempt.examVersion.randomizeAnswers ? seededShuffle(rawChoices, `${attemptId}:${eq.id}:choices`) : rawChoices;
            return (
              <Card key={eq.id} as="fieldset">
                <legend className="mb-2 flex items-center gap-2 px-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                  <span>
                    Q{index + 1} · {eq.points} pt(s)
                  </span>
                  {existingRow?.isFlagged && <Badge tone="amber">Flagged</Badge>}
                </legend>
                <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">{eq.questionVersion.prompt}</p>
                {renderInput(eq, existingRow, choices)}
                <label className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <input type="checkbox" name={`flag_${eq.id}`} defaultChecked={existingRow?.isFlagged ?? false} />
                  Flag this question to review before submitting
                </label>
              </Card>
            );
          })}
        </ExamQuestionPager>

        <div className="flex gap-3">
          <Button type="submit" variant="secondary">
            Save Progress
          </Button>
          <Button id={SUBMIT_BUTTON_ID} formAction={submitExamAction}>
            Submit Exam
          </Button>
        </div>
      </form>

      <ExamToolbar />
    </main>
  );
}
