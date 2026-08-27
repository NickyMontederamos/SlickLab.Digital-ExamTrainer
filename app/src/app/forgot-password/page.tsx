import type { CSSProperties } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Image from "next/image";
import { getDemoInstitutionBranding } from "@/lib/branding";
import { requestPasswordReset } from "@/lib/account-tokens";
import { Alert, Button, Card, inputClassName, labelClassName } from "@/components/ui";

/**
 * Public, unauthenticated request form. Deliberately shows the same
 * "check your inbox" confirmation whether or not the email actually has an
 * account — see requestPasswordReset()'s own docstring on why: this page
 * must not be usable to enumerate which emails have accounts.
 *
 * No email infrastructure exists yet (see docs/DISASTER_RECOVERY.md), so
 * for now the reset link is shown directly on this page rather than
 * emailed — same honest-about-current-scope posture as the rest of this
 * app (e.g. ExamDownloadGate's "Non-Secure" label). Swap the `sent` branch
 * below for a real email send once that infrastructure exists; nothing
 * else about this flow needs to change.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; link?: string }>;
}) {
  const { sent, link } = await searchParams;
  const branding = await getDemoInstitutionBranding();
  const linkUrl = link ? `${(await headers()).get("x-forwarded-proto") ?? "https"}://${(await headers()).get("host")}/accept-invite/${link}` : null;

  const brandStyle: CSSProperties & Record<string, string> = {};
  if (branding?.primaryColor) brandStyle["--brand-primary"] = branding.primaryColor;
  if (branding?.secondaryColor) brandStyle["--brand-secondary"] = branding.secondaryColor;

  async function requestResetAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    const token = await requestPasswordReset(email);
    redirect(token ? `/forgot-password?sent=1&link=${token}` : "/forgot-password?sent=1");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-brand-primary/10 to-slate-50 p-6 dark:to-slate-900" style={brandStyle}>
      <div className="flex items-center justify-center gap-4">
        {branding?.sealUrl && <Image src={branding.sealUrl} alt="College of Maasin seal" width={72} height={72} className="drop-shadow-sm" />}
        {branding?.logoUrl && <Image src={branding.logoUrl} alt="College of Law crest" width={62} height={62} className="h-auto w-[62px] drop-shadow-sm" />}
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Forgot your password?</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Enter your email and we&apos;ll send you a reset link.</p>
      </div>

      <Card className="w-full max-w-sm">
        {sent ? (
          <div className="flex flex-col gap-3">
            <Alert tone="success">If that email has an account, a reset link has been sent.</Alert>
            {linkUrl && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No email sending is wired up yet — here&apos;s the link directly:
                </p>
                <code className="break-all rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  {linkUrl}
                </code>
              </div>
            )}
            <a href="/login" className="text-center text-sm text-brand-primary hover:underline">
              Back to sign in
            </a>
          </div>
        ) : (
          <form action={requestResetAction} className="flex flex-col gap-4">
            <label className={labelClassName}>
              Email
              <input name="email" type="email" required autoFocus className={inputClassName} />
            </label>
            <Button type="submit" className="mt-1 w-full">
              Send reset link
            </Button>
            <a href="/login" className="text-center text-sm text-slate-500 hover:text-brand-primary dark:text-slate-400">
              Back to sign in
            </a>
          </form>
        )}
      </Card>
    </main>
  );
}
