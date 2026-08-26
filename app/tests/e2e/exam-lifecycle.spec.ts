import { expect, test, type Page } from "@playwright/test";

/**
 * The golden path, scripted: this is what caught neither ERROR-001 nor
 * ERROR-002 automatically — those were only found by manually clicking
 * through the app. Running this suite would have caught both. Uses a
 * unique run ID per invocation so repeated local runs don't collide with
 * each other or with the seeded demo data's no-retake constraint.
 */

const DEMO_PASSWORD = "DemoPass!2026";
const runId = Date.now().toString(36);
const questionPrompt = `E2E test question ${runId}`;
const examTitle = `E2E Test Exam ${runId}`;

async function login(page: Page, email: string, expectedUrl: RegExp = /dashboard/) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(expectedUrl);
}

test.describe.serial("full exam lifecycle", () => {
  test("faculty authors a question and exam, publishes it", async ({ page }) => {
    await login(page, "faculty@cmlaw.demo");

    await page.click("text=LAW101");
    await expect(page).toHaveURL(/\/courses\/[^/]+$/);
    await page.click("text=Question bank");
    await expect(page).toHaveURL(/questions/);

    await page.selectOption('select[name="type"]', "MULTIPLE_CHOICE");
    await page.fill('textarea[name="prompt"]', questionPrompt);
    await page.fill('textarea[name="choicesText"]', "*Correct\nWrong");
    await page.fill('input[name="points"]', "1");
    await page.click('button:has-text("Add question")');
    await expect(page.getByText(questionPrompt)).toBeVisible();

    // Exam creation moved into a "Create Assessment" modal during the
    // faculty portal reskin (docs/PITCH_ROADMAP.md Milestone 9) — the
    // title/time-limit fields exist inside it, not directly on the page.
    await page.click("text=Exams");
    // A single click can land before this freshly-loaded page's client
    // bundle has actually hydrated (Next.js dev mode JIT-compiles a route's
    // client bundle on first visit — production builds have no such delay),
    // in which case the click is simply lost, not delayed — waiting longer
    // afterward doesn't help. Retrying the click itself until the dialog is
    // actually open is the real fix, not a longer single wait. Checking
    // whether it's already open first avoids re-clicking a trigger button
    // that's now hidden behind an already-open dialog (which would just
    // hang on its own actionability wait).
    const dialog = page.locator("dialog[open]");
    await expect(async () => {
      if (!(await dialog.isVisible())) {
        await page.click('button:has-text("Create Assessment")');
      }
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await page.fill('input[name="title"]', examTitle);
    await page.fill('input[name="timeLimitMinutes"]', "60");
    // Exact text match, not :has-text — the still-present "Create
    // Assessment" trigger button behind the now-open modal also contains
    // the substring "Create", and :has-text matched that one first (hidden
    // behind the dialog, so the click silently never landed).
    await page.click('button:text-is("Create")');
    await expect(page.getByText(examTitle)).toBeVisible();

    await page.click(`text=${examTitle}`);
    // examMonitoringEnabled defaults to true (Milestone 9's real device
    // check) — turned off for this E2E exam so the student flow below
    // doesn't need real camera/mic plumbing in the test browser. This
    // itself exercises the checkbox, not just a workaround.
    await page.uncheck('input[name="examMonitoringEnabled"]');
    await page.click('button:has-text("Save changes")');
    await expect(page.locator('input[name="examMonitoringEnabled"]')).not.toBeChecked();

    await page.selectOption('select[name="questionId"]', { label: `[MULTIPLE_CHOICE] ${questionPrompt}` });
    await page.fill('input[name="points"]', "1");
    await page.click('button:has-text("Add to exam")');
    // Wait for the add-question server action's re-render to actually land
    // before publishing — clicking "Publish" immediately after "Add to
    // exam" raced ahead of it in testing (Next.js dev-mode server action
    // re-renders aren't always synchronous from Playwright's click()
    // perspective), leaving the exam published with zero questions
    // attached. This assertion is the fix, not a workaround for an app bug
    // — publishExam() already rejects an empty exam (see exams.test.ts).
    await expect(page.getByText("Questions (1)")).toBeVisible();
    await page.click('button:has-text("Publish exam")');
    await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();
  });

  test("student takes the exam through a real proctor gate and sees an auto-graded result", async ({ page, browser }) => {
    await login(page, "student@cmlaw.demo");

    await page.click("text=LAW101");
    await page.click(`text=${examTitle}`);
    // Book -> download/password gate -> receipt -> Exam Rules -> gate
    // sequence -> exam. Booking and beginning are two separate steps now
    // (docs/PITCH_ROADMAP.md's booking flow) — confirm the booking first and
    // wait for the receipt to render before continuing, same "wait for the
    // actual UI evidence" discipline as the add-question/publish race fixed
    // above. This exam has no booking window, so no time picker appears —
    // booking stays "anytime".
    await page.click('button:has-text("Confirm Booking")');
    // ExamDownloadGate (docs/PITCH_ROADMAP.md Milestone 9) now sits between
    // booking and the entry gate — a decorative download/password ceremony.
    // No assessmentPassword is set on this exam, so any non-empty value
    // unlocks it (ExamDownloadGate's documented backward-compat fallback).
    await page.click('button:has-text("Download Exam")');
    await page.fill('input[type="password"]', "test-password");
    await page.click('button:has-text("Enter")');
    await expect(page.getByText("Booking Confirmed")).toBeVisible();
    await page.click('button:has-text("Continue to Exam Rules")');
    await page.check('input[type="checkbox"]'); // agree to the exam rules
    await page.click('button:has-text("Start Exam")');
    // examMonitoringEnabled is off for this exam (see above), so
    // ExamEntryGate skips straight past the real device/ExamID check to the
    // wait-for-proctor-approval gate (docs/PITCH_ROADMAP.md Milestone 5) —
    // nothing auto-approves it. A second browser context logs in as
    // the seeded demo proctor (assigned to LAW101 in prisma/seed.ts) and
    // approves the request while the student's page is still polling. Kept
    // open for the whole test (not closed right after each click) —
    // Playwright's click() resolves once the click is dispatched, not once
    // the form's server-action round trip completes, so closing the
    // context immediately after risked cancelling that in-flight request.
    const proctorContext = await browser.newContext();
    const proctorPage = await proctorContext.newPage();
    await login(proctorPage, "proctor@cmlaw.demo", /\/proctor/);
    // Scoped to the specific list item for THIS run's exam that also has
    // the "Approve start" button — not just any row with a matching title
    // (the same attempt shows up in "Booked, upcoming" too while it's still
    // NOT_STARTED) and not just any "Approve start" button — the
    // dashboard's queues accumulate every attempt ever made against a
    // course this proctor is assigned to (including historical demo/e2e
    // data with no verifiedAt from before this feature existed), so an
    // unscoped selector can silently click the wrong row instead of
    // throwing.
    const startButton = proctorPage.getByRole("button", { name: "Approve start" });
    const startRow = proctorPage.getByRole("listitem").filter({ hasText: examTitle }).filter({ has: startButton });
    await expect(startRow).toBeVisible({ timeout: 20_000 });
    await startRow.getByRole("button", { name: "Approve start" }).click();
    // Waits for the server action's round trip to actually finish before
    // moving on — click() only waits for the click itself, not for the
    // form submission it triggers.
    await proctorPage.waitForLoadState("networkidle");

    // Wait for that navigation rather than assuming it's instant — the gate
    // only proceeds once its poll notices the approval above.
    await page.waitForURL(/\/attempts\//, { timeout: 30_000 });

    // Visually hidden (sr-only) — a lettered pill is what a real student
    // clicks (PAGE TEMPLATE/Student Overview_Exam), the native input is
    // still what's functionally checked underneath it.
    await page.locator('input[type="radio"]').first().check({ force: true }); // the seeded correct choice is first
    await page.click('button:has-text("Submit Exam")');

    // Real "approve to finish" step (Milestone 5): the result stays behind
    // a waiting screen until the proctor signs off on the submission too.
    await expect(page.getByText(/Waiting for your proctor to approve/)).toBeVisible();

    await proctorPage.reload();
    const finishButton = proctorPage.getByRole("button", { name: "Approve to finish" });
    const finishRow = proctorPage.getByRole("listitem").filter({ hasText: examTitle }).filter({ has: finishButton });
    await expect(finishRow).toBeVisible({ timeout: 20_000 });
    await finishRow.getByRole("button", { name: "Approve to finish" }).click();
    await proctorPage.waitForLoadState("networkidle");
    await proctorContext.close();

    // The student's page polls every few seconds (AutoRefresh) rather than
    // pushing in real time — this app has no WebSocket/SSE infrastructure.
    // "Final score" (not "Partial score...") only renders once every
    // question is graded — the UI/UX pass (Milestone 6) replaced the old
    // "Score: 1 / 1" sentence with a large score number plus this label, so
    // this checks the label rather than a "1 / 1" pattern that also
    // (ambiguously) appears in the per-question breakdown row below it.
    await expect(page.getByText("Final score")).toBeVisible({ timeout: 20_000 });
  });
});
