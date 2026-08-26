# Examplify / ExamSoft Gap Analysis

**Status:** Research snapshot, written 2026-08-26. Compares this trainer against ExamSoft's
own published support documentation (`support.examsoft.com`, both the **Exam-Makers** and
**Exam-Takers** categories) and this repository's actual shipped code — not against
`docs/EXAMPLIFY_ARCHITECTURE_REFERENCE.md`'s narrower architecture summary, though that
document's scope boundary (no reverse-engineering of security internals) is inherited here
unchanged. Every "this app has X" claim below is grounded in a file read for this pass, not
in `docs/PITCH_ROADMAP.md`'s or `QA_AUTOMATION_AND_TEST_REPORT.md`'s own prose — both were
used as a map to find the code, then the code itself was read.

**Not affiliated with or endorsed by ExamSoft / ExamSoft Worldwide, LLC.**

> **Update (same day, later that session):** the top-ranked item in this analysis — the
> `reporting.ts` authorization bug — has been fixed. `getExamReportingOverview`,
> `getStudentReportDetail`, and `releaseResults` now gate on the faculty-tier `"grade":"grade"`
> action instead of the coarser `"grade":"read"` that STUDENT also holds; the same pattern was
> also found and fixed in `grading.ts` (grading queue, course summaries), `integrity.ts` (the
> integrity-review queue), and `benchmarks.ts` (combined report). A STUDENT can now only ever
> reach their own report, and only once released — with a real regression test suite added at
> `app/src/lib/__tests__/reporting.test.ts` (previously nonexistent). The `next.config.ts`
> `Permissions-Policy` header was also changed from `camera=(), microphone=()` to
> `camera=(self), microphone=(self)`, which had been silently blocking the real ExamID/
> ExamMonitor device check. The rest of this document's findings remain current as written.

---

## 1. Executive summary

This trainer is a genuinely close *workflow* replica for the single slice of Examplify it set
out to copy — the booking → device/ID check → proctor-gated start → timed in-exam experience →
submit → proctor-verified result pipeline is real, server-enforced, and tested, not a mockup
wearing Examplify's UI chrome (`app/src/lib/attempts.ts`, `app/src/lib/proctoring.ts`,
`app/src/lib/integrity.ts`). Where it diverges from the real product it is almost always
*honestly* labeled as doing so — simulated download progress, a clearly-fake "national
average," and a documented refusal to persist a student's ExamID photo are all disclosed in
code comments and UI copy, not silently faked. That honesty posture is itself a point in this
app's favor against the real product, which doesn't publish that level of self-disclosure.

The gap is in *breadth*, not in the core loop. Real Examplify/ExamSoft is a three-portal
platform (Enterprise Portal, Exam-Taker Portal, native Examplify client) supporting roughly a
dozen question types, per-student accommodation rules, five-plus statistical reports (item
analysis, discrimination index, category performance, rubric analysis), true offline exam
delivery, LMS roster/grade sync, and a two-tier admin permission model — almost none of which
exists here. This trainer supports 5 question types, one faculty-set score per objective
answer with no partial credit, zero accommodation infrastructure, zero LMS integration, and a
reporting module that (per this session's own QA pass) currently leaks grade data to students
who shouldn't see it. Most of what's missing is intentionally out of scope for a single-
institution practice tool (LMS sync, true offline delivery) rather than an oversight — but a
few gaps (item analysis, accommodations, question-type breadth) are real, scoped, buildable
next steps that would meaningfully close the distance to "replica," and are called out below.

---

## 2. Feature-by-feature comparison

Legend: **Yes** = built and server-enforced/verified · **Partial** = exists but incomplete,
inert, or has a known defect · **No** = not present.

### 2.1 Institution / Portal Administration

| Real Examplify/ExamSoft feature | This app | Status | Notes |
|---|---|---|---|
| Two-tier admin permission model — "Full" admin creates other admins and reaches every admin area; "Restricted" admin reaches admin areas but can't create users ([Legacy Portal: Admin User Permissions](https://support.examsoft.com/hc/en-us/articles/11146896895885-Legacy-Portal-Admin-User-Permissions)) | `Role` enum has `SUPER_ADMIN`/`PLATFORM_ADMIN`/`INSTITUTION_ADMIN` with an explicit resource matrix (`app/src/lib/rbac.ts:26-64`) | Partial | Conceptually similar (layered admin authority) but a different shape — no "restricted admin can't create users" style split within `INSTITUTION_ADMIN`; it's one flat admin role per tenant. |
| Institution/department/course hierarchy, course rostering | `Institution → Department → Course` (`prisma/schema.prisma:81-232`), full CRUD (`app/src/lib/institutions.ts`, `departments.ts`, `courses.ts`) | Yes | Matches the real product's shape closely. |
| LMS integrations (Canvas, D2L, Moodle, Blackboard) — roster sync, grade push, course push ([Canvas Roster Sync](https://support.examsoft.com/hc/en-us/articles/38814646180365-Enterprise-Portal-Set-Up-Your-Canvas-Roster-Sync-Integration), [D2L integration](https://support.examsoft.com/hc/en-us/articles/11147350162701-Enterprise-Portal-Set-Up-Your-Desire2Learn-D2L-Integration)) | None | No | No LMS integration code anywhere in `app/src/lib`. Roster onboarding is CSV-only (`app/src/lib/roster-import.ts`). |
| CSV/Excel bulk exam-taker import ([Import Exam-Taker Information from an Excel File](https://support.examsoft.com/hc/en-us/articles/11146939075341-Enterprise-Portal-Import-Exam-Taker-Information-from-an-Excel-File)) | `parseRosterCsv`/`importRosterFromCsv` (`app/src/lib/roster-import.ts`), all-or-nothing validation, auto-creates missing accounts with one-time-reveal temp passwords | Yes | A genuinely close match, arguably a better security posture than a typical CSV-with-plaintext-password-column pattern — this app's temp-password reveal is read-once and process-local (`roster-import.ts` `consumeCreatedCredentials`). |
| Deactivate/reactivate/delete admin & exam-taker accounts | `deactivateUser`/`resetUserPassword` (`app/src/lib/users.ts:80-139`), both revoke live sessions immediately | Yes | Session revocation on deactivation is stronger than most SaaS defaults — verified by a dedicated regression suite (`session-validity.test.ts`). |
| Institution branding (logo, colors) on every portal surface | `Institution.logoUrl/sealUrl/primaryColor/secondaryColor` (`prisma/schema.prisma:87-91`), wired app-wide via CSS custom properties (`app/src/lib/branding.ts`, `(app)/layout.tsx`) | Yes | |
| Audit trail of admin actions | `AuditLog` (append-only, `prisma/schema.prisma:537-554`), viewer at `/audit` (`app/src/lib/audit.ts`) | Partial | Wired into most mutating services, but `courses.ts` and `departments.ts` mutations are **not currently audit-logged** despite the action constants already existing (`AUDIT_ACTIONS.courseCreate` etc. defined in `app/src/lib/audit.ts` but unused in `courses.ts`) — a real, narrow, already-identified gap. |

### 2.2 Exam Creation & Settings

| Real Examplify/ExamSoft feature | This app | Status | Notes |
|---|---|---|---|
| Exam = reusable question bank + versioned assessment definition ([Get Started Creating an Assessment](https://support.examsoft.com/hc/en-us/articles/11168112240781-Enterprise-Portal-Get-Started-Creating-an-Assessment)) | `Exam`/`ExamVersion`/`Question`/`QuestionVersion` split, immutable once published (`prisma/schema.prisma:237-386`, `app/src/lib/exams.ts:211-213`) | Yes | The append-only-past-exam-integrity design is arguably *more* rigorous than a typical "just edit the exam" pattern — a question or exam attached to any attempt can never be silently altered (`questions.ts` `QuestionInUseError`, `exams.ts` `ExamNotEditableError`). |
| Security Options: Secure / Modified-Secure / Non-Secure per assessment ([Security Options for Assessments](https://support.examsoft.com/hc/en-us/articles/11168071541901-Enterprise-Portal-Security-Options-for-Assessments)) | `ExamVersion.copyPasteAllowed`/`highlightingAllowed`/`spellCheckAllowed` stored fields (`prisma/schema.prisma:351-353`) | Partial | Real, faculty-set values, accurately displayed on the settings screen — but **not enforced in the exam-taking UI** (no copy/paste blocking, no spellcheck-attribute toggle actually applied), a gap the schema's own comment discloses (`schema.prisma:345-350`). |
| Ping & Release (confirms first-attempt-only before unlocking) | `ExamVersion.pingAndRelease Boolean` (`prisma/schema.prisma:375`) | Partial | Field exists, stored, never read anywhere — explicitly documented in the schema comment as "stored but inert" since there's no meaningful offline/online distinction in a web app. |
| Universal Resume Code (self-service resume after a pause, no faculty review needed) ([Security Options for Assessments](https://support.examsoft.com/hc/en-us/articles/11168071541901-Enterprise-Portal-Security-Options-for-Assessments)) | `ExamVersion.universalResumeCode`, `resumeAttemptWithCode` (`app/src/lib/integrity.ts:234-281`) | Yes | Real, working, matches the real feature's naming and behavior closely. No automated test exists for this specific path (flagged in `QA_AUTOMATION_AND_TEST_REPORT.md` REQ-075) but the logic reads correctly. |
| Download window / max-download-count / remote deletion / reminder emails ([Post an Assessment](https://support.examsoft.com/hc/en-us/articles/11166370656397-Enterprise-Portal-Post-an-Assessment)) | `downloadStartAt`/`downloadEndAt`/`maxDownloads`/`remoteDeletionAt`/`sendDownloadEndReminder`/`sendUploadDeadlineReminder` (`prisma/schema.prisma:366-379`), enforced in `app/src/lib/attempts.ts:684-704` | Partial | Window/count/remote-deletion are real and server-enforced. The two reminder-email flags are stored but inert — no email infrastructure exists in this project (schema comment discloses this explicitly). |
| Exam Password gate, 12-char minimum with a number and a letter ([Exam Passwords FAQs](https://support.examsoft.com/hc/en-us/articles/36383633811597-Exam-Passwords-FAQs)) | `ExamVersion.assessmentPassword`, checked in `validateAndRecordDownload` (`app/src/lib/attempts.ts:684-704`) | Partial | Real once set, but compares with plain `!==` (not constant-time) and has no length/complexity validation on creation — low real-world risk since it's explicitly documented as "not a real security boundary," but worth noting. |
| Exam Sections — grouping + per-section randomization control ([Overview of Exam Sections](https://support.examsoft.com/hc/en-us/articles/11167893702157-Enterprise-Portal-Overview-of-Exam-Sections)) | `ExamQuestion.sectionTitle` (`prisma/schema.prisma:398-402`), shown on the settings screen (`ExamDownloadGate.tsx`) | Partial | Grouping/labeling exists and displays; there's no UI to configure section-level randomization, and the underlying `randomizeQuestions`/`randomizeAnswers` flags (see below) are inert anyway. |
| Randomize question order / randomize answer choices | `ExamVersion.randomizeQuestions`/`randomizeAnswers` (`prisma/schema.prisma:333-334`), settable in `exams.ts` | Partial (undisclosed gap) | Stored and settable, but **grepped confirms zero code anywhere reads either field** — no shuffle logic in `ExamQuestionPager.tsx` or `getAttemptForTaking`. Unlike the tool-flags above, this one isn't disclosed as a known limitation anywhere in the docs — flagged in `QA_AUTOMATION_AND_TEST_REPORT.md` REQ-041 as a genuine, undocumented gap. |
| Assessment print for paper/Scantron administration ([Print an Assessment](https://support.examsoft.com/hc/en-us/articles/11166367905293-Enterprise-Portal-Print-an-Assessment)) | None for the exam itself; `PrintButton.tsx` exists only for the student's S&O report | No | Reasonable to skip — this is a browser-only practice tool with no paper-exam use case. |

### 2.3 Question Types & Question Bank

| Real Examplify/ExamSoft feature | This app | Status | Notes |
|---|---|---|---|
| Question types: Multiple Choice, Fill-in-the-Blank, Essay, True/False, Hot Spot, Highlight Text, Drag-and-Drop, Matching, Ordering, Matrix, Bowtie ([Questions and Categories](https://support.examsoft.com/hc/en-us/sections/11418702873613-Questions-and-Categories), [Tips for Fill in the Blank Questions](https://support.examsoft.com/hc/en-us/articles/11166056614925-Enterprise-Portal-Tips-for-Fill-in-the-Blank-Questions)) | `QuestionType` enum: `MULTIPLE_CHOICE`, `MULTIPLE_RESPONSE`, `TRUE_FALSE`, `ESSAY`, `SHORT_ANSWER` (`prisma/schema.prisma:22-28`) | Partial | 5 of ~11 real types. The 5 built cover the two formats that actually matter for a law-exam trainer (objective + essay); the missing ones (hot spot, drag-and-drop, matching, ordering, matrix, bowtie) are largely clinical/nursing-assessment formats with limited relevance to legal education. |
| Question = stable identity + versioned content, so a past exam keeps its exact wording/key | `Question`/`QuestionVersion` split (`prisma/schema.prisma:237-274`), tested (`questions.test.ts`) | Yes | |
| Question categories/tags, used to drive Category Performance reporting | `Question.tags String[]`, `learningObjectives String[]` (`prisma/schema.prisma:245-246`) | Partial | Fields exist and are populated (via CSV import), but **nothing reads them back** for any reporting or filtering feature — confirmed absent by grep, matches `docs/WORLD_CLASS_AUDIT.md` A-13's own scoping. |
| CSV/file bulk question import ([Prepare a Question File to Import](https://support.examsoft.com/hc/en-us/articles/11166214954765-Enterprise-Portal-Prepare-a-Question-File-to-Import)) | `question-import.ts`, all-or-nothing, optional direct attach to a DRAFT exam | Yes | |
| Question search across courses ([Search for Questions in your Courses](https://support.examsoft.com/hc/en-us/articles/11146744821645-Enterprise-Portal-Search-for-Questions-in-your-Courses)) | `listQuestionsForCourse` (`app/src/lib/questions.ts:110-129`) is a plain per-course list, no cross-course search/filter UI | Partial | Basic listing only. |

### 2.4 Proctoring, Identity & Integrity

| Real Examplify/ExamSoft feature | This app | Status | Notes |
|---|---|---|---|
| ExamID — baseline photo on first use, live match every gated exam, server-side verification | `DeviceAndIdentityCheck.tsx` — real `getUserMedia` camera access and a real canvas photo capture | Partial | Genuinely real camera/photo *capture*; deliberately **no baseline storage or server-side face match** — the captured image is held only in component state and discarded (`DeviceAndIdentityCheck.tsx:24-31` docstring). This is a **deliberate, disclosed simplification**, not a missing feature (see §3's "explicitly out of scope" tier — a training tool has no legitimate reason to hold student biometric data). |
| ExamMonitor — continuous webcam/audio/screen capture during the exam, async AI anomaly review | None | No | No recording of any kind during the exam. Matches this project's own `docs/PITCH_ROADMAP.md` "Explicitly deferred" list (needs real-time infra + an actual staffing commitment). |
| Exam Integrity Review Queue with dispositions (Pending / Resolved / Escalated / Confirmed Breach) ([Review the Exam-Taker Details and Submit a Disposition](https://support.examsoft.com/hc/en-us/articles/11167864202637-Exam-Integrity-Review-the-Exam-Taker-Details-and-Submit-a-Disposition)) | `AttemptEvent` log + `INTERRUPTED`→(`REINSTATE`/`TERMINATED`) faculty review (`app/src/lib/integrity.ts:145-214`) | Yes (simplified) | This app's review is binary (reinstate or confirm violation) versus the real product's 4-state disposition workflow with an escalation path to a second reviewer — a reasonable simplification for a single-institution tool with no multi-tier review staff. |
| Browser/window-level signals: tab-switch, window blur, fullscreen exit | `AttemptEventType`: `WINDOW_BLUR`, `VISIBILITY_HIDDEN`, `FULLSCREEN_EXIT` (`prisma/schema.prisma:61-70`), 3-strike auto-pause (`integrity.ts:36-80`) | Yes | Consistently and honestly framed everywhere as *signals for a human decision*, never an automatic verdict — matches the real product's own "review, don't auto-penalize" posture (`ExamMonitor`'s async-AI-then-human-review shape). |
| OS-level lockdown (no other apps, no internet, survives a forced reboot) ([Security Options for Assessments](https://support.examsoft.com/hc/en-us/articles/11168071541901-Enterprise-Portal-Security-Options-for-Assessments)) | None — browser-only | No (by design) | `docs/ARCHITECTURE_DECISIONS.md` ADR-002 explicitly defers this to a never-started Phase 2 native client, and every surface that could imply lockdown is required to say so. This is the correct call — a browser genuinely cannot make this guarantee, and claiming otherwise would be dishonest. |
| Network-drop handling during an exam | `NETWORK_OFFLINE`/`NETWORK_ONLINE` event types, explicitly excluded from the 3-strike count (`integrity.ts:19` `STRIKE_EVENT_TYPES`) | Yes | A materially *fairer* design than penalizing connectivity — logged for faculty context, never held against the student. |

### 2.5 Booking, Entry Gate & Device/Install Flow

| Real Examplify/ExamSoft feature | This app | Status | Notes |
|---|---|---|---|
| Find institution → download Examplify → install → launch → Add New Account → register device ([How to download Examplify, install, and log in](https://support.examsoft.com/hc/en-us/articles/11146583087373-How-to-download-Examplify-install-the-software-and-log-in-for-the-first-time)) | `InstallCeremony.tsx` — a 6-step scripted ceremony (`institution → download → downloading → launch → add-account → register`), the final step writes a real `DeviceRegistration` row | Yes (shape), honestly partial (substance) | The step sequence and even the "Add New Account" screen name are directly modeled on the real flow. Steps 1-5 are disclosed ceremony (no real installer exists or should exist — `InstallCeremony.tsx:13-25` docstring); step 6 is the one genuinely real action. |
| Minimum System Requirements check (RAM, disk, OS, resolution) ([Minimum System Requirements](https://support.examsoft.com/hc/en-us/articles/11145768448909-Examplify-Minimum-System-Requirements-MSRs)) | `checkSystemRequirements()` (`ExamDownloadGate.tsx:34-58`) | Partial | Screen resolution and (where Chromium reports it) RAM are genuinely measured and gate the flow; disk space and OS version aren't obtainable from a browser and are honestly labeled "Not measurable in a browser" rather than faked — a good example of this project's disclosure discipline. |
| Encrypted exam package download, password-gated unlock | Fake progress bar (`DOWNLOAD_MS = 1500`, `ExamDownloadGate.tsx:9`) gated by a real password check once faculty sets one | Partial | Disclosed as fake in the component's own docstring (`ExamDownloadGate.tsx:68-77`) — there is no actual package to transfer in a server-rendered web app, so a truthful version of this step isn't possible without misleading UI theater; the honest choice was made deliberately. |
| Exam Rules acknowledgment / consent screen | Checkbox "I have read and agree" gate before Start Exam (`ExamEntryGate.tsx:165-187`) | Yes | Simpler than the real product's biometric-data-consent notice — appropriately so, since this app never collects biometric data to consent to in the first place. |
| Device registration binds an account to a specific device ("Clear the Registration on Your Device") | `DeviceRegistration` model + `registerDevice`/`clearDeviceRegistration` (`app/src/lib/device-registration.ts`) | Yes | Matches the real feature's shape and even its "deliberate, occasional reset" framing in the code comment. |
| Real-time waiting-for-proctor gate, tied to an actual proctor approval | `bookAttempt`→`requestProctorApproval`→`approveProctorStart` (`app/src/lib/proctoring.ts:76-187`), enforced server-side via `ProctorApprovalRequiredError` in `attempts.ts:311-314` | Yes | This is genuinely real, not simulated — a materially stronger claim than most of the rest of this table, and stronger than the earlier `PITCH_ROADMAP.md` Milestone 4 version of this same gate (which was fully scripted). |

### 2.6 Benchmark Exams

| Real Examplify/ExamSoft feature | This app | Status | Notes |
|---|---|---|---|
| Benchmark-bank courses containing reusable, nationally-normed assessments ([Benchmark Exams Faculty Workflow](https://support.examsoft.com/hc/en-us/articles/17688824845453-Benchmark-Exams-Faculty-Workflow)) | `Course.isBenchmarkBank`, `ExamKind.BENCHMARK`, server-clamped so only a bank course can hold one (`app/src/lib/exams.ts:99-101`) | Yes | |
| Duplicate/link a benchmark exam into a live course, questions locked from further editing | `duplicateBenchmarkExam()` (`app/src/lib/benchmarks.ts:72-166`), `assertQuestionsNotLocked` (`exams.ts:52-70`) | Yes | Directly matches the real product's "cannot edit questions on existing or new assessment" rule, including the underlying question/questionVersion rows being *shared*, not copied (`benchmarks.ts:128-142`). |
| Combined report across every posting of a benchmark exam, with a real national-average comparison | `getBenchmarkCombinedReport()` (`benchmarks.ts:207-271`) computes real cross-course averages; the "national average" is a seeded, clearly-labeled placeholder (`seededSimulatedAverage`, `benchmarks.ts:191-198`) | Partial (honestly so) | The per-course/combined figures are real, computed data. The national-average figure is fake — but unlike the real product (which presumably has actual norm data this trainer has no legitimate way to obtain), it is deterministically generated and explicitly disclosed as simulated in both the code and the rendered UI (`reporting/page.tsx:147-151`). This is arguably a *more honest* posture than most demo/pitch software defaults to. |
| Register a separate Benchmark-specific account inside Examplify, distinct from the student's regular course login ([Register Your Benchmark Account on Examplify](https://support.examsoft.com/hc/en-us/articles/25958777248141-Benchmark-Exams-Register-Your-Benchmark-Account-on-Examplify)) | None — one account, one login | No | See §4 — a dedicated section, not folded in here, since the user specifically asked this be called out rather than silently skipped. |

### 2.7 Grading

| Real Examplify/ExamSoft feature | This app | Status | Notes |
|---|---|---|---|
| Auto-grading for objective question types | `autoGradePoints()` (`app/src/lib/attempts.ts:461-479`) | Partial | Full-credit-or-nothing only — no partial credit for multi-select, an explicitly documented Phase 1 limitation (`docs/WORLD_CLASS_AUDIT.md` A-12, `PROJECT_STATUS.md`). |
| Manual grading with rubrics, multiple weighted criteria/dimensions ([Grade Performance Assessments with Rubrics](https://support.examsoft.com/hc/en-us/articles/11166581923853-Legacy-Portal-Grade-Performance-Assessments-with-Rubrics)) | `gradeAnswer()` — a single clamped point value per question (`app/src/lib/grading.ts:136-190`) | No | No rubric/dimension structure of any kind. Every essay/short-answer question is graded as one number. |
| Multiple graders per exam, grading assignments distributed across a team ([Create and Manage Graders and Grading Assignments](https://support.examsoft.com/hc/en-us/articles/11146942158861-Legacy-Portal-Create-and-Manage-Graders-and-Grading-Assignments)) | Any `FACULTY`/`INSTITUTION_ADMIN` assigned to the course can grade any submission | No | No grader-assignment/distribution concept — single-grader-pool model. |
| Grade-change audit trail, recording the previous value | `grading.ts:162-183`, tested (`audit-coverage.test.ts`) | Yes | Directly matches the real product's appeal-relevant need. |
| Attempt auto-transitions to a "graded" state once every answer has a score | `grading.ts:185-189` | Yes | |

### 2.8 Reporting & Analytics

| Real Examplify/ExamSoft feature | This app | Status | Notes |
|---|---|---|---|
| Item Analysis Report — per-question and per-choice statistics, discrimination index, distractor performance ([View the Item Analysis Report](https://support.examsoft.com/hc/en-us/articles/11166810764045-Enterprise-Portal-View-the-Item-Analysis-Report)) | None | No | Explicitly on the roadmap as **not yet built** and flagged as the single highest-institutional-value item in `docs/WORLD_CLASS_ROADMAP.md` (P2-1). |
| Category Performance / Student Category Performance Reports ([View the Category Performance Report](https://support.examsoft.com/hc/en-us/articles/11166807016973-Enterprise-Portal-View-the-Category-Performance-Report)) | None (the underlying `Question.tags` field exists but is never read back — see §2.3) | No | |
| Class summary report — mean/median/σ, pass rate, score distribution | `getExamReportingOverview()` (`app/src/lib/reporting.ts`) computes roster + per-student scores + a histogram + class average | Partial | The class-average/histogram basics exist; standard deviation, pass-rate threshold, and a discrimination/difficulty index do not. |
| Individual Strengths & Opportunities (S&O) Report — per-student, with rank/percentile ([View the S&O Report](https://support.examsoft.com/hc/en-us/articles/11166823429261-Enterprise-Portal-View-the-Individual-Strengths-Opportunities-Report-S-O-Report)) | `getStudentReportDetail()` (`reporting.ts`), print-friendly (`PrintButton.tsx`) | Yes (feature); **Fail (authorization)** | The report itself is a real, close match. But this session's QA pass found a **live, exploitable bug**: `getExamReportingOverview`, `getStudentReportDetail`, and `releaseResults` all gate on the `grade:"read"` permission, which `STUDENT` also holds (`rbac.ts:78-84`) — so any logged-in student can view any other student's named S&O report and class roster/scores by guessing/visiting a URL, and can even call `releaseResults` themselves. This is a real, currently-unfixed defect, not a documentation gap — see `QA_AUTOMATION_AND_TEST_REPORT.md` REQ-084/085/086. |
| Faculty-controlled "Release Results" timing | `Submission.resultsReleasedAt`, `releaseResults()` (`reporting.ts:231-247`) | Yes (feature, same auth bug as above) | |
| Rubric Analysis Report | None (no rubric structure exists at all — see §2.7) | No | |

### 2.9 Accommodations

| Real Examplify/ExamSoft feature | This app | Status | Notes |
|---|---|---|---|
| Per-student Accommodation Rules — extended time (100-400%), spell-check override, non-secure mode, applied before download ([Accommodations and Accessibility Options](https://support.examsoft.com/hc/en-us/articles/12161968263053-Enterprise-Portal-Accommodations-and-Accessibility-Options), [Manage Accommodation Rules](https://support.examsoft.com/hc/en-us/articles/11147095770253-Legacy-Portal-Manage-Accommodation-Rules)) | None | No | No per-student override of any kind exists in the schema — `timeLimitMinutes` and the tool flags are exam-version-wide only, applied identically to every student. This is a genuine, unqualified gap, not a disclosed simplification. |

### 2.10 Offline / Sync

| Real Examplify/ExamSoft feature | This app | Status | Notes |
|---|---|---|---|
| Fully offline exam-taking once downloaded; answer file uploads automatically on reconnect, with a configurable upload delay ([Upload FAQs](https://support.examsoft.com/hc/en-us/articles/36414488406541-Upload-FAQs)) | None — the app requires network throughout, since it's server-rendered | No (by design) | `PROJECT_STATUS.md`'s own "Known limitations" section already states this plainly: "No offline capability or connection resilience — a dropped connection mid-exam can still lose unsaved answers." `docs/ARCHITECTURE.md` defers true offline delivery to the never-started Phase 2 native client. Honestly disclosed, not hidden. |
| Local encrypted redundant autosave, ~60s cadence, independent of network | Server-side autosave via `saveAnswers` (`attempts.ts:399-454`) — no local/offline redundancy | Partial | Autosave exists but is a server round-trip, not a local-first write; a dropped connection loses whatever hasn't round-tripped yet, per the limitation above. |

---

## 3. Prioritized upgrade recommendations

### Tier A — high-value, low-effort

- **Fix the reporting-module authorization bug (REQ-084/085/086).** This isn't really a
  "gap vs. Examplify" so much as a live defect: `getExamReportingOverview`,
  `getStudentReportDetail`, and `releaseResults` in `app/src/lib/reporting.ts` all gate on
  `assertCan(actor.role, "grade", "read")`, a permission `STUDENT` also holds. Add an explicit
  role allow-list (`FACULTY`/`INSTITUTION_ADMIN`/`SUPER_ADMIN`/`PLATFORM_ADMIN`) at the top of
  all three functions, independent of `grade:"read"`, plus the same page-level redirect guard
  `admin/page.tsx` already has. This should ship before anything else on this list — it's a
  real information-disclosure bug in production-shaped code, not a missing feature.
- **Fix the camera/mic Permissions-Policy conflict (REQ-052).** `app/next.config.ts`'s
  `Permissions-Policy: camera=(), microphone=(), geolocation=()` header silently breaks
  `DeviceAndIdentityCheck.tsx`'s real `getUserMedia` call for every user, in every browser,
  every time. One-line fix: `camera=(self), microphone=(self), geolocation=()`.
- **Wire `randomizeQuestions`/`randomizeAnswers` into the exam-taking UI.** The fields already
  exist on `ExamVersion` and are already settable in the exam builder — the only missing piece
  is a deterministic-per-student shuffle in `getAttemptForTaking`/`ExamQuestionPager.tsx`.
  Low-risk, self-contained, and closes an *undisclosed* gap (unlike the tool-flags, this one
  isn't even documented as inert).
- **Audit-log course/department mutations.** `AUDIT_ACTIONS.courseCreate/courseUpdate/
  courseDelete` already exist in `app/src/lib/audit.ts` — just call `logAudit(...)` from
  `courses.ts` and `departments.ts` the way every other domain service already does.

### Tier B — high-value, higher-effort

- **Item Analysis Report (per-question stats, distractor performance, discrimination index).**
  This is already the roadmap's own top pick (`docs/WORLD_CLASS_ROADMAP.md` P2-1) and is the
  single biggest reporting gap versus real Examplify. Concretely: a new query function in
  `app/src/lib/reporting.ts` that, per `ExamQuestion`, tabulates response-choice frequency
  from `ExamAnswer.responseJson` across every graded attempt on that `ExamVersion`, computes
  point-biserial discrimination against the whole-attempt score, and a new
  `app/src/app/(app)/exams/[examId]/item-analysis/page.tsx` route gated the same way the
  reporting fix above establishes. Needs an accessible table alongside any chart, per the
  roadmap's own stated constraint.
- **Wire `Question.tags` into a real Category Performance Report.** The data already exists
  (populated via CSV import); the gap is purely a read/aggregation path. A new function
  alongside `getExamReportingOverview` in `reporting.ts` that groups `ExamAnswer` scores by
  the tags on their parent `Question`, plus a page rendering it — smaller in scope than item
  analysis since there's no distractor logic to build.
  This is also the natural place to build Milestone 3's already-planned "bar-subject
  performance dashboard" from `docs/PITCH_ROADMAP.md` — same underlying mechanism.
- **Partial credit for multiple-response questions.** `autoGradePoints()` in `attempts.ts`
  currently does exact-set-match-or-zero. A per-choice scoring mode (e.g., points-per-correct-
  choice minus a penalty per incorrect choice, configurable on `ExamQuestion`) is a real
  schema addition (a `scoringMode` field) plus a rewrite of that one function — must be
  versioned so a past exam's scoring never silently changes, per the append-only-integrity
  pattern already established elsewhere in `exams.ts`.
- **Basic accommodation rules.** A new `AccommodationRule` model (`userId`, `examVersionId` or
  institution-wide, `timeLimitPercent`, `spellCheckOverride`) checked in `attemptDeadline()`
  (`attempts.ts:104-148`) instead of the flat `timeLimitMinutes`. This is the single largest
  unqualified gap in the whole comparison (§2.9) and the one most likely to matter for a real
  institutional pilot — a law school with an ADA/accommodation obligation cannot honestly claim
  this trainer replicates the real workflow without it.

### Tier C — nice-to-have / low priority

- **Additional question types** (matching, ordering, matrix). Fill-in-the-blank and true/false-
  equivalent coverage already exists in spirit via `SHORT_ANSWER`/`TRUE_FALSE`; matching/
  ordering/matrix/hot-spot/bowtie are largely nursing/clinical-assessment formats with limited
  relevance to a law-exam trainer's actual question shapes (MCQ + essay dominate real bar-style
  exams) — worth building only if faculty specifically ask for one.
- **Multi-grader assignment/distribution.** Only matters once class sizes or grading teams grow
  past what a single faculty account can reasonably handle — not yet a bottleneck for a
  single-institution pilot.
- **Rubric-structured grading.** A real, valuable feature, but a genuinely large one (new
  schema for rubric definitions, per-dimension scoring UI, a rubric-analysis report) — worth
  scoping only once IRAC-structured essay grading (already planned in `docs/PITCH_ROADMAP.md`
  Milestone 3) ships and faculty feedback says a flat score isn't enough.
- **LMS integration (Canvas/D2L/Moodle).** Real institutional value, but this is exactly the
  kind of "Phase 3 commercialization" work `docs/ARCHITECTURE.md` already scopes out until
  there's a confirmed multi-institution engagement — building it speculatively for a single-
  institution pitch tool would be solving a problem nobody has yet.

### Tier D — explicitly out of scope, and why

- **Real ExamID server-side biometric verification (baseline photo + live face match).** This
  app already made the right call here: `DeviceAndIdentityCheck.tsx` captures a real photo to
  prove the camera works, then discards it — never uploaded, never persisted. Building the real
  feature would mean this training tool holding a database of law students' face photos with no
  legitimate exam-security purpose (it's a *practice* tool; there is nothing to protect the
  integrity of). That's a straightforward privacy liability with no offsetting benefit and
  should not be built, regardless of how close it would get to "true replica."
- **Live continuous webcam/audio recording (ExamMonitor).** Same reasoning — recording and
  storing video of students during *practice* sessions creates a real data-retention and
  privacy liability for zero corresponding benefit (there is no grade or credential on the
  line to protect). Already correctly deferred in `docs/PITCH_ROADMAP.md`'s "Explicitly
  deferred" list; this analysis affirms that call rather than reopening it.
- **True OS-level lockdown from the browser.** Architecturally impossible to do honestly from
  JavaScript, and `docs/ARCHITECTURE_DECISIONS.md` ADR-002 already draws this line correctly —
  a Phase 2 native client or nothing, never faked from inside the web app.
- **Fabricated real-time proctor video / live chat.** Needs actual staffing and real-time
  infrastructure this project doesn't have and hasn't been asked to build yet — building the UI
  shell without the underlying capability would be exactly the kind of "dishonest theater"
  `docs/PITCH_ROADMAP.md` Milestone 8 already correctly declined to build for the install
  ceremony.

---

## 4. The benchmark-account-registration gap

**What real Examplify does:** per [Benchmark Exams: Register Your Benchmark Account on
Examplify](https://support.examsoft.com/hc/en-us/articles/25958777248141-Benchmark-Exams-Register-Your-Benchmark-Account-on-Examplify),
a student taking a McGraw-Hill-authored Benchmark Exam registers a **second, entirely separate
Examplify account** — distinct from their regular course-exam login — inside the native
desktop/tablet app. The flow is: open Examplify, log out of the regular account via the Home
Menu, select **Add New Account**, then search for and select the institution's dedicated
Benchmark-Exams-branded institution entry (the student's own institution name with "Benchmark
Exams" appended), and sign in with a separate User ID/password pair issued for that Benchmark
account specifically. The native app supports holding multiple registered accounts
simultaneously and switching between them — this is a first-class concept in real Examplify,
not an edge case.

**Why this app doesn't replicate it, and what exists instead:** this trainer has exactly one
web-based auth system (`app/src/auth.ts`, Auth.js Credentials provider, one `User` row per
person) and no concept of a second account, account-switching, or a separate Benchmark-branded
institution tenant a student logs into. Interestingly, the app's `InstallCeremony.tsx` *does*
borrow the real product's screen name and step shape — its ceremony includes an "Add New
Account" step (`InstallCeremony.tsx:197-210`) — but that step is used once, for the student's
one and only account, as part of onboarding a brand-new device. It is not a mechanism for
holding two independent accounts and switching between them; nothing in this app models "log
out of your regular account, log into a different one, then switch back." Benchmark exams here
instead live entirely inside the student's single existing account: a faculty member duplicates
a Benchmark exam into the student's own live course (`duplicateBenchmarkExam()`,
`app/src/lib/benchmarks.ts:72-166`), and the student takes it exactly like any other exam in
their one account, with the results distinguished only by `ExamKind.BENCHMARK` on the backing
data.

**Whether the gap actually matters:** for this app's stated purpose — helping students build
muscle memory for the *regular* exam-day workflow — it doesn't. A dual-account switch is a
mechanically distinct, narrow administrative flow specific to how McGraw-Hill-branded content
happens to be licensed and distributed through a separate ExamSoft-hosted institution tenant;
it has nothing to do with the actual exam-taking experience (timer, lockdown, ExamID,
submission) this trainer exists to rehearse. Replicating it here would mean building a second,
parallel authentication surface and an "institution search/switch" UI for a workflow most CM
Law students will likely never personally encounter, purely for completeness rather than
practice value. This is correctly scoped as a **deliberate simplification, not an oversight** —
worth documenting explicitly (as this section does) so it reads as a decision the next time
someone compares this trainer against the real product feature-for-feature, but not worth
building unless a future requirement specifically calls for multi-account support for some
other reason.

---

## Sources

- [Enterprise Portal: Security Options for Assessments](https://support.examsoft.com/hc/en-us/articles/11168071541901-Enterprise-Portal-Security-Options-for-Assessments)
- [Enterprise Portal: Post an Assessment](https://support.examsoft.com/hc/en-us/articles/11166370656397-Enterprise-Portal-Post-an-Assessment)
- [Enterprise Portal: Get Started with Assessment Options](https://support.examsoft.com/hc/en-us/articles/11168110308621-Enterprise-Portal-Get-Started-with-Assessment-Options)
- [Enterprise Portal: Get Started Creating an Assessment](https://support.examsoft.com/hc/en-us/articles/11168112240781-Enterprise-Portal-Get-Started-Creating-an-Assessment)
- [Enterprise Portal: Overview of Exam Sections](https://support.examsoft.com/hc/en-us/articles/11167893702157-Enterprise-Portal-Overview-of-Exam-Sections)
- [Enterprise Portal: Create a Question Bank Assessment](https://support.examsoft.com/hc/en-us/articles/11168029977997-Enterprise-Portal-Create-a-Question-Bank-Assessment)
- [Questions and Categories](https://support.examsoft.com/hc/en-us/sections/11418702873613-Questions-and-Categories)
- [Enterprise Portal: Prepare a Question File to Import](https://support.examsoft.com/hc/en-us/articles/11166214954765-Enterprise-Portal-Prepare-a-Question-File-to-Import)
- [Enterprise Portal: Tips for Fill in the Blank Questions](https://support.examsoft.com/hc/en-us/articles/11166056614925-Enterprise-Portal-Tips-for-Fill-in-the-Blank-Questions)
- [Enterprise Portal: Search for Questions in your Courses](https://support.examsoft.com/hc/en-us/articles/11146744821645-Enterprise-Portal-Search-for-Questions-in-your-Courses)
- [ExamID/ExamMonitor Exams](https://support.examsoft.com/hc/en-us/sections/11822457875213-ExamID-ExamMonitor-Exams)
- [Enterprise Portal: Post an Assessment with ExamID or ExamMonitor](https://support.examsoft.com/hc/en-us/articles/11167865714189-Enterprise-Portal-Post-an-Assessment-with-ExamID-or-ExamMonitor)
- [Exam Integrity: Review ExamID and ExamMonitor Results](https://support.examsoft.com/hc/en-us/articles/11166685091341-Exam-Integrity-Review-ExamID-and-ExamMonitor-Results)
- [Exam Integrity: Review the Exam-Taker Details and Submit a Disposition](https://support.examsoft.com/hc/en-us/articles/11167864202637-Exam-Integrity-Review-the-Exam-Taker-Details-and-Submit-a-Disposition)
- [Get Started with Reporting (Enterprise & Legacy)](https://support.examsoft.com/hc/en-us/articles/11146747435405-Get-Started-with-Reporting-Enterprise-Legacy)
- [Enterprise Portal: View the Item Analysis Report](https://support.examsoft.com/hc/en-us/articles/11166810764045-Enterprise-Portal-View-the-Item-Analysis-Report)
- [Enterprise Portal: View the Summary Report](https://support.examsoft.com/hc/en-us/articles/11166825827597-Enterprise-Portal-View-the-Summary-Report)
- [Enterprise Portal: View the Category Performance Report](https://support.examsoft.com/hc/en-us/articles/11166807016973-Enterprise-Portal-View-the-Category-Performance-Report)
- [Enterprise Portal: View the Student Category Performance Report](https://support.examsoft.com/hc/en-us/articles/11166811561101-Enterprise-Portal-View-the-Student-Category-Performance-Report)
- [Enterprise Portal: View the Individual Strengths & Opportunities Report (S&O Report)](https://support.examsoft.com/hc/en-us/articles/11166823429261-Enterprise-Portal-View-the-Individual-Strengths-Opportunities-Report-S-O-Report)
- [Enterprise Portal: Run a Combined Report for Linked Assessments](https://support.examsoft.com/hc/en-us/articles/11166826500109-Enterprise-Portal-Run-a-Combined-Report-for-Linked-Assessments)
- [Benchmark Exams Faculty Workflow](https://support.examsoft.com/hc/en-us/articles/17688824845453-Benchmark-Exams-Faculty-Workflow)
- [Benchmark Exams: View Reports and Release Results](https://support.examsoft.com/hc/en-us/articles/11938788470285-Benchmark-Exams-View-Reports-and-Release-Results)
- [Benchmark Exams: Register Your Benchmark Account on Examplify](https://support.examsoft.com/hc/en-us/articles/25958777248141-Benchmark-Exams-Register-Your-Benchmark-Account-on-Examplify)
- [Enterprise Portal: Accommodations and Accessibility Options](https://support.examsoft.com/hc/en-us/articles/12161968263053-Enterprise-Portal-Accommodations-and-Accessibility-Options)
- [Legacy Portal: Manage Accommodation Rules](https://support.examsoft.com/hc/en-us/articles/11147095770253-Legacy-Portal-Manage-Accommodation-Rules)
- [Legacy Portal: Grade Performance Assessments with Rubrics](https://support.examsoft.com/hc/en-us/articles/11166581923853-Legacy-Portal-Grade-Performance-Assessments-with-Rubrics)
- [Enterprise Portal: Grade an Essay Question](https://support.examsoft.com/hc/en-us/articles/11166476934669-Enterprise-Portal-Grade-an-Essay-Question)
- [Legacy Portal: Create and Manage Graders and Grading Assignments](https://support.examsoft.com/hc/en-us/articles/11146942158861-Legacy-Portal-Create-and-Manage-Graders-and-Grading-Assignments)
- [Examplify: Answer File Uploads](https://support.examsoft.com/hc/en-us/articles/18600754788237-Examplify-Answer-File-Uploads)
- [Upload FAQs](https://support.examsoft.com/hc/en-us/articles/36414488406541-Upload-FAQs)
- [Examplify: Minimum System Requirements (MSRs)](https://support.examsoft.com/hc/en-us/articles/11145768448909-Examplify-Minimum-System-Requirements-MSRs)
- [How to download Examplify, install the software, and log in for the first time](https://support.examsoft.com/hc/en-us/articles/11146583087373-How-to-download-Examplify-install-the-software-and-log-in-for-the-first-time)
- [Examplify: Take a Mock Exam](https://support.examsoft.com/hc/en-us/articles/12166302658957-Examplify-Take-a-Mock-Exam)
- [Enterprise Portal: Exam-Taker Portal](https://support.examsoft.com/hc/en-us/articles/11145612877965-Enterprise-Portal-Exam-Taker-Portal)
- [Exam Passwords FAQs](https://support.examsoft.com/hc/en-us/articles/36383633811597-Exam-Passwords-FAQs)
- [Enterprise Portal: Import Exam-Taker Information from an Excel File](https://support.examsoft.com/hc/en-us/articles/11146939075341-Enterprise-Portal-Import-Exam-Taker-Information-from-an-Excel-File)
- [Legacy Portal: Admin User Permissions](https://support.examsoft.com/hc/en-us/articles/11146896895885-Legacy-Portal-Admin-User-Permissions)
- [Enterprise Portal: Set Up Your Canvas Roster Sync Integration](https://support.examsoft.com/hc/en-us/articles/38814646180365-Enterprise-Portal-Set-Up-Your-Canvas-Roster-Sync-Integration)
- [Enterprise Portal: Set Up Your Desire2Learn (D2L) Integration](https://support.examsoft.com/hc/en-us/articles/11147350162701-Enterprise-Portal-Set-Up-Your-Desire2Learn-D2L-Integration)
- [Enterprise Portal: Print an Assessment](https://support.examsoft.com/hc/en-us/articles/11166367905293-Enterprise-Portal-Print-an-Assessment)
- `docs/EXAMPLIFY_ARCHITECTURE_REFERENCE.md` (this repo — prior architecture research pass, source list inherited/cross-checked, not duplicated here)
- `QA_AUTOMATION_AND_TEST_REPORT.md` (this repo — 2026-08-26 QA pass, used to locate REQ-041/052/084/085/086 and verified independently against the cited source files)

Exam-Makers category browsed in full: <https://support.examsoft.com/hc/en-us/categories/4730887042701-Exam-Makers>
Exam-Takers category browsed in full: <https://support.examsoft.com/hc/en-us/categories/11144666860429-Exam-Takers>
