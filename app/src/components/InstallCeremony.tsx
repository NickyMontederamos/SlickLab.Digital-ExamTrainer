"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

type Step = "institution" | "download" | "downloading" | "launch" | "add-account" | "register";

const STEP_ORDER: Step[] = ["institution", "download", "downloading", "launch", "add-account", "register"];
const DOWNLOAD_MS = 1400;
const DEVICE_ID_STORAGE_KEY = "examplify-device-id";

/**
 * The install/register ceremony a new student walks through once, mirroring
 * Examplify's real "find your institution → download → install → launch →
 * Add New Account → register" flow (docs/EXAMPLIFY_ARCHITECTURE_REFERENCE.md).
 *
 * Steps 1-5 are pure ceremony — there is no real installer, and building or
 * distributing one would be out of scope (and inappropriate: no real
 * executable should run on the student's machine for this). Step 6 is the
 * one genuinely real action: it writes a DeviceRegistration row via
 * completeRegistrationAction, so this ceremony runs exactly once per
 * account — matching the real product's own "Clear the Registration on Your
 * Device" being a deliberate, occasional reset rather than something that
 * happens every launch.
 *
 * The real product asks for credentials a second time at this final step
 * (a separate native-app login that's what actually registers the device).
 * This trainer has one real auth system, not two, and the student is
 * already authenticated by the time they reach this page — asking for the
 * password again here would be friction with no real security purpose, so
 * step 6 just confirms the already-signed-in identity instead.
 */
export function InstallCeremony({
  studentName,
  studentEmail,
  institutionName,
  courses,
  completeRegistrationAction,
}: {
  studentName: string;
  studentEmail: string;
  institutionName: string;
  courses: { id: string; code: string; name: string; academicYear: string }[];
  completeRegistrationAction: (deviceFingerprint: string) => Promise<void>;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("institution");
  const [progress, setProgress] = useState(0);
  const [registering, setRegistering] = useState(false);
  const deviceIdRef = useRef<string>("");

  useEffect(() => {
    let id = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    }
    deviceIdRef.current = id;
  }, []);

  useEffect(() => {
    if (step !== "downloading") return;
    const start = Date.now();
    const id = window.setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - start) / DOWNLOAD_MS) * 100));
      setProgress(pct);
      if (pct >= 100) {
        window.clearInterval(id);
        setStep("launch");
      }
    }, 80);
    return () => window.clearInterval(id);
  }, [step]);

  async function handleRegister() {
    setRegistering(true);
    try {
      await completeRegistrationAction(deviceIdRef.current);
      router.push("/dashboard");
      router.refresh();
    } finally {
      setRegistering(false);
    }
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-1 flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">CM-LAW SecureExam</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Device Setup — Step {stepIndex + 1} of {STEP_ORDER.length}</p>
      </div>

      <div className="flex items-center gap-1.5">
        {STEP_ORDER.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-brand-primary" : "bg-slate-200 dark:bg-slate-800"}`}
          />
        ))}
      </div>

      {step === "institution" && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">Find Your Institution</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Start entering your institution name, then select it from the list.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Institution
            </label>
            <div className="rounded-lg border-2 border-brand-primary px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100">
              {institutionName}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="border-b border-slate-100 bg-brand-primary/10 px-3.5 py-2.5 text-sm font-medium text-brand-primary dark:border-slate-800">
                {institutionName}
              </div>
            </div>
          </div>
          <Button type="button" onClick={() => setStep("download")} className="self-start">
            Continue
          </Button>
        </Card>
      )}

      {step === "download" && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">Download CM-LAW SecureExam</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Signed in as {studentName} — {institutionName}
            </p>
          </div>
          {courses.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Course</th>
                    <th className="px-3 py-2 font-medium">Year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {courses.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                        {c.code} — {c.name}
                      </td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{c.academicYear}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button type="button" onClick={() => setStep("downloading")} className="self-start">
            Download CM-LAW SecureExam
          </Button>
        </Card>
      )}

      {step === "downloading" && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Downloading…</h2>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
              <span>CM-LAW-SecureExam-Installer</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </Card>
      )}

      {step === "launch" && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">Installed</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              CM-LAW SecureExam is ready. Launch it to add your account.
            </p>
          </div>
          <Button type="button" onClick={() => setStep("add-account")} className="self-start">
            Launch CM-LAW SecureExam
          </Button>
        </Card>
      )}

      {step === "add-account" && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">Add New Account</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Confirm your institution to continue.</p>
          </div>
          <div className="rounded-lg border-2 border-brand-primary px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100">
            {institutionName}
          </div>
          <Button type="button" onClick={() => setStep("register")} className="self-start">
            Next
          </Button>
        </Card>
      )}

      {step === "register" && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">Register This Device</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Signed in as <span className="font-medium text-slate-700 dark:text-slate-300">{studentName}</span>
              {studentEmail && <span className="text-slate-400 dark:text-slate-500"> ({studentEmail})</span>}. This binds
              CM-LAW SecureExam on this device to your account — you won&apos;t need to do this again unless you clear
              the registration.
            </p>
          </div>
          <Button type="button" onClick={handleRegister} disabled={registering} className="self-start">
            {registering ? "Registering…" : "Register This Device"}
          </Button>
        </Card>
      )}
    </main>
  );
}
