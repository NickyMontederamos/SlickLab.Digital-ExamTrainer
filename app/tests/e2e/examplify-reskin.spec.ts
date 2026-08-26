import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";

/**
 * Coverage for the exam-taking reskin toward the real app this trainer
 * practices for: the Filter control (All/Unanswered/Flagged) over the
 * question palette, the Exam Controls menu as an early-submit path, and
 * the last-question Next-becomes-Submit swap. None of these were exercised
 * by exam-lifecycle.spec.ts, which only ever clicks the original bottom
 * "Submit Exam" button — verified live via the Browser pane before writing
 * this, then encoded here so it stays verified.
 *
 * Two full attempts is deliberate, not laziness: the Filter/last-question
 * test needs a first attempt to reach the flagging/filtering state, and the
 * Exam Controls menu needs a clean second attempt (this app has no
 * retakes), so they can't share one run.
 */

const DEMO_PASSWORD = "DemoPass!2026";
const runId = Date.now().toString(36);
const examTitle = `Reskin Test Exam ${runId}`;

async function login(page: Page, email: string, expectedUrl: RegExp = /dashboard/) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(expectedUrl);
}

/** Runs the entry-gate sequence and waits for a real proctor to approve the request, mirroring exam-lifecycle.spec.ts's proven pattern. Uses a fresh browser CONTEXT for the proctor, not a same-context tab — two logins in one context/cookie-jar silently clobber each other's session. */
async function bookAndClearGate(page: Page, browser: import("@playwright/test").Browser, title: string) {
  await page.click('button:has-text("Confirm Booking")');
  await expect(page.getByText("Booking Confirmed")).toBeVisible();
  await page.click('button:has-text("Continue to Exam Rules")');
  await page.check('input[type="checkbox"]');
  await page.click('button:has-text("Start Exam")');

  const proctorContext = await browser.newContext();
  const proctorPage = await proctorContext.newPage();
  await login(proctorPage, "proctor@cmlaw.demo", /\/proctor/);
  const startButton = proctorPage.getByRole("button", { name: "Approve start" });
  const startRow = proctorPage.getByRole("listitem").filter({ hasText: title }).filter({ has: startButton });
  await expect(startRow).toBeVisible({ timeout: 20_000 });
  await startRow.getByRole("button", { name: "Approve start" }).click();
  await proctorPage.waitForLoadState("networkidle");
  await proctorContext.close();

  await page.waitForURL(/\/attempts\//, { timeout: 30_000 });
}

test.describe.serial("Examplify-style reskin", () => {
  test("faculty publishes a 2-question exam for the reskin tests", async ({ page }) => {
    await login(page, "faculty@cmlaw.demo");
    await page.click("text=LAW101");
    await expect(page).toHaveURL(/\/courses\/[^/]+$/);
    await page.click("text=Question bank");

    for (const label of ["Q1", "Q2"]) {
      await page.selectOption('select[name="type"]', "MULTIPLE_CHOICE");
      await page.fill('textarea[name="prompt"]', `${label} — Reskin ${runId}`);
      await page.fill('textarea[name="choicesText"]', "*Correct\nWrong");
      await page.fill('input[name="points"]', "1");
      await page.click('button:has-text("Add question")');
      await expect(page.getByText(`${label} — Reskin ${runId}`)).toBeVisible();
    }

    await page.click("text=Exams");
    await page.fill('input[name="title"]', examTitle);
    await page.fill('input[name="timeLimitMinutes"]', "60");
    await page.click('button:has-text("Create exam")');
    await expect(page.getByText(examTitle)).toBeVisible();

    await page.click(`text=${examTitle}`);
    for (const label of ["Q1", "Q2"]) {
      await page.selectOption('select[name="questionId"]', { label: `[MULTIPLE_CHOICE] ${label} — Reskin ${runId}` });
      await page.fill('input[name="points"]', "1");
      await page.click('button:has-text("Add to exam")');
    }
    await expect(page.getByText("Questions (2)")).toBeVisible();
    await page.click('button:has-text("Publish exam")');
    await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();
  });

  test("Filter shows only flagged questions once saved, and the last question offers Submit instead of Next", async ({
    page,
    browser,
  }) => {
    await login(page, "student@cmlaw.demo");
    await page.click("text=LAW101");
    await page.click(`text=${examTitle}`);
    await bookAndClearGate(page, browser, examTitle);

    // Both numbers are in the palette before any flag is saved.
    const palette = page.locator('button[aria-current]');
    await expect(palette).toHaveCount(2);

    // Flag question 1 without answering it, then save — flagging with no
    // response is the "come back to this later" case saveAnswers.ts's own
    // filter is built around.
    await page.check('input[type="checkbox"][name^="flag_"]');
    await page.click('button:has-text("Save Progress")');
    // "Flagged" also appears as the Filter dropdown's <option> text, so this
    // is scoped to the fieldset's legend badge specifically.
    await expect(page.getByRole("group").getByText("Flagged", { exact: true })).toBeVisible();

    // Filter to Flagged: only Q1's number should remain.
    await page.selectOption("select", "flagged");
    await expect(page.locator('button[aria-current]')).toHaveCount(1);
    await expect(page.getByText("No questions match this filter.")).not.toBeVisible();

    // Filter to Unanswered: both are unanswered, so both remain.
    await page.selectOption("select", "unanswered");
    await expect(page.locator('button[aria-current]')).toHaveCount(2);

    // Back to All, move to the last question — Next must become Submit.
    await page.selectOption("select", "all");
    await expect(page.getByRole("button", { name: "Next →" })).toBeVisible();
    await page.click('button:has-text("Next →")');
    await expect(page.getByRole("button", { name: "Submit →" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next →" })).not.toBeVisible();
  });

  test("the Exam Controls menu submits early, and the result screen marks a wrong answer with a red X", async ({
    page,
    browser,
  }) => {
    // A fresh student — this exam already has an attempt from the previous
    // test, and there are no retakes.
    const platform = await import("../../src/lib/tenant-db").then((m) => m.forPlatform());
    const student2 = await platform.user.upsert({
      where: { email: `reskin-student2-${runId}@test.local` },
      update: {},
      create: {
        email: `reskin-student2-${runId}@test.local`,
        name: "Reskin Student 2",
        role: "STUDENT",
        passwordHash: await import("../../src/lib/password").then((m) => m.hashPassword(DEMO_PASSWORD)),
        institution: { connect: { slug: "college-of-maasin-law" } },
      },
    });
    const course = await platform.course.findFirstOrThrow({ where: { code: "LAW101" } });
    await platform.enrollment.upsert({
      where: { courseId_userId: { courseId: course.id, userId: student2.id } },
      update: {},
      create: { courseId: course.id, userId: student2.id, institutionId: course.institutionId },
    });

    await login(page, student2.email);
    await page.click("text=LAW101");
    await page.click(`text=${examTitle}`);
    await bookAndClearGate(page, browser, examTitle);

    // Answer Q1 with the wrong choice on purpose (seeded choices are
    // "Correct" then "Wrong" — the second radio is always the wrong one).
    await page.locator('input[type="radio"]').nth(1).check();

    // Submit via Exam Controls rather than the bottom button or the
    // last-question swap — this is the path that specifically exercises
    // ExamControlsMenu.
    await page.click('button:has-text("Exam Controls")');
    await expect(page.getByRole("menuitem", { name: "Submit Exam" })).toBeVisible();
    await page.click('[role="menuitem"]:has-text("Submit Exam")');

    await expect(page.getByText(/Waiting for your proctor to approve/)).toBeVisible();

    const proctorContext = await browser.newContext();
    const proctorPage = await proctorContext.newPage();
    await login(proctorPage, "proctor@cmlaw.demo", /\/proctor/);
    const finishButton = proctorPage.getByRole("button", { name: "Approve to finish" });
    const finishRow = proctorPage.getByRole("listitem").filter({ hasText: examTitle }).filter({ has: finishButton });
    await expect(finishRow).toBeVisible({ timeout: 20_000 });
    await finishRow.getByRole("button", { name: "Approve to finish" }).click();
    await proctorPage.waitForLoadState("networkidle");
    await proctorContext.close();

    await expect(page.getByText("Final score")).toBeVisible({ timeout: 20_000 });
    // The ReviewMark indicator is a <span aria-label>, not a labelable form
    // control, so this is a plain attribute locator rather than getByLabel.
    await expect(page.locator('[aria-label="Incorrect"]').first()).toBeVisible();
  });
});
