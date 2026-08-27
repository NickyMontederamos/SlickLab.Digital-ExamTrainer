import type { CSSProperties } from "react";
import { AuthError } from "next-auth";
import Image from "next/image";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getDemoInstitutionBranding } from "@/lib/branding";
import { consumeAccountToken, getAccountTokenInfo, InvalidTokenError } from "@/lib/account-tokens";
import { Alert, Button, Card, inputClassName, labelClassName } from "@/components/ui";

/**
 * Shared landing page for both invite-based account setup and self-service
 * password reset — same form either way (set a new password), just
 * different heading/copy depending on the token's type. See
 * account-tokens.ts's docstring for why these share one mechanism.
 *
 * Public route, deliberately outside (app) — a brand-new invited user or
 * someone who forgot their password isn't authenticated yet.
 */
export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const branding = await getDemoInstitutionBranding();

  const brandStyle: CSSProperties & Record<string, string> = {};
  if (branding?.primaryColor) brandStyle["--brand-primary"] = branding.primaryColor;
  if (branding?.secondaryColor) brandStyle["--brand-secondary"] = branding.secondaryColor;

  let info;
  try {
    info = await getAccountTokenInfo(token);
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-brand-primary/10 to-slate-50 p-6 dark:to-slate-900" style={brandStyle}>
          <Card className="w-full max-w-sm text-center">
            <Alert tone="error">{err.message}</Alert>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Ask whoever sent you here for a fresh link, or{" "}
              <a href="/login" className="text-brand-primary hover:underline">
                sign in
              </a>{" "}
              if you already have a password.
            </p>
          </Card>
        </main>
      );
    }
    throw err;
  }

  const isInvite = info.type === "INVITE";

  async function setPasswordAction(formData: FormData) {
    "use server";
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (password.length < 8) {
      redirect(`/accept-invite/${token}?error=${encodeURIComponent("Password must be at least 8 characters.")}`);
    }
    if (password !== confirm) {
      redirect(`/accept-invite/${token}?error=${encodeURIComponent("Passwords don't match.")}`);
    }

    let email: string;
    try {
      const result = await consumeAccountToken(token, password);
      email = result.userEmail;
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        redirect(`/accept-invite/${token}?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    try {
      await signIn("credentials", { email, password, redirectTo: "/dashboard" });
    } catch (err) {
      if (err instanceof AuthError) {
        // Password was set successfully — a sign-in hiccup right after
        // shouldn't strand them on an error page for something that
        // already worked. Send them to a normal login instead.
        redirect("/login");
      }
      throw err;
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-brand-primary/10 to-slate-50 p-6 dark:to-slate-900" style={brandStyle}>
      <div className="flex items-center justify-center gap-4">
        {branding?.sealUrl && <Image src={branding.sealUrl} alt="College of Maasin seal" width={72} height={72} className="drop-shadow-sm" />}
        {branding?.logoUrl && <Image src={branding.logoUrl} alt="College of Law crest" width={62} height={62} className="h-auto w-[62px] drop-shadow-sm" />}
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {isInvite ? "Set up your account" : "Reset your password"}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {info.userName} · {info.userEmail}
        </p>
      </div>

      <Card className="w-full max-w-sm">
        {error && (
          <div className="mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <form action={setPasswordAction} className="flex flex-col gap-4">
          <label className={labelClassName}>
            New password
            <input name="password" type="password" required minLength={8} autoFocus className={inputClassName} />
          </label>
          <label className={labelClassName}>
            Confirm password
            <input name="confirm" type="password" required minLength={8} className={inputClassName} />
          </label>
          <Button type="submit" className="mt-1 w-full">
            {isInvite ? "Set password & continue" : "Reset password & sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
