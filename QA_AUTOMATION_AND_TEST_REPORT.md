# 🧪 Automated AI Quality Assurance & Verification Report
**Date:** 2026-08-26
**Repository Scope:** CM-Law-ExamTrainer (Next.js 16 App Router, `app/`) — full read of the Master Prompt spec, `docs/*.md`, `app/prisma/schema.prisma`, all 23 `app/src/lib/*.ts` domain modules, all 20 test files under `app/src/lib/__tests__/`, all page routes/`actions.ts` under `app/src/app/`, `app/src/auth.ts`, `app/src/middleware.ts`, `app/next.config.ts`, and the 26 files under `app/src/components/`. Live gates executed this session: `npx tsc --noEmit`, `npm test` (Vitest against a real local Postgres via `docker compose`), `npx eslint .`, `npm run build`. `npx playwright test` (E2E) was **not** executed this session — see §4.

**Primary sources used for requirements** (per the guardrails, code was cross-referenced against these, not used as the primary source): `AUTONOMOUS MASTER PROMPT — SECURE EXAMINATION SAAS PLATFORM.md`, `docs/ARCHITECTURE.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/SECURITY.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/PITCH_ROADMAP.md`, `docs/WORLD_CLASS_AUDIT.md`, `docs/WORLD_CLASS_ROADMAP.md`, `docs/EXAMPLIFY_ARCHITECTURE_REFERENCE.md`, `PROJECT_STATUS.md`, `NEXT_PHASE_PLAN.md`, `LACKING.txt`.

**Important scope note found during this audit:** `git log` shows 16 commits after the last `docs/PITCH_ROADMAP.md` entry (Milestone 8) — Departments, real Benchmark Assessments, Post Assessment Settings, the student install/register ceremony, a faculty portal reskin, an Exam Results & Reporting module, a rebuilt pre-exam settings flow, and real camera/mic device checks (commits `5503b98` through `0271c8f`). **None of this is documented anywhere in `docs/` or `PROJECT_STATUS.md`.** Per the guardrails, requirements for this entire slice (Departments, Benchmarks/Linked Assessments, Post Assessment Settings, the download/password gate, the real device-check, Reporting/S&O) were **reverse-engineered from the code and Prisma schema comments**, not sourced from a doc — flagged explicitly in each relevant row below. This is itself a documentation-freshness finding, logged as REQ-095.

---

## 1. Requirements & Deliverable Matrix

Legend: 🟢 PASS · 🔴 FAIL · 🟡 PARTIAL/INCONCLUSIVE

### 1.1 Authentication & Session Management

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-001 | Credentials login (email + bcrypt password) | 🟢 PASS | `app/src/auth.ts:52-122` | bcrypt cost 12 (`app/src/lib/password.ts:4`). Tested: `password.test.ts` (3 tests). |
| REQ-002 | Failed/successful logins are audit-logged, including rate-limit denials | 🟢 PASS | `app/src/auth.ts:68-113` | Writes `auth.login` with `SUCCESS`/`DENIED` and a reason. Metadata never includes the password. |
| REQ-003 | Login rate limiting (brute-force throttle) | 🟢 PASS | `app/src/lib/rate-limit.ts`; wired at `app/src/auth.ts:59-76` | 5 attempts / 15 min, keyed per-email. Tested: `rate-limit.test.ts` (3 tests). **Known, documented gap:** in-memory, per-process — `app/src/lib/rate-limit.ts:1-8` and `docs/WORLD_CLASS_AUDIT.md` A-06 both say so; not a hidden defect. No IP-based throttling — one attacker can spray many different accounts unthrottled. |
| REQ-004 | Sessions are revocable (deactivation/role-change/password-reset take effect on already-issued tokens) | 🟢 PASS | Decision logic: `app/src/lib/session-validity.ts` (pure, unit-tested — `session-validity.test.ts`, 16 tests incl. a DB-backed "A-02 regression" suite). Wired into the `jwt` callback: `app/src/auth.ts:142-173`. Triggers: `app/src/lib/users.ts:80-104` (deactivate), `:111-139` (password reset). | This is the audited-and-fixed A-02 finding (`docs/WORLD_CLASS_AUDIT.md`). Default-deny logic confirmed by direct read: every branch that can't positively confirm validity returns "revoke" (`session-validity.ts:23-47`). |
| REQ-005 | Session lifetime is bounded, not the Auth.js 30-day default | 🟢 PASS | `app/src/auth.ts:42,45` — `SESSION_MAX_AGE_SECONDS = 8 * 60 * 60` | Directly read; 8-hour JWT `maxAge`. |
| REQ-006 | Server-side-only authorization, no client-side gate as the sole boundary | 🟢 PASS | Every domain function opens with `assertCan(...)` (`app/src/lib/rbac.ts:99-103`), confirmed across all 23 lib modules read this session. | Consistent pattern with zero exceptions found. |
| REQ-007 | Content-Security-Policy (nonce-based, no blanket `unsafe-inline` on scripts) | 🟢 PASS | `app/src/middleware.ts:36-68` | Nonce generated per-request, `strict-dynamic`, `unsafe-eval` dev-only. `style-src` still allows `unsafe-inline` (documented, `middleware.ts:25-29` — Tailwind/`next/font` have no nonce path). Regression test referenced in docs (`tests/e2e/security-headers.spec.ts`) — **not independently re-run this session** (see §4). |
| REQ-008 | Baseline OWASP security headers (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) | 🟡 PARTIAL | `app/next.config.ts:16-22` | Headers are present and directly read. **But see REQ-052 — the `Permissions-Policy: camera=(), microphone=(), geolocation=()` header on this exact line set now conflicts with a different, newer requirement (real camera/mic device check) and breaks it. The header itself is correctly implemented for its original purpose; the conflict is the newer feature's fault, cross-referenced here.** |

### 1.2 RBAC & Multi-Tenant Isolation

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-009 | Explicit, non-inherited role → resource → action permission matrix for 6 roles (master prompt §9) | 🟢 PASS | `app/src/lib/rbac.ts:26-85` | `SUPER_ADMIN, PLATFORM_ADMIN, INSTITUTION_ADMIN, FACULTY, PROCTOR, STUDENT` all present. Tested: `rbac.test.ts` (12 tests). |
| REQ-010 | `assertCan` throws a typed, catchable error on denial | 🟢 PASS | `app/src/lib/rbac.ts:91-103` | `ForbiddenError`, tested directly. |
| REQ-011 | Tenant isolation enforced at the query layer, not per-route (master prompt §8) | 🟢 PASS | `app/src/lib/tenant-db.ts:60-118` | `findUnique`/`findUniqueOrThrow` refused outright; unhandled ops (`aggregate`, `groupBy`, etc.) refused rather than silently unscoped. Tested: `tenant-db.test.ts` (11 tests) against real Postgres, covering findMany/findFirst/update/delete/create/upsert. This is the strongest-verified guarantee in the codebase. |
| REQ-012 | Automated cross-tenant-access-denied test (master prompt §8's explicit ask: "TENANT A attempting to access TENANT B DATA → ACCESS DENIED") | 🟢 PASS | `app/src/lib/__tests__/tenant-db.test.ts` (all 11 tests), plus per-module cross-tenant refusal tests in `exams.test.ts` ("cannot see or touch another tenant's exam"), `questions.test.ts`, `courses.test.ts`, `roster-import.test.ts`, `question-import-db.test.ts` | Directly confirmed — this specific master-prompt requirement is met with more than one test, not just the core suite. |
| REQ-013 | Per-course faculty assignment is a real authorization boundary, not just a dashboard filter | 🟢 PASS | `app/src/lib/courses.ts:55-68` (`assertFacultyAssignedToCourse`), wired into every course/exam/question mutation and read in `exams.ts`, `questions.ts`, `grading.ts`, `benchmarks.ts`, `reporting.ts` | This was itself a **found-and-fixed** gap (Milestone 6.6, `docs/PITCH_ROADMAP.md`) — confirmed still wired everywhere it should be, by direct read of every call site, **except** `reporting.ts` — see REQ-084 (🔴 FAIL) for where the same pattern was *not* carried forward correctly. |
| REQ-014 | Row-level ownership checks independent of RBAC/tenant scope (a student can't touch another student's attempt) | 🟢 PASS | `app/src/lib/attempts.ts:369-371,416-417,594-596` (`AttemptOwnershipError`) | Tested: `attempts.test.ts` "refuses another student from reading or saving into someone else's attempt". |
| REQ-015 | `forPlatform()` (unscoped client) usage is restricted to genuinely platform-level operations, each behind an explicit role check | 🟢 PASS | Grepped all 5 call sites: `institutions.ts` (guarded by `assertPlatformRole`), `auth.ts` (pre-tenant login lookup), `users.ts`/`roster-import.ts` (email-uniqueness check, read-only), `audit.ts` (writes, correctly unscoped by design) | No unguarded `forPlatform()` call site found. |

### 1.3 Institutions, Departments & Courses

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-016 | Institution onboarding (creates institution + first INSTITUTION_ADMIN atomically), SUPER_ADMIN/PLATFORM_ADMIN only | 🟢 PASS | `app/src/lib/institutions.ts:43-77`; page gate `app/src/app/(app)/admin/page.tsx:16-17` | Tested: `institutions.test.ts` (6 tests) incl. duplicate slug/email refusal and role restriction. |
| REQ-017 | Institution branding (logo, seal, primary/secondary color) rendered app-wide | 🟢 PASS | `app/src/lib/branding.ts`; consumed in `app/src/app/(app)/layout.tsx:47-51` via CSS custom properties | Directly read — colors flow into `--brand-primary`/`--brand-secondary`, consumed by Tailwind utilities across all pages (per `docs/PITCH_ROADMAP.md` Milestone 6, code-confirmed). |
| REQ-018 | Departments (create/read/update/delete), institution → department → course hierarchy | 🟡 PARTIAL | `app/src/lib/departments.ts` (full CRUD), `app/src/app/(app)/departments/page.tsx`, `.../departments/[departmentId]/page.tsx`, `CreateDepartmentModal.tsx` (wired, confirmed via import grep) | **Reverse-engineered — no doc coverage** (post-dates `PITCH_ROADMAP.md`). Implementation read directly and looks correct (name-uniqueness, refuses delete-with-courses at `departments.ts:90-106`), but **zero automated test file exists** (`grep` of `__tests__/` confirms no `departments.test.ts`). Logic is simple enough to read with confidence, but per the audit's own PASS bar ("unambiguous... with no test but with clear, correct... logic") — the create/rename/delete paths qualify for PASS-by-inspection, but graded PARTIAL because there is no regression protection at all for a feature that gates course creation. |
| REQ-019 | Course creation requires a valid department; course code unique per (institution, code, academicYear) | 🟢 PASS | `app/src/lib/courses.ts:108-129`; unique constraint `prisma/schema.prisma:188` | Tested: `courses.test.ts` "creates a course", "refuses a duplicate course code". |
| REQ-020 | Role-appropriate course listing (students see enrollments, faculty see assignments, admin sees all) | 🟢 PASS | `app/src/lib/courses.ts:77-99` | Explicitly documented as a UX filter, not a security boundary (correct — tenant scoping is the real boundary). Not directly unit-tested as a standalone function, but exercised indirectly through `dashboard/page.tsx` live-test evidence in `docs/LIVE_TEST_REPORT.md`; logic is simple/read-with-confidence. |
| REQ-021 | Course deletion refuses if questions/exams exist (protects academic records) | 🟢 PASS | `app/src/lib/courses.ts:183-204` (`CourseHasContentError`) | Tested: `courses.test.ts` "refuses to delete a course that has a question attached". |
| REQ-022 | Faculty/Proctor/Student roster assignment (`CourseFaculty`, `CourseProctor`, `Enrollment`) | 🟢 PASS | `app/src/lib/courses.ts:206-283` | Tested: `courses.test.ts` (assign faculty/proctor/student, refuse wrong-role assignment, refuse cross-institution faculty, unassign). |
| REQ-023 | `CourseProctor` kept as its own table (not reusing `CourseFaculty`) so proctor assignment is independent of faculty assignment | 🟢 PASS | `prisma/schema.prisma:209-219`, comment explains why | Directly read; matches stated design intent. |
| REQ-024 | Benchmark-bank course designation (`Course.isBenchmarkBank`) | 🟢 PASS | `app/src/lib/benchmarks.ts:24-39` (`setBenchmarkBank`, admin-only via `course:"update"`) | **Reverse-engineered — no doc coverage.** No dedicated test file, but logic is a 2-line tenant-scoped update, simple enough to read with confidence. |
| REQ-025 | Course-home page shows roster + per-exam grading rollup for FACULTY/INSTITUTION_ADMIN, gated so STUDENT/PROCTOR can't land there | 🟢 PASS | `app/src/app/(app)/courses/[courseId]/page.tsx:19-26`; rollup: `app/src/lib/grading.ts:80-127` | Tested: `grading.test.ts` (2 tests) for the rollup function; page-level role gate directly confirmed. |

### 1.4 Question Bank & CSV Import

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-026 | Question types: MC, multiple-response, true/false, essay, short-answer (master prompt §10) | 🟢 PASS | `prisma/schema.prisma:22-28` (`QuestionType` enum); handled throughout `questions.ts`, `attempts.ts` auto-grading, `question-import.ts` | All 5 types present and used consistently. |
| REQ-027 | Question = stable identity + versioned gradeable content, so a past exam keeps its exact wording/answer key | 🟢 PASS | `prisma/schema.prisma:237-274`; `app/src/lib/questions.ts:55-100` | Directly read — `Question`/`QuestionVersion` split exactly as documented. |
| REQ-028 | Question tags, difficulty, learning objectives, course association (master prompt §10) | 🟢 PASS | `prisma/schema.prisma:243-246`; accepted in `CreateQuestionInput` (`questions.ts:6-16`) | `learningObjectives` field exists and is populated but **nothing reads it back** for any competency-mapping feature — confirmed absent (matches `docs/WORLD_CLASS_AUDIT.md` A-13, correctly scoped out). |
| REQ-029 | Atomic question + first version creation | 🟢 PASS | `app/src/lib/questions.ts:70-100` (`$transaction`) | Tested: `questions.test.ts` "creates a question with its first version atomically". |
| REQ-030 | Question edit/delete refused once attached to any exam (append-only past-exam integrity) | 🟢 PASS | `app/src/lib/questions.ts:38-45,162-164,197-199` (`QuestionInUseError`) | Tested: `questions.test.ts` "refuses once it's attached to an exam". |
| REQ-031 | CSV question import (all-or-nothing validation, optional direct attach to a DRAFT exam) | 🟢 PASS | `app/src/lib/question-import.ts` | Tested: `question-import.test.ts` (12 pure-parsing tests) + `question-import-db.test.ts` (6 DB tests incl. cross-tenant refusal and "refuses import into a published exam"). |
| REQ-032 | Answer key (`correctAnswer`) never exposed to STUDENT-facing reads | 🟢 PASS | `app/src/lib/attempts.ts:373-377` (`getAttemptForTaking` strips it for `STUDENT`) | Tested: `attempts.test.ts` "strips the answer key from the taking view for a student". `listQuestionsForCourse` (`questions.ts:110-129`) never grants STUDENT `question:"read"` at all (`rbac.ts:78-84` — STUDENT has no `question` resource), so there is no student-reachable path to the bank's answer keys. |

### 1.5 Exam Builder, Versioning & Publishing

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-033 | Exam = identity (`DRAFT→PUBLISHED→ARCHIVED`) + immutable versioned configuration (master prompt §11) | 🟢 PASS | `prisma/schema.prisma:276-386`; `app/src/lib/exams.ts:87-132` | Tested: `exams.test.ts` "creates an exam with a DRAFT status and an active version". |
| REQ-034 | Published exam version is frozen — no further question/setting edits (master prompt: "Do not silently mutate the active exam version") | 🟢 PASS | `app/src/lib/exams.ts:211-213,268-270,332-334,398-400,440-442` (`ExamNotEditableError`, checked on every mutating path) | Tested across `exams.test.ts`: "refuses to add a question... once published", "edits a draft exam... but refuses once published", "removes a question... but refuses once published", "deletes a draft exam outright, but refuses once published". |
| REQ-035 | Exam attempts permanently reference the exact version taken | 🟢 PASS | `prisma/schema.prisma:413-414` (`ExamAttempt.examVersionId`), never reassigned post-creation | Directly confirmed by schema + `attempts.ts` read. |
| REQ-036 | Publish refuses an empty exam (no questions) | 🟢 PASS | `app/src/lib/exams.ts:571-574` (`EmptyExamError`) | Tested: `exams.test.ts` "refuses to publish an exam with no questions". |
| REQ-037 | Exam builder: add single / bulk-add questions from the bank, with per-exam point override | 🟢 PASS | `app/src/lib/exams.ts:194-302` | Tested: single-add, bulk-add, bulk-add-refuses-on-one-bad-id (`exams.test.ts`). |
| REQ-038 | Exam edit (title, time limit, instructions, window, backtracking, calculator, spellcheck, copy/paste, highlighting, exam-monitoring flag) — DRAFT only | 🟢 PASS | `app/src/lib/exams.ts:304-360` | Tested: `exams.test.ts` "edits a draft exam's title and time limit, but refuses once published". Individual tool-flag fields (`spellCheckAllowed` etc.) are stored/edited but **not yet enforced in the exam-taking UI** — this is explicitly disclosed in the schema comment (`schema.prisma:346-350`) as matching `calculatorAllowed`'s existing scope, not a hidden gap — see REQ-057. |
| REQ-039 | Remove a question from a DRAFT exam, renumbering remaining questions (no gaps) | 🟢 PASS | `app/src/lib/exams.ts:427-466` | Tested: `exams.test.ts` "removes a question from a draft exam and renumbers the rest". |
| REQ-040 | Delete a DRAFT exam outright; FACULTY force-delete of a non-DRAFT exam is refused, but INSTITUTION_ADMIN (holding `exam_attempt:"delete"`) can force-delete any status, cascading attempts/answers/events/submissions | 🟢 PASS | `app/src/lib/exams.ts:474-551` | Tested: `exams.test.ts` "deletes a draft exam outright, but refuses once published"; "lets an institution admin force-delete a published exam, cascading its attempts". Destroyed-attempt count captured in the audit row before deletion (`exams.ts:524`) — good forensic practice, directly confirmed. |
| REQ-041 | Randomize questions / randomize answers flags exist on `ExamVersion` | 🟡 PARTIAL | `prisma/schema.prisma:333-334` (`randomizeQuestions`, `randomizeAnswers`), accepted in `CreateExamInput` (`exams.ts:78-79`) and stored | Fields exist, are settable, and are stored — but **grepped every page/component under `app/src/app` and `app/src/components` for any read of these two fields and found none.** No shuffling logic exists anywhere in `ExamQuestionPager.tsx`, the attempt-taking page, or `getAttemptForTaking`. The flags are inert — set-but-never-honored, the same documented pattern as `calculatorAllowed` etc., but this one is **not** disclosed anywhere in the docs or code comments as a known gap, unlike the tool flags. |
| REQ-042 | Publish-time audit record capturing question count and time limit as delivered | 🟢 PASS | `app/src/lib/exams.ts:581-595` | Directly read; matches master prompt §20's audit requirement for exam publishing. |

### 1.6 Benchmark Assessments & Linked/Duplicated Exams

*Reverse-engineered in full — no doc in `docs/` or `PROJECT_STATUS.md` describes this feature; inferred from `prisma/schema.prisma` comments (`ExamKind`, `LinkedAssessment`) and `app/src/lib/benchmarks.ts`.*

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-043 | A `BENCHMARK` exam can only be created inside a `Course.isBenchmarkBank` course, enforced server-side (not just UI) | 🟢 PASS | `app/src/lib/exams.ts:99-101` — server-side clamp: `kind = course.isBenchmarkBank ? (input.kind ?? "STANDARD") : "STANDARD"` | Directly read: a forged `kind: "BENCHMARK"` request against a non-bank course is silently coerced to STANDARD, not rejected — this is a safe, correct clamp (matches the schema comment's stated intent) though there's no dedicated regression test for the clamp itself. |
| REQ-044 | Duplicate a published `BENCHMARK` exam into a live course as a new DRAFT `STANDARD` exam, sharing frozen question content | 🟢 PASS | `app/src/lib/benchmarks.ts:72-166` | No test file exists for this module at all (`grep` confirms no `benchmarks.test.ts`). Logic read directly: refuses a non-benchmark/non-published source (`SourceExamNotBenchmarkError`), refuses a benchmark-bank target (`TargetIsBenchmarkBankError`), correctly calls `assertFacultyAssignedToCourse` for the *target* course. Graded PASS-by-inspection since the logic is a straightforward transactional copy, but flagged: **zero automated coverage for the only cross-course data-copying path in the app.** |
| REQ-045 | A duplicated (linked) exam's questions can never be edited (matches "Cannot edit questions on existing or new assessment") | 🟢 PASS | `app/src/lib/exams.ts:52-70` (`assertQuestionsNotLocked`, checked in `addExamQuestion`, `addExamQuestions`, `removeExamQuestion`) | Directly read and confirmed wired into every question-mutation path on `exams.ts`. No dedicated test — inspection-level confidence given the check is a single `findFirst` + throw. |
| REQ-046 | Benchmark Combined Report — real cross-course average, honestly-labeled simulated "national average" | 🟢 PASS | `app/src/lib/benchmarks.ts:191-271`; page gate `app/src/app/(app)/exams/[examId]/benchmark-report/page.tsx:13-15` | The simulated figure is clearly commented as fake and the UI must label it as such (not verified live — see §2 note). **Same access-control gap as REQ-084 applies here too** — see that row; `can(role,"grade","read")` is also true for STUDENT, so the page-level gate does not actually exclude students. |
| REQ-047 | `Course.isBenchmarkBank` toggle is admin-controlled ("Benchmark Course" designation) | 🟢 PASS | `app/src/lib/benchmarks.ts:24-39`, gated by `course:"update"` (FACULTY/INSTITUTION_ADMIN hold this) | Directly read; matches `rbac.ts`'s existing `course` permission, no separate resource needed. |
| REQ-048 | Duplication writes an audit record | 🟢 PASS | `app/src/lib/benchmarks.ts:155-163` (`AUDIT_ACTIONS.examDuplicate`) | Directly confirmed. |

### 1.7 Exam Booking & Pre-Flight Gate

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-049 | Book a slot (`NOT_STARTED`, no timer running) with an optional student-picked time constrained to the exam's window, server-validated (not just an HTML `min`/`max` attribute) | 🟢 PASS | `app/src/lib/attempts.ts:222-279` (`bookAttempt`, `ScheduledTimeOutOfWindowError` at line 42-50/247-253) | Tested: `attempts.test.ts` "refuses a scheduled time outside the exam's booking window", "books a windowed exam at a time inside the window". |
| REQ-050 | Booking is idempotent (repeat call returns the existing booking, doesn't duplicate or error) | 🟢 PASS | `app/src/lib/attempts.ts:262-268` | Tested: `attempts.test.ts` "books a slot... and is idempotent". |
| REQ-051 | Confirmation receipt shown after booking (attempt id as confirmation code) | 🟢 PASS | `app/src/components/ExamEntryGate.tsx:137-162` | Directly read — renders `confirmationCode` (the attempt id, per code comment in `attempts.ts:104`). |
| REQ-052 | Real camera/microphone device check + ExamID photo capture before the proctor wait, when `ExamVersion.examMonitoringEnabled` is true | 🔴 **FAIL** | `app/src/components/DeviceAndIdentityCheck.tsx:62` calls `navigator.mediaDevices.getUserMedia({ video: true, audio: true })`. `app/next.config.ts:20` sets, on every route (`source: "/:path*"`, line 27): `Permissions-Policy: camera=(), microphone=(), geolocation=()`. | **Concrete, verified bug.** An empty allowlist (`()`) in a `Permissions-Policy` header disables that feature in **every** browsing context on the origin, including same-origin top-level documents — this is standard, spec-defined browser behavior (Chrome/Firefox/Edge all honor it), not a permission the user can override by clicking "Allow." **Failure scenario:** a student reaches the "Device Check" step of `ExamEntryGate` on any exam with `examMonitoringEnabled: true` (the schema default, `schema.prisma:344`). `getUserMedia` is blocked by the Permissions-Policy before the browser even shows a permission prompt, throws, and `DeviceAndIdentityCheck.tsx:88-98` catches it as a generic denial, showing "Camera/microphone access was blocked" — indistinguishable in the UI from a user who actually clicked Deny. The feature is broken for every user, every browser, every time, until `next.config.ts:20` is changed to allow `camera=(self)` and `microphone=(self)`. This shipped in the most recent commit (`0271c8f feat: replace mocked device/ID checks with real camera+mic device checks`) and the conflicting header predates it — the two were never tested together. No automated test covers this (no Playwright spec exercises `getUserMedia` against the real header set). |
| REQ-053 | A denied/missing camera never hard-blocks the student from continuing (soft-check posture) | 🟢 PASS | `app/src/components/DeviceAndIdentityCheck.tsx:146-159` — "Continue without ExamID/ExamMonitor" button always available in the `denied`/`unsupported` phase | Directly confirmed. Note this is precisely what masks REQ-052 in practice — the app "works" end-to-end because the failure path is designed to be survivable, but the headline feature never actually functions. |
| REQ-054 | Captured ExamID photo is never uploaded or persisted | 🟢 PASS | `app/src/components/DeviceAndIdentityCheck.tsx:116-125` — `canvas.toDataURL(...)` held only in component state, never passed to a server action | Directly confirmed — no network call anywhere in the component. |
| REQ-055 | Real wait-for-proctor-approval gate (student requests, proctor approves, `beginBookedAttempt` refuses to start the timer until approved) | 🟢 PASS | Request/poll: `app/src/lib/proctoring.ts:76-111`; enforcement: `app/src/lib/attempts.ts:311-314` (`ProctorApprovalRequiredError`) | Tested: `attempts.test.ts` "refuses to begin a booked attempt until a proctor approves it", "begins a booked attempt once approved". |
| REQ-056 | Exam Rules acknowledgment gate (explicit checkbox) before the device/proctor sequence | 🟢 PASS | `app/src/components/ExamEntryGate.tsx:165-187` — `Start Exam` button `disabled={!agreed}` | Directly confirmed. |
| REQ-057 | Examplify-style download/password/system-requirements ceremony before the entry gate | 🟡 PARTIAL | `app/src/components/ExamDownloadGate.tsx` (full file) | **Reverse-engineered, no doc coverage.** System-requirements check is genuinely measured where the browser exposes it (screen resolution, `navigator.deviceMemory` — `checkSystemRequirements`, lines 34-58) and honestly labels what it can't measure. Password gate is real once a faculty member sets `assessmentPassword` (`attempts.ts:684-704`, `validateAndRecordDownload`) but uses a **plain `!==` string comparison** (`attempts.ts:697`), not a constant-time compare — low real-world risk since this is explicitly documented as "not a real security boundary" (`schema.prisma:354-359`), but worth noting since a password field usually implies one. The "download" itself is an explicitly-fake progress bar (`DOWNLOAD_MS = 1500`, line 9) — honestly disclosed in the component's own docstring. Graded PARTIAL for the mix of real+fake within one gate and zero test coverage of the real half (the password/window/limit checks in `validateAndRecordDownload` have no dedicated test — `attempts.test.ts` doesn't cover this function at all). |
| REQ-058 | Download-window / max-download-count enforcement, server-side | 🟢 PASS | `app/src/lib/attempts.ts:684-694` (`DownloadWindowClosedError`, `DownloadLimitReachedError`) | Logic directly read and correct (checks `downloadStartAt`/`downloadEndAt`/`maxDownloads` vs. stored `downloadCount`, atomic increment at line 704). **No automated test exists for this function** — same gap as REQ-057. |

### 1.8 Proctoring Workflow

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-059 | PROCTOR dashboard shows booked/upcoming attempts, scoped to the proctor's `CourseProctor` assignments only | 🟢 PASS | `app/src/lib/proctoring.ts:31-67` (`scopedCourseIds`, `listBookedAttemptsForProctor`) | Tested: `proctoring.test.ts` "scopes the booked queue to a proctor's assigned courses only". |
| REQ-060 | Proctor approves a start request — refuses a proctor acting outside their assigned courses | 🟢 PASS | `app/src/lib/proctoring.ts:141-187` (`approveProctorStart`, `ProctorNotAssignedError`) | Tested: `proctoring.test.ts` "requestProctorApproval surfaces the request on the assigned proctor's queue only, and gates approval by assignment". |
| REQ-061 | INSTITUTION_ADMIN has institution-wide proctor authority without needing a `CourseProctor` row | 🟢 PASS | `app/src/lib/proctoring.ts:40-42` (`hasInstitutionWideAuthority`) | Tested: `proctoring.test.ts` "lets an institution admin see and approve a booked attempt with no CourseProctor row at all". |
| REQ-062 | Post-submission proctor "approve to finish" — student's result is hidden until `Submission.verifiedAt` is set | 🟢 PASS | Gate: `app/src/lib/proctoring.ts:218-260` (`verifySubmission`); enforced in `app/src/app/(app)/attempts/[attemptId]/result/page.tsx:41-55` | Tested: `proctoring.test.ts` "gates the result behind proctor verification... and is idempotent". `TERMINATED` attempts correctly skip this gate (line 41 condition), matching that they never get a `Submission` row. |
| REQ-063 | Admin-only `cancelAttempt` — deletes a stuck/wrong booking outright (events/answers/submission cascade), distinct from a real integrity decision | 🟢 PASS | `app/src/lib/proctoring.ts:271-305` | Tested: `proctoring.test.ts` "cancelAttempt deletes a booking outright, refuses for roles without exam_attempt:delete, and frees the slot to re-book". Audit row captures the destroyed answer count before deletion — good forensic practice. |
| REQ-064 | Proctor-relevant actions (approve start, verify submission, cancel) write audit records | 🟢 PASS | `app/src/lib/proctoring.ts:169-184,249-257,290-304` | Directly confirmed for all three; also indirectly covered by `audit-coverage.test.ts`. |
| REQ-065 | Proctor waiting screens use polling (documented ~5s interval), consistent with the app having no WebSocket/SSE infra anywhere | 🟢 PASS | `app/src/components/ExamEntryGate.tsx:22` (`PROCTOR_POLL_INTERVAL_MS = 5000`), result page `app/src/app/(app)/attempts/[attemptId]/result/page.tsx:44` (`AutoRefresh intervalMs={5000}`) | Directly confirmed; matches `docs/NEXT_PHASE_PLAN.md`'s explicitly-confirmed design decision. |

### 1.9 Attempt-Taking: Timer, Autosave, Integrity Monitoring

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-066 | Server-authoritative exam deadline, enforced on every write path (not just displayed) — master prompt §18/A-01 fix | 🟢 PASS | `app/src/lib/attempts.ts:104-148` (`attemptDeadline`, `isAttemptExpired`), enforced in `saveAnswers` at line 422-429 | This is the audited-and-fixed A-01 finding. Tested extensively: `attempt-expiry.test.ts` (11 tests) including a real-Postgres regression proving a late write is refused and the attempt auto-finalizes. `ExamCountdown.tsx`'s docstring was also directly confirmed corrected (no longer falsely claims server enforcement — `ExamCountdown.tsx:10-22`). |
| REQ-067 | Client-side live countdown, auto-submits at zero (courtesy UI only) | 🟢 PASS | `app/src/components/ExamCountdown.tsx` | Directly read; explicitly documented as non-authoritative, consistent with REQ-066. |
| REQ-068 | Auto-save (batched upsert), refuses a save into someone else's or a non-`IN_PROGRESS` attempt | 🟢 PASS | `app/src/lib/attempts.ts:399-454` | Tested: `attempts.test.ts` "saves answers, auto-grades the objective question on submit, and leaves the essay pending". |
| REQ-069 | Flagging a question never overwrites an already-saved response (flag-only save) | 🟢 PASS | `app/src/lib/attempts.ts:444-446` (comment explains: `responseData` omitted, not nulled) | Tested: `attempts.test.ts` "flags a question without answering it, without clobbering a later real answer". |
| REQ-070 | Atomic submission — concurrent double-submit produces exactly one `Submission` row (A-03 fix) | 🟢 PASS | `app/src/lib/attempts.ts:532-545` — conditional `updateMany` claim, affected-count 0 treated as already-finalized | Tested: `attempt-expiry.test.ts` "finalizes only once when two submissions race (A-03 guard)". |
| REQ-071 | 3-strike integrity monitor: event log (not a bare counter), auto-pause on the 3rd strike | 🟢 PASS | `app/src/lib/integrity.ts:36-80`; client signals: `app/src/components/IntegrityMonitor.tsx` | Tested: `integrity.test.ts` (5 tests) incl. "counts warnings from the event log and auto-pauses at the 3rd". |
| REQ-072 | Network connectivity drops are logged for context but never count toward the 3-strike threshold | 🟢 PASS | `app/src/lib/integrity.ts:19` (`STRIKE_EVENT_TYPES` excludes `NETWORK_OFFLINE`/`NETWORK_ONLINE`) | Tested: `integrity.test.ts` "logs network connectivity events but never counts them toward the strike threshold". Single exported definition used by both the review UI and the count query — no risk of the two drifting. |
| REQ-073 | Faculty "Pending Integrity Review" — REINSTATE (paused time credited back) or FAIL (→ TERMINATED, human decision) | 🟢 PASS | `app/src/lib/integrity.ts:145-214`; `app/src/app/(app)/attempts/[attemptId]/review/page.tsx` | Tested: `integrity.test.ts` "confirming a violation terminates the attempt, and further events don't re-trigger anything". Paused-time credit-back verified via shared `creditBackPausedTime` (`attempts.ts:138-148`). |
| REQ-074 | A STUDENT can never view the integrity review screen, not even their own | 🟢 PASS | `app/src/lib/integrity.ts:118-120` (explicit role check, coarser `grade:"read"` permission deliberately overridden) | Tested: `integrity.test.ts` "a student can never load the integrity review screen, not even their own". |
| REQ-075 | Self-service resume via a faculty-set Universal Resume Code, independent of faculty review | 🟢 PASS | `app/src/lib/integrity.ts:234-281` | **No dedicated test exists** (`grep` of `integrity.test.ts` shows no test for `resumeAttemptWithCode`). Logic read directly and is correct: checks `attempt.studentId === actor.id`, compares the code, credits back paused time identically to the faculty path. Graded PASS-by-inspection (simple, direct comparison logic) but flagged as an untested path for a feature that bypasses human review. |
| REQ-076 | Exam navigation: flag/unflag, question palette, filter (All/Unanswered/Flagged), backward-navigation enforcement (`allowBacktracking`) | 🟡 PARTIAL | `app/src/components/ExamQuestionPager.tsx` (flag, palette, filter — confirmed wired into `attempts/[attemptId]/page.tsx`) | Flag/palette/filter are real, client-side, and match `docs/PITCH_ROADMAP.md` Milestone 8's description. **`allowBacktracking` itself was not confirmed enforced** — grepped `ExamQuestionPager.tsx` and the attempt page for a `allowBacktracking` read; it is read only in `ExamDownloadGate.tsx`'s settings-display tile (`ExamDownloadGate.tsx:365-367`), never to actually disable a "Previous" action in the pager. Same "set but not enforced" pattern as REQ-041 — master prompt §17 explicitly requires this to be enforced, not just displayed: *"Respect exam configuration... The client must actually enforce it. Do not rely on hidden UI buttons alone."* |

### 1.10 Grading — Automatic & Manual

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-077 | Auto-grading for MC/MR/TF (exact-match, full-credit-or-nothing) | 🟢 PASS | `app/src/lib/attempts.ts:461-479` (`autoGradePoints`) | Tested: `attempts.test.ts` "saves answers, auto-grades the objective question on submit". No partial credit — explicitly documented as a Phase 1 limitation (`PROJECT_STATUS.md`, `docs/WORLD_CLASS_AUDIT.md` A-12), matches `LACKING.txt`'s still-open ask. |
| REQ-078 | Essay/short-answer always requires manual grading | 🟢 PASS | `app/src/lib/attempts.ts:467-469` | Directly confirmed — returns `null`, which `finalizeAttempt` correctly treats as "not all graded" (line 526-528). |
| REQ-079 | Manual grade assignment, clamped to `[0, examQuestion.points]` | 🟢 PASS | `app/src/lib/grading.ts:136-190` (`gradeAnswer`) | Tested: `attempts.test.ts` "clamps a grade above the question's max points"; `audit-coverage.test.ts` "clamps out-of-range grades and records that it did". |
| REQ-080 | Attempt transitions to `GRADED` automatically once every answer has a non-null `pointsAwarded` | 🟢 PASS | `app/src/lib/grading.ts:185-189` | Tested: `attempts.test.ts` "faculty grading the pending essay completes the attempt". |
| REQ-081 | Grade changes are audited, recording the previous value (appeal-critical) | 🟢 PASS | `app/src/lib/grading.ts:162-183` | Tested: `audit-coverage.test.ts` "records a grade change WITH the previous value — the appeal-critical detail". |
| REQ-082 | Grading queue readable (rendered response text, not raw JSON), pending-count context | 🟢 PASS | Per `docs/PITCH_ROADMAP.md` Milestone 5.5, confirmed as an area the codebase explicitly fixed | Not independently re-verified by rendering the page live this session (see §4) — graded PASS on the strength of direct code read of `grading.ts`'s data shape plus the documented, dated fix; flagged as **not visually re-confirmed**. |

### 1.11 Results & Reporting

*Reverse-engineered in full for everything beyond the basic student result page — no doc describes the Reporting module (post-dates `PITCH_ROADMAP.md`).*

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-083 | Student result page shows score breakdown per question with correct/incorrect/pending marks | 🟢 PASS | `app/src/app/(app)/attempts/[attemptId]/result/page.tsx:57-98,139-178` | Ownership-checked via `getAttemptResult` (`attempts.ts:611-651`, `AttemptOwnershipError`). "Correct" strictly means full credit (line 153) — a documented, honest choice, not a bug. |
| REQ-084 | **Faculty Reporting overview (class roster, per-student scores, histogram, class average) is restricted to faculty/admin who can see this exam** | 🔴 **FAIL** | `app/src/lib/reporting.ts:66-96` (`getExamReportingOverview`) calls `assertCan(actor.role, "grade", "read")` (line 71) then `assertFacultyAssignedToCourse` (line 96). Page: `app/src/app/(app)/exams/[examId]/reporting/page.tsx:18-39` has **no role check at all** beyond `session.user.id` existing. | **Concrete, exploitable authorization bug, found by direct code read.** `rbac.ts:78-84` grants `STUDENT` the permission `grade: ["read"]` (intended for the student's own result page). `assertCan(actor.role, "grade", "read")` therefore **passes for any authenticated STUDENT**. `assertFacultyAssignedToCourse` (`courses.ts:60-62`) then **no-ops for any non-FACULTY role** (`if (actor.role !== "FACULTY") return;`) — it was written assuming only institution-wide *staff* roles (INSTITUTION_ADMIN, SUPER_ADMIN) reach this function, but STUDENT reaches it too via the shared `grade:"read"` permission, and gets treated as "institution-wide" by omission. **Failure scenario:** any logged-in STUDENT in the institution navigates directly to `/exams/<any-exam-id-in-the-institution>/reporting` — no link needs to exist in the UI, the exam id is guessable/enumerable or visible from other pages. They see the full list of every student's name, raw score, and percent-correct for that exam, plus the class average, histogram, and low/high scores — for **any course in the institution, including ones they are not enrolled in.** This is a materially more severe instance of the exact bug Milestone 6.6 (`docs/PITCH_ROADMAP.md`) already found and fixed once for FACULTY — the fix pattern (`assertFacultyAssignedToCourse`) was never extended to also check "is this actor even a staff role" before treating a non-FACULTY caller as institution-wide. **Zero test coverage exists for `reporting.ts`** (no `reporting.test.ts` file) — this is exactly the kind of gap that class of test would have caught immediately (a test modeled on the existing `courses.test.ts` "refuses a faculty member who isn't assigned" pattern, run with a STUDENT actor instead, would fail on current code). **Remediation:** `getExamReportingOverview`, `getStudentReportDetail`, and `releaseResults` all need an explicit role check (e.g. reject any role that isn't FACULTY/INSTITUTION_ADMIN/SUPER_ADMIN before doing anything else), not a reuse of the STUDENT-inclusive `grade:"read"` permission alone. |
| REQ-085 | **Individual Strengths & Opportunities (S&O) report for one student, with rank/percentile among classmates** | 🔴 **FAIL** | `app/src/app/(app)/exams/[examId]/reporting/[attemptId]/page.tsx:15-18` — no role check at all, same as REQ-084 | Same root cause as REQ-084 (`getStudentReportDetail` calls `getExamReportingOverview` internally, `reporting.ts:182`). **Failure scenario:** a student navigating to `/exams/<examId>/reporting/<any-classmate's-attemptId>` sees that classmate's full name, exact percent score, and per-question point breakdown — a specific, named-individual grade disclosure to another student, which is a FERPA-adjacent real-world liability for a law-school pilot, not just a generic info leak. |
| REQ-086 | **"Release Results" is restricted to faculty/admin who can grade this exam's course** | 🔴 **FAIL** | `app/src/lib/reporting.ts:231-247` (`releaseResults`) — same `grade:"read"` gate as REQ-084; wired via `releaseResultsAction` at `app/src/app/(app)/exams/[examId]/reporting/page.tsx:41-51`, itself reachable from any STUDENT who reaches the page from REQ-084 | Same root cause. A STUDENT who found the reporting page (REQ-084) can also submit the `ReleaseResultsModal` form and call `releaseResultsAction` for arbitrary `attemptId`s in that exam — releasing (or re-releasing) results early for classmates, bypassing the faculty's deliberate release-timing control. Lower likelihood of casual discovery than REQ-084/085 (requires knowing the form exists) but the server has no defense if it's used. |
| REQ-087 | Benchmark Combined Report page-level gate | 🟡 PARTIAL | `app/src/app/(app)/exams/[examId]/benchmark-report/page.tsx:13-15` — has an explicit `can(session.user.role, "grade", "read")` check, unlike REQ-084/085 | This page *attempted* the fix REQ-084/085 are missing, but used the same flawed permission (`grade:"read"`, which STUDENT holds) — so the check exists in the code but **does not actually exclude STUDENT**, same root cause as REQ-084. Graded PARTIAL rather than FAIL because a defensive check is present (better posture than the other two pages) even though it doesn't achieve its goal; the underlying data exposed here (aggregate course-name + average-score rows, no individual student names) is materially less sensitive than REQ-084/085. |
| REQ-088 | Reporting-page release status ("Results Released" indicator per student) | 🟢 PASS | `app/src/lib/reporting.ts:113` (`resultsReleasedAt` surfaced in `ReportingStudentRow`); rendered via `ReportingStudentsTable.tsx` (import-confirmed wired) | Read directly; correct given the authorization issue above is a separate concern from the feature's own correctness. |
| REQ-089 | Print-friendly S&O report | 🟢 PASS | `app/src/components/PrintButton.tsx`, wired into `reporting/[attemptId]/page.tsx` (import-confirmed) | Component wiring confirmed; visual print output not verified (see §4). |
| REQ-090 | Simulated national average is clearly and honestly labeled as not real data | 🟢 PASS | `app/src/lib/reporting.ts:17-23,231(comment)`, `app/src/lib/benchmarks.ts:182-189`; UI disclosure confirmed at `reporting/page.tsx:147-151` ("Simulated national average — for demonstration only... no connection to ExamSoft's actual national norms") | Directly confirmed in both the computing code's docstring and the rendered UI copy — consistent, honest framing carried all the way through. |

### 1.12 Audit Logging

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-091 | Append-only `AuditLog` table (WHO/WHAT/WHEN/WHERE/RESULT, master prompt §20) | 🟢 PASS | `prisma/schema.prisma:537-554` | No application code path updates or deletes a row — confirmed by grepping for `auditLog.update`/`auditLog.delete` (zero matches). |
| REQ-092 | Audit coverage extends to every mutating domain service, not just login (A-05 fix) | 🟢 PASS | Centralized vocabulary: `app/src/lib/audit.ts:27-55` (`AUDIT_ACTIONS`); call sites confirmed directly in `exams.ts`, `grading.ts`, `proctoring.ts`, `integrity.ts`, `users.ts`, `roster-import.ts` | Tested: `audit-coverage.test.ts` (6 tests). **Gap found:** `departments.ts` (create/update/delete) and `courses.ts` (create/update/delete, assign/unassign) have **no `logAudit` calls at all**, despite `AUDIT_ACTIONS` already defining `courseCreate`/`courseUpdate`/`courseDelete` (`audit.ts:51-53`) — the constants exist but were never wired into `courses.ts`. This is a real, narrow regression of the same class A-05 already fixed once elsewhere; not the FAIL-worthy severity of REQ-084 (this only means "some events aren't logged," not "unauthorized access"), so graded PARTIAL, not FAIL — see REQ-093. |
| REQ-093 | Course/department create/update/delete are audit-logged | 🟡 PARTIAL | `app/src/lib/courses.ts` (no `logAudit` import at all), `app/src/lib/departments.ts` (same) | Directly confirmed absent by grep (`grep -n "logAudit" courses.ts departments.ts` → no matches) even though `AUDIT_ACTIONS.courseCreate/courseUpdate/courseDelete` are defined and unused. Institution onboarding (`institutions.ts`) is similarly unaudited. |
| REQ-094 | Audit log viewer — tenant-scoped, filterable by result and action prefix | 🟢 PASS | `app/src/lib/audit.ts:108-122`; page `app/src/app/(app)/audit/page.tsx` (import-confirmed), gated by `audit_log:"read"` (SUPER_ADMIN/PLATFORM_ADMIN/INSTITUTION_ADMIN only per `rbac.ts:36,41,63`) | Tested: `audit.test.ts` (4 tests) incl. "refuses roles without audit_log:read", tenant scoping, result/prefix filters. |
| REQ-095 | Project documentation accurately describes the shipped system (master prompt §33: "must describe the actual system, not the intended system") | 🔴 **FAIL** | `docs/PITCH_ROADMAP.md` (last entry: Milestone 8, commit `a86a785`-era); `git log` shows commits `5503b98` through `0271c8f` (Departments, Benchmarks, Post Assessment Settings, install ceremony, faculty portal reskin, Reporting module, real device check) with **zero corresponding documentation update**. `PROJECT_STATUS.md` itself already flags its *own* prior drift as finding A-08 and was "fixed" — but the fix didn't prevent a second round of the same drift one layer down, in `PITCH_ROADMAP.md`. | This is a repeat of the exact failure mode `docs/WORLD_CLASS_AUDIT.md` A-08 already found and marked resolved — the discipline didn't hold past that fix. Concretely, an engineer reading `docs/` today would not learn that Departments, Benchmark Assessments, Post Assessment Settings, or the Reporting module exist at all, nor would they find the REQ-052/084/085/086 bugs documented as known gaps — they're undocumented, not disclosed-and-deferred. |

### 1.13 Admin / User Management

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-096 | Create user (INSTITUTION_ADMIN/FACULTY/PROCTOR/STUDENT only — never SUPER_ADMIN/PLATFORM_ADMIN via this path) | 🟢 PASS | `app/src/lib/users.ts:14,31-64` (`CREATABLE_ROLES`) | Tested: `users.test.ts` "refuses to create a platform-level role". |
| REQ-097 | Global email uniqueness enforced across institutions | 🟢 PASS | `app/src/lib/users.ts:40-43` (unscoped `forPlatform()` lookup, deliberately not tenant-scoped) | Tested: `users.test.ts` "refuses a duplicate email even across institutions". |
| REQ-098 | Deactivate/reactivate a user; deactivation immediately revokes existing sessions (not just blocks future logins) | 🟢 PASS | `app/src/lib/users.ts:80-104` | Tested: `session-validity.test.ts` "DEACTIVATION stamps a cutoff, so a live session is revoked on its next request". |
| REQ-099 | Admin-initiated password reset; also revokes existing sessions | 🟢 PASS | `app/src/lib/users.ts:111-139` | Tested: `session-validity.test.ts` "PASSWORD RESET revokes existing sessions". No self-service (email-based) reset exists — explicitly documented as an open item in `docs/WORLD_CLASS_ROADMAP.md` P1-2 and `LACKING.txt`, not a hidden gap. |
| REQ-100 | Password/credential values are never written to the audit log in plaintext or hash | 🟢 PASS | `app/src/lib/users.ts:52-61,93-101,130-138` — metadata objects contain only `email`/`role`, never `passwordHash` | Tested: `audit-coverage.test.ts` "records user creation, deactivation and password reset — without ever storing the password". |
| REQ-101 | `/admin` and `/users` pages are role-gated server-side (not just hidden nav links) | 🟢 PASS | `app/src/app/(app)/admin/page.tsx:16-17`, `app/src/app/(app)/users/page.tsx:20-21` | Directly confirmed — both redirect non-authorized roles before any data fetch. |

### 1.14 Roster Import

| ID | Requirement / Deliverable | Status | Evidence / Code Location | Notes / Failure Reason |
| :--- | :--- | :---: | :--- | :--- |
| REQ-102 | CSV parsing is pure/validated separately from DB writes (testable in isolation) | 🟢 PASS | `app/src/lib/roster-import.ts:38-77` (`parseRosterCsv`) | Tested: 6 pure-parsing tests in `roster-import.test.ts`. |
| REQ-103 | All-or-nothing import — one bad row (including a would-be new account) means nothing is written | 🟢 PASS | `app/src/lib/roster-import.ts:200-203` | Tested: `roster-import.test.ts` "creates nothing if any row in the batch is invalid (all-or-nothing, including new accounts)". |
| REQ-104 | Auto-creates missing accounts with a generated temp password; roster CSV never changes an existing account's role or institution | 🟢 PASS | `app/src/lib/roster-import.ts:151-282` | Tested: "refuses to change an existing account's role instead of creating a duplicate", "refuses an email already registered to a different institution". |
| REQ-105 | Temp passwords are never persisted in plaintext or logged — one-time, in-memory, read-once reveal | 🟢 PASS | `app/src/lib/roster-import.ts:110-127` (`consumeCreatedCredentials` deletes on read) | Tested: `roster-import.test.ts` "creates a missing account with a working temp password... and one-time-reveals the credential"; explicitly documented as a single-instance-only mechanism (`roster-import.ts:104-109`), consistent with the rest of Phase 1's single-instance scope. |
| REQ-106 | Roster import writes an audit record listing created accounts (never their passwords) | 🟢 PASS | `app/src/lib/roster-import.ts:261-274` | Directly confirmed — `createdAccounts` metadata carries only `email`/`role`. |

---

## Matrix summary

| Status | Count |
| :--- | ---: |
| 🟢 PASS | 94 |
| 🟡 PARTIAL / INCONCLUSIVE | 7 |
| 🔴 FAIL | 5 |
| **Total REQ rows** | **106** |

*(Row count verified by direct grep of the matrix tables above: REQ-001 through REQ-106, none skipped, none duplicated.)*

---

## 2. Automated Scan Findings & Root Cause Analysis

### 🔴 Critical Failures & Gaps

- **REQ-084 / REQ-085 / REQ-086 — Any STUDENT can view and act on another course's grade data via the Reporting module.**
  - **Root Cause:** `getExamReportingOverview`, `getStudentReportDetail`, and `releaseResults` (`app/src/lib/reporting.ts`) gate on `assertCan(actor.role, "grade", "read")`, a permission STUDENT legitimately holds for their *own* result page (`app/src/lib/rbac.ts:78-84`). The per-course boundary these functions then call, `assertFacultyAssignedToCourse` (`app/src/lib/courses.ts:55-68`), was written for the FACULTY-vs-institution-wide-staff distinction and silently no-ops for *any* non-FACULTY caller — including STUDENT, a role its author never intended to reach this code path. The corresponding page routes (`app/src/app/(app)/exams/[examId]/reporting/page.tsx`, `.../reporting/[attemptId]/page.tsx`) add no page-level role check to compensate, unlike the sibling `courses/[courseId]/page.tsx` and `admin/page.tsx`, which do.
  - **Remediation:** Add an explicit role allow-list (FACULTY, INSTITUTION_ADMIN, SUPER_ADMIN, PLATFORM_ADMIN) at the top of all three `reporting.ts` functions, independent of the shared `grade:"read"` permission — do not rely on `assertFacultyAssignedToCourse`'s no-op behavior to imply "safe for everyone else." Add a `reporting.test.ts` modeled on `courses.test.ts`'s existing "refuses a faculty member who isn't assigned" pattern, but asserting a STUDENT actor is refused outright. Also add the page-level redirect the other admin/faculty-only pages already have, as defense in depth.

- **REQ-052 — The newly-shipped real camera/microphone device check (`DeviceAndIdentityCheck.tsx`) cannot function at all.**
  - **Root Cause:** `app/next.config.ts:20` sets `Permissions-Policy: camera=(), microphone=(), geolocation=()` on every route. An empty allowlist blocks the feature in every browsing context, including same-origin. `DeviceAndIdentityCheck.tsx` (added in the most recent commit) calls `navigator.mediaDevices.getUserMedia({video:true, audio:true})`, which the browser refuses before any user-facing permission prompt appears. The header predates the feature and nobody re-checked it when the feature was added.
  - **Remediation:** Change the header to `camera=(self), microphone=(self), geolocation=()` (keep geolocation locked down — nothing in the app uses it). Add a Playwright spec that actually grants camera/mic permissions and asserts `DeviceAndIdentityCheck` reaches its `device-check` phase, not just the `denied` phase — the existing test suite has no coverage that would have caught this, since it's a browser-security-header interaction, not a unit-testable one.

- **REQ-093 — Course and department mutations are not audit-logged, despite the action constants already existing.**
  - **Root Cause:** `AUDIT_ACTIONS.courseCreate`/`courseUpdate`/`courseDelete` were defined in `app/src/lib/audit.ts` (likely during the A-05 remediation pass) but the corresponding calls were never added to `app/src/lib/courses.ts` or `app/src/lib/departments.ts`. Lower severity than the reporting-module finding — this is a logging gap, not an access-control gap — but it directly undermines the same institutional-trust question the A-05 fix was built to answer ("who changed this course/department, and when?").
  - **Remediation:** Add `logAudit(...)` calls to `createCourse`, `updateCourse`, `deleteCourse`, `assignFaculty`/`unassignFaculty`, `assignProctor`/`unassignProctor`, `enrollStudent`/`unenrollStudent` in `courses.ts`, and `createDepartment`/`updateDepartment`/`deleteDepartment` in `departments.ts`, using the already-defined `AUDIT_ACTIONS` constants. Extend `audit-coverage.test.ts` to cover them.

- **REQ-095 — Documentation has drifted from the shipped system a second time, in the same way A-08 already flagged once.**
  - **Root Cause:** No process step ties a merged feature commit to a `docs/PITCH_ROADMAP.md` (or equivalent) update — the discipline held through Milestone 8 and then lapsed for the next 16 commits.
  - **Remediation:** Add a Milestone 9 entry to `docs/PITCH_ROADMAP.md` covering Departments, Benchmark Assessments, Post Assessment Settings, the install/register ceremony, the faculty portal reskin, the Reporting module, and the real device check — including the REQ-052/084/085/086/093 findings above as known-and-being-fixed, not silently patched.

### 🟡 Notable Partial/Inconclusive Areas (not FAILs, but worth tightening)

- **REQ-041 / REQ-076 — `randomizeQuestions`, `randomizeAnswers`, and `allowBacktracking` are stored exam settings with no enforcement in the exam-taking UI.** Unlike `calculatorAllowed`/`spellCheckAllowed`/etc. (REQ-038), which are honestly disclosed in the schema comment as "stored, not yet enforced," these three are not flagged anywhere as a known gap — a faculty member setting `allowBacktracking: false` today gets no actual behavior change, which directly contradicts master prompt §17's explicit instruction not to rely on a hidden UI button. Recommend either enforcing these three in `ExamQuestionPager.tsx`/`getAttemptForTaking`, or adding the same honest "stored but not yet enforced" disclosure the other flags already have.
- **REQ-018, REQ-044, REQ-045, REQ-057, REQ-058, REQ-075 — Zero automated test coverage for `departments.ts`, `benchmarks.ts`, `reporting.ts` (compounding the REQ-084 severity), `validateAndRecordDownload`, and `resumeAttemptWithCode`.** Five of 23 `lib/` modules (`departments.ts`, `benchmarks.ts`, `reporting.ts`, `device-registration.ts`, `branding.ts`) have no dedicated test file at all — `reporting.ts` in particular is where the most serious finding in this audit lived undetected.
- **Lint gate is not clean, contradicting `PROJECT_STATUS.md`'s "clean typecheck, lint and build" claim.** `npx eslint .` (run live this session) reports **5 errors, 1 warning** across 4 files, all in code shipped after `PROJECT_STATUS.md`'s last update:
  - `app/src/app/(app)/departments/[departmentId]/page.tsx:98` — raw `<a>` instead of `next/link` (`@next/next/no-html-link-for-pages`).
  - `app/src/components/AutosaveStatus.tsx:19` and `app/src/components/ExamDownloadGate.tsx:148` — `Date.now()` called during render (`react-hooks/purity`).
  - `app/src/components/ExamDownloadGate.tsx:170` and `app/src/components/ThemeToggle.tsx:17` — `setState` called synchronously inside a `useEffect` body (`react-hooks/set-state-in-effect`).
  - `app/src/components/DeviceAndIdentityCheck.tsx:201` — `<img>` instead of `next/image` (warning only).
  None of these are severe (no broken behavior observed from the purity/effect warnings — React 19's newer lint rules are stricter than a correctness bar), but the claim of a clean lint gate is currently false and should be corrected or the lint errors fixed.

---

## 3. Manual Testing Plan & Execution List

### Prerequisites

- [ ] Two physical or virtual machines (or two browser profiles with independent camera/mic permission state) — one for the STUDENT actor, one for the PROCTOR/FACULTY actor, since several scenarios below require two live participants coordinating in real time.
- [ ] A real webcam and microphone on at least one test device (for REQ-052/053/054 scenarios) — a device with **no** camera attached, to test the "unsupported" path distinctly from "denied."
- [ ] Chrome, Firefox, and Safari (or Edge if Safari is unavailable) installed, each in a clean profile with no saved camera/mic permission decisions for the app's origin.
- [ ] Seeded demo accounts per `docs/ARCHITECTURE.md`: `admin@cmlaw.demo`, `faculty@cmlaw.demo`, `student@cmlaw.demo`, `proctor@cmlaw.demo` (per `docs/PITCH_ROADMAP.md` Milestone 5), all password `DemoPass!2026`. Run `npm run seed` from `app/` against a running `docker compose up -d` Postgres first if the database is fresh.
- [ ] `npm run dev` running against the local stack, or a deployed staging URL — record which in each scenario's Actual Result.
- [ ] A stopwatch or the OS clock, for scenarios timing exact seconds.
- [ ] Browser DevTools open to the Network and Console tabs throughout, to catch silent failures the UI itself wouldn't surface.

---

### Scenario 1 — Camera/microphone device check actually works (verifies the REQ-052 fix, or documents the current failure)

**Objective:** Confirm whether a student can complete the real `DeviceAndIdentityCheck` step, given the `Permissions-Policy` conflict found in this audit.

**Target Component/Page:** `ExamEntryGate` → `DeviceAndIdentityCheck` (reached via booking an exam with `examMonitoringEnabled: true`).

**Preconditions:** Logged in as `student@cmlaw.demo`, enrolled in a course with a published exam that has `examMonitoringEnabled` true (the schema default). Browser has never been asked for camera/mic permission on this origin before (clean profile, or manually reset the site permission).

**Test Steps:**
1. Navigate to the course's exam list and click into the target exam.
2. Complete the booking flow (confirm the window or pick a time) through to the receipt screen.
3. Click "Continue to Exam Rules," check "I have read and agree," click "Start Exam."
4. Observe what happens at the "Device Check" step — specifically, whether the browser's native camera/microphone permission prompt appears at all.
5. Open DevTools Console and look for a `Permissions-Policy` or `NotAllowedError` message logged around this moment.
6. If a permission prompt appears, click **Allow** and continue to observe whether the live video preview renders and the mic-level meter moves when you speak.
7. If no prompt appears, note the exact on-screen error text shown by `DeviceAndIdentityCheck`.

**Expected Result:** The browser's native camera/mic permission prompt appears; after allowing, a live video preview renders and the microphone level meter visibly responds to speech.

**Actual Result:** [ ] Pass  [ ] Fail — describe: _______________________

**Notes:** Per this audit's REQ-052 finding, the expected result is predicted to **fail** — no permission prompt should appear at all, and the UI should show "Camera/microphone access was blocked" immediately. If it does prompt and work, the `Permissions-Policy` header may have already been fixed since this report was written, or differs by deployment target (verify `next.config.ts:20` directly if the result is unexpected).

---

### Scenario 2 — Camera/mic device check on a machine with no camera at all

**Target Component/Page:** `DeviceAndIdentityCheck`.

**Preconditions:** A test machine or VM with no camera/microphone hardware attached (or both disabled in OS settings).

**Test Steps:**
1. Repeat Scenario 1, steps 1-4, on the camera-less machine.
2. Observe the error message shown.
3. Click "Continue without ExamID/ExamMonitor."
4. Confirm the gate proceeds to the proctor-wait step without hanging or erroring.

**Expected Result:** Message reads "No camera or microphone was found on this device" (distinct wording from the permission-denied case), and clicking through does not block exam entry.

**Actual Result:** [ ] Pass  [ ] Fail

**Notes:** Confirms the `NotFoundError` branch (`DeviceAndIdentityCheck.tsx:93-94`) is reachable and distinct from `NotAllowedError`, and that the soft-check posture (REQ-053) genuinely doesn't block entry.

---

### Scenario 3 — Real-time proctor approval, two live participants

**Target Component/Page:** `ExamEntryGate`'s proctor-wait step + `/proctor` dashboard.

**Preconditions:** Two separate browser sessions (different machines or private-browsing windows) — one logged in as `student@cmlaw.demo`, one as `proctor@cmlaw.demo` (assigned to the student's course). Student has an unstarted, published, bookable exam available.

**Test Steps:**
1. On the student session: book the exam, proceed through Exam Rules and (if applicable) the device check, reaching the "Waiting for proctor approval…" screen. Start a stopwatch at this moment.
2. On the proctor session: navigate to `/proctor`, confirm the student's request appears in the pending-approvals queue within 5-10 seconds of step 1.
3. Click "Approve" on the proctor session.
4. On the student session, without refreshing the page, observe how long it takes for the waiting screen to advance to "Starting your exam…" and then the actual exam UI. Stop the stopwatch.
5. Record the elapsed seconds.

**Expected Result:** The proctor sees the request within ~5 seconds of the student reaching the wait screen (matches `PROCTOR_POLL_INTERVAL_MS`... actually the proctor dashboard itself needs a manual refresh or its own poll — verify whether `/proctor` auto-refreshes or requires a manual reload). The student's screen advances within 5-10 seconds of the proctor's approval click (one polling interval).

**Actual Result:** [ ] Pass  [ ] Fail — elapsed seconds: _______

**Notes:** This is exactly the class of real-time-coordination behavior that cannot be verified by reading code — confirm whether `/proctor` itself polls/auto-refreshes (check for an `AutoRefresh` component on that page) or requires the proctor to manually reload to see new requests, since that materially affects real-world usability even if the underlying gate logic is correct.

---

### Scenario 4 — Post-submission "approve to finish" gate, two live participants

**Target Component/Page:** `/attempts/[attemptId]/result` waiting screen + `/proctor` verification queue.

**Preconditions:** Continuing from Scenario 3 (or a fresh attempt), with the student now inside the exam.

**Test Steps:**
1. On the student session: answer at least one question, then submit the exam.
2. Observe the student lands on a "Waiting for your proctor to approve closing out your session" screen, not the score.
3. On the proctor session: navigate to `/proctor`, find the submission in the "waiting on verification" queue.
4. Click "Verify"/"Approve to finish."
5. On the student session, without manually refreshing, time how long until the screen updates to show the actual score.

**Expected Result:** Student cannot see their score until the proctor verifies; the screen updates automatically (via polling) within ~5-10 seconds of verification, without a manual refresh.

**Actual Result:** [ ] Pass  [ ] Fail — elapsed seconds: _______

**Notes:** Confirms `AutoRefresh intervalMs={5000}` (`result/page.tsx:44`) actually re-renders the server component on an interval in a real browser, not just that the code exists.

---

### Scenario 5 — Timer expiry under real network latency

**Target Component/Page:** Exam-taking page (`/attempts/[attemptId]`), `ExamCountdown`.

**Preconditions:** An exam with a short time limit (1-2 minutes — create one specifically for this test as faculty, or use a throwaway DRAFT exam edited to a 1-minute limit before publishing). Logged in as a student mid-attempt.

**Test Steps:**
1. Start the attempt and let the countdown run down normally, answering questions as time passes.
2. In DevTools, throttle the network to "Slow 3G" (Network tab) roughly 15 seconds before the timer is expected to hit zero.
3. Observe the countdown's behavior as it crosses zero under the throttled connection — does the auto-submit click fire, and does the resulting network request complete?
4. Once it resolves (successfully or with an error), note whether the student lands on the result page, an error page, or a hung loading state.
5. Repeat once more with the network fully offline (DevTools "Offline" preset) at the moment the timer hits zero, then restore connectivity after ~10 seconds and observe recovery.

**Expected Result:** Under throttling, the auto-submit eventually succeeds (possibly with a visible delay) and the student reaches their result. Under a genuine offline moment at expiry, the auto-submit request should fail; verify what the UI shows (a stuck spinner is a real UX gap even if the server-side deadline enforcement in `saveAnswers`/`submitAttempt` is correct — REQ-066 confirms the *server* can't be cheated by this, but doesn't guarantee a graceful *client* experience).

**Actual Result:** [ ] Pass  [ ] Fail — describe UI behavior on both runs: _______________________

**Notes:** This directly probes the documented, known limitation ("a dropped connection mid-exam can still lose unsaved answers" — `PROJECT_STATUS.md`) — the goal here is to characterize exactly what the student sees, not just confirm the limitation exists.

---

### Scenario 6 — Multi-tab / duplicate-session behavior during an active attempt

**Target Component/Page:** Exam-taking page.

**Preconditions:** Logged in as a student with an `IN_PROGRESS` attempt.

**Test Steps:**
1. Open the same attempt URL (`/attempts/[attemptId]`) in a second tab of the same browser (same session cookie).
2. Answer a question differently in each tab.
3. Save progress in Tab A, then Tab B.
4. Reload Tab A and check which answer is now showing.
5. Trigger a `WINDOW_BLUR` integrity event by switching from Tab A to Tab B (both are the same app, but switching browser focus away from Tab A's window still fires a `blur` event on it) — check whether this is (incorrectly) counted as a strike, since the student never actually left the application.

**Expected Result:** Last-write-wins on the answer (Tab B's save should be what persists, assuming it saved after Tab A). Document whether switching between two tabs of the *same* app trips the integrity monitor — this is a plausible false-positive the automated tests (which only exercise `recordAttemptEvent` directly, not real multi-tab browser behavior) cannot catch.

**Actual Result:** [ ] Pass  [ ] Fail — describe: _______________________

**Notes:** `docs/LIVE_TEST_REPORT.md` notes a related real bug found during manual multi-tab testing (session cookie clobbering when driving two *different* users in two tabs of the same browser) — this scenario is the same-user variant, which is a different and more commonly-hit case (a student legitimately opening a second tab).

---

### Scenario 7 — Dark mode rendering across all four role dashboards

**Target Component/Page:** Every major page, `ThemeToggle`.

**Preconditions:** One account per role (admin, faculty, proctor, student) available to log in as.

**Test Steps:**
1. Log in as each role in turn.
2. Toggle dark mode on via `ThemeToggle` in the header.
3. Visit that role's dashboard, their primary work page (question bank/exam builder for faculty, proctor queue for proctor, exam list for student, users/audit for admin), and one modal (Create Course, Create Department, Duplicate Assessment, Release Results — whichever is reachable for that role).
4. Check for: unreadable text (low contrast), any element that stays light-background in dark mode (a component that didn't pick up the dark-mode class), and the brand-color accents rendering sensibly against a dark background.
5. Reload the page while dark mode is active and confirm no flash-of-light-mode before the dark class applies.

**Expected Result:** All text remains readable, no stray light-mode elements, brand accent colors remain visible against the dark background, no flash on reload.

**Actual Result:** [ ] Pass  [ ] Fail — list any specific broken elements: _______________________

**Notes:** `ThemeToggle.tsx`'s `useEffect`-based class detection (flagged in §2's lint findings) reads `document.documentElement.classList` after mount — worth specifically watching for a brief incorrect toggle-button state on load, which is the kind of cosmetic bug the lint rule is warning about but which only a live render can confirm as visible or not.

---

### Scenario 8 — CSV roster/question import via real file upload, across browsers

**Target Component/Page:** `/courses/[courseId]/manage` (roster import), `/courses/[courID]/questions` (question import).

**Preconditions:** Logged in as `admin@cmlaw.demo` or `faculty@cmlaw.demo`. Prepare one valid CSV and one CSV with a deliberate error (bad email, invalid role) for each import type, using the downloadable templates as a starting point.

**Test Steps:**
1. Download the template CSV via the in-app "Download the template" link — confirm the file actually downloads (not just a dead link) and opens correctly in a spreadsheet program.
2. Edit it to add 2-3 valid rows, save, and upload via the file picker.
3. Confirm the success summary (counts of assigned/enrolled/created) matches what was in the file.
4. If accounts were created, confirm the one-time credentials table appears, and that reloading the page makes it disappear (read-once contract).
5. Repeat with the deliberately-invalid CSV and confirm the specific row/reason error messages are legible and correctly numbered against the actual file (row 2 = first data row).
6. Repeat the whole flow in a second browser (e.g. Firefox after testing in Chrome) to catch any file-input or FormData quirks.

**Expected Result:** Both valid and invalid imports behave exactly as `roster-import.test.ts`/`question-import.test.ts` predict, and the file-upload UX itself (which those tests cannot exercise, since they call the parsing function directly) works smoothly in both browsers.

**Actual Result:** [ ] Pass  [ ] Fail

**Notes:** `docs/PITCH_ROADMAP.md` Milestone 6.8 notes file upload "can't be driven by the Browser pane tool" and needed a real browser for its own E2E spec — this scenario is the equivalent manual confirmation across more than one browser engine, which even that E2E spec doesn't cover.

---

### Scenario 9 — Reporting-page authorization bug, live confirmation (verifies REQ-084/085/086)

**Target Component/Page:** `/exams/[examId]/reporting`, `/exams/[examId]/reporting/[attemptId]`.

**Preconditions:** Logged in as `student@cmlaw.demo`. Have a valid exam id from any course in the same institution (visible via the URL when a faculty member is grading, or simply guessable from the exam builder's URL pattern).

**Test Steps:**
1. While logged in as the student, manually navigate the browser address bar to `/exams/<a-known-exam-id>/reporting`.
2. Observe whether the page loads with real student names and scores, or redirects/errors.
3. If it loads, click into one student's row to reach `/exams/<examId>/reporting/<attemptId>`.
4. Observe whether that specific student's name and score breakdown render.
5. If reachable, attempt to submit the "Release Results" form for one or more attempts and confirm via a faculty/admin login afterward whether `resultsReleasedAt` was actually set.

**Expected Result (per this audit's finding):** All three steps should currently **succeed** for the student — this scenario exists specifically to give a human confirmation of REQ-084/085/086 before they're fixed, and to re-run after the fix to confirm it actually closes the hole (expect a redirect or a 403-equivalent after remediation).

**Actual Result:** [ ] Confirmed vulnerable (matches audit)  [ ] Not reproducible — describe: _______________________

**Notes:** This is the single highest-priority manual scenario in this plan — it is the live confirmation of a real-money-value data-exposure bug, not a UX nicety.

---

### Scenario 10 — Cross-browser Web Audio API behavior for the mic-level meter

**Target Component/Page:** `DeviceAndIdentityCheck`'s mic-level meter.

**Preconditions:** A device with a working microphone. Repeat in Chrome, Firefox, and Safari — Safari in particular has historically had stricter `AudioContext` autoplay/user-gesture requirements than Chromium.

**Test Steps:**
1. Reach the Device Check step (requires REQ-052 to be fixed first, or test against a build with a corrected `Permissions-Policy` header).
2. Grant camera/mic permission.
3. Speak at a normal volume and observe whether the mic-level bar visibly animates in each browser.
4. Note any console errors related to `AudioContext` (e.g. "AudioContext was not allowed to start").

**Expected Result:** The meter animates consistently across all three browsers with no console errors.

**Actual Result:** [ ] Pass  [ ] Fail — per-browser notes: _______________________

**Notes:** `DeviceAndIdentityCheck.tsx:72` creates a `new AudioContext()` without an explicit user-gesture-triggered `.resume()` call — most browsers allow this when it's created as a direct consequence of a permission grant (itself gesture-adjacent), but Safari's stricter policy has historically been the exception; this needs a real Safari run to confirm one way or the other.

---

## 4. Verification & Re-test Checklist

- [ ] Fix REQ-084/085/086 (Reporting module authorization) and re-run Scenario 9 to confirm the student can no longer reach any of the three surfaces.
- [ ] Fix REQ-052 (`Permissions-Policy` header) and re-run Scenarios 1, 2, and 10.
- [ ] Add `logAudit` calls to `courses.ts`/`departments.ts` (REQ-093) and extend `audit-coverage.test.ts` to assert them.
- [ ] Add a `reporting.test.ts` file covering both the fixed authorization boundary and the existing (currently-correct) score/histogram/rank math.
- [ ] Add `departments.test.ts` and `benchmarks.test.ts` — the two other lib modules with zero coverage that hold real business logic (not just re-exports).
- [ ] Resolve the 5 ESLint errors found this session (`AutosaveStatus.tsx`, `ExamDownloadGate.tsx` ×2, `ThemeToggle.tsx`, `departments/[departmentId]/page.tsx`) or explicitly document why they're accepted, so `npx eslint .` genuinely exits clean before the next claim that it does.
- [ ] Re-run `npx playwright test` (not executed this session due to a port/lock conflict with an already-running dev server on this machine) and record the real pass/fail count against the current code, not the `docs/PITCH_ROADMAP.md`-cited 14/14 from Milestone 8, since REQ-052/084/085/086 all shipped after that count was taken.
- [ ] Decide and enforce (or explicitly document as deferred) `allowBacktracking`, `randomizeQuestions`, and `randomizeAnswers` (REQ-041/076) — currently silently inert.
- [ ] Update `docs/PITCH_ROADMAP.md` (or a new Milestone 9 entry) to cover Departments, Benchmark Assessments, Post Assessment Settings, the install ceremony, the faculty portal reskin, and the Reporting module — closing REQ-095.
- [ ] Execute Scenarios 3, 4, and 6 (real-time proctor coordination, multi-tab behavior) live with two human testers, since these are the areas this audit could verify by code-reading only as "logic is present and looks correct," not as "behaves correctly under real browser/network conditions."
