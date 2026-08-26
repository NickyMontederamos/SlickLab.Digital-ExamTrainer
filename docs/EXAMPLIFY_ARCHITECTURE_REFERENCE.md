# ExamSoft / Examplify — Architecture Reference

**Status:** Reference material. Written 2026-08-26 to inform the Milestone 8 reskin
work (see `PITCH_ROADMAP.md`). Also published as a shareable Artifact —
[ExamSoft System Blueprint](https://claude.ai/code/artifact/9dfd8168-5218-44e0-9c02-04b69938a0a8).

## Scope boundary — read this first

Everything below is compiled **only from ExamSoft's own public documentation**:
support-hub articles, product pages, and institution-published FAQs aimed at
prospective/current institutional customers. It deliberately excludes, and this
project should never go looking for:

- Exact encryption algorithms, key management, or on-disk file formats.
- How OS-level lockdown is actually implemented (APIs, drivers, hooks).
- ExamMonitor's anomaly-detection model internals (signals, thresholds, training data).
- Any network protocol, endpoint, or backend implementation detail.

None of that is published, and none of it is needed to build an honest
workflow-mimicking practice tool. The goal here is to match the *shape* of the
real product's process so students build correct muscle memory — not to
reverse-engineer or help defeat its actual security mechanisms.

## Three-tier portal architecture

ExamSoft splits by audience into three connected surfaces rather than one app:

1. **Enterprise Portal** — the faculty/admin web app. Exam authoring, question
   banks/categories, user & course management, LMS sync, proctoring queue,
   grading, and reporting.
2. **Exam-Taker Portal** — the student-facing web app. Device readiness check,
   Examplify install, exam list, and post-exam upload confirmation.
3. **Examplify** — the native desktop/tablet client (Windows, macOS, iPad).
   The only surface where an exam is actually taken; offline-capable, with
   OS-level lockdown.

*Sources: ExamSoft Support — "Enterprise Portal: Exam-Taker Portal"; ExamSoft
product pages, Enterprise Portal overview.*

## The exam lifecycle pipeline

The path a single exam takes through the system, as ExamSoft's own support
docs describe it:

1. **Authoring & distribution** — faculty build exams from a reusable question
   bank in the Enterprise Portal (MCQ, essay, and other types), organized by
   course/category, with optional LMS sync for rosters and grades.
2. **Encrypted package download** — ahead of exam day, the student downloads
   an encrypted exam file through Examplify. Content is unreadable until the
   exam is opened with the released password:
   > "Exam-takers download an encrypted exam file onto their devices... they
   > can only view the questions in Examplify after they enter the exam
   > password and start the exam."
   — *support.examsoft.com, "Can Exam-Takers See Exam Information in Downloaded Files?"*
3. **Identity gate — ExamID (optional add-on)** — two-factor check: username/
   password, then a live photo matched against a baseline captured the first
   time ExamID was used. A mismatch blocks entry.
4. **Lockdown execution** — on password release, the device locks: no other
   applications, no internet, no access to local files outside Examplify. A
   forced reboot doesn't escape it:
   > "Secure mode locks down the exam-taker's computer completely... If an
   > exam-taker attempts to circumvent the secure assessment by forcefully
   > rebooting the device, the exam will reappear on the screen, and all
   > actions will be logged."
   — *support.examsoft.com, "Enterprise Portal: Security Options for Assessments"*
5. **Local autosave** — answers save roughly every 60 seconds, with multiple
   redundant encrypted local backup copies written during the sitting,
   independent of network state (the device is offline by design here).
   *Source: law.buffalo.edu, "Examplify Information & FAQ."*
6. **Continuous monitoring — ExamMonitor (optional add-on)** — where enabled,
   webcam, audio, and screen activity are captured throughout. Review is
   asynchronous: after upload, an AI pass screens the recording for
   movement/gaze/audio anomalies for human follow-up — it doesn't intervene
   live during the exam.
7. **Sync & grading** — once the device reconnects, the encrypted answer file
   uploads back to the institution; a confirmation with timestamp appears in
   the student portal. Scoring and feedback then flow through the Enterprise
   Portal at the instructor's discretion.

## Proctoring layer

ExamID and ExamMonitor are optional add-ons an institution enables per
assessment, not baseline behavior. Together they're marketed as a
live-remote-proctor replacement:

- **ExamID** (gate, stage 3) — one moment, pass/fail: baseline photo on first
  use, live match on every subsequent gated exam.
- **ExamMonitor** (continuous, stage 6) — full-session capture + async AI
  anomaly screening, handed to a human for the actual call — never an
  automatic penalty.

## What this informs for this trainer

- **Match the pipeline shape, not the internals.** The trainer's booking →
  gate → in-progress → submit → result flow already mirrors stages 2–7
  structurally — that's the muscle memory worth building.
- **Name the gap honestly.** Where the trainer's "lockdown" is browser-level
  integrity signals, not OS-level, the UI should say so — consistent with
  `ARCHITECTURE_DECISIONS.md` ADR-002.
- **The autosave cadence is a concrete, reusable detail.** A visible ~60s save
  rhythm is a real, low-effort fidelity win distinct from anything already built.
- **Proctoring stays clearly optional and human-reviewed.** Same posture as
  ExamID/ExamMonitor — a flag for a person, never an automatic penalty —
  which is already how the trainer's integrity review works.

## Sources

- [Enterprise Portal: Security Options for Assessments](https://support.examsoft.com/hc/en-us/articles/11168071541901-Enterprise-Portal-Security-Options-for-Assessments)
- [Can Exam-Takers See Exam Information in Downloaded Files?](https://support.examsoft.com/hc/en-us/articles/12163346483085-Can-Exam-Takers-See-Exam-Information-in-Downloaded-Files)
- [Upload FAQs](https://support.examsoft.com/hc/en-us/articles/36414488406541-Upload-FAQs)
- [Enterprise Portal: Get Started with ExamID and ExamMonitor](https://support.examsoft.com/hc/en-us/articles/11167818587917-Enterprise-Portal-Get-Started-with-ExamID-and-ExamMonitor)
- [Enterprise Portal: Exam-Taker Portal](https://support.examsoft.com/hc/en-us/articles/11145612877965-Enterprise-Portal-Exam-Taker-Portal)
- [ExamSoft — How it Works](https://examsoft.com/benefits/how-it-works/)
- [ExamID & ExamMonitor — Remote Proctoring and Identity Verification](https://www.turnitin.com/products/examsoft/exam-monitor-and-id-verification/)
- [University at Buffalo School of Law — Examplify Information & FAQ](https://www.law.buffalo.edu/registrar/exam-policies-procedures/taking-exams/examplify-information.html)

Also spot-checked: three YouTube walkthroughs (ExamSoft's own official channel
product overview, an institution's install tech-tip, and a third-party
screen-recorded demo) — all standard product-tutorial content, consistent
with the above, nothing that added new architecture detail.

**Not affiliated with or endorsed by ExamSoft / ExamSoft Worldwide, LLC.**
