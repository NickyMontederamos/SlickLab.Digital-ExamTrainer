import type { CSSProperties, ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Script from "next/script";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { getDemoInstitutionBranding } from "@/lib/branding";
import { hasRegisteredDevice } from "@/lib/device-registration";

/**
 * Shared chrome for every authenticated route (dashboard, courses, exams,
 * attempts, admin, users). /login sits outside this route group deliberately
 * — it has its own centered branding treatment and shouldn't get a second
 * header above it.
 *
 * Sets --brand-primary/--brand-secondary (see globals.css) from the signed-in
 * institution's branding, scoped to this wrapper so every `bg-brand-primary`
 * etc. utility anywhere in the authenticated app reflects the actual tenant
 * instead of a hardcoded color — before this pass, institution branding
 * colors were only ever used on the login page's button.
 *
 * `force-dynamic` is required, not just a hardening default: this layout's
 * own DB call (unlike AppHeader's auth()/cookies() call) isn't the kind of
 * API Next.js treats as an automatic dynamic-rendering signal, so without
 * this it will attempt to statically prerender the shell at `next build`
 * time — executing a real Postgres query during the build, which breaks the
 * build whenever Postgres isn't reachable there (exactly the concern
 * docs/DEPLOYMENT.md already raises about production build environments not
 * always having DB access) and would bake branding into a stale static
 * shell even when it works. Every route here was already effectively
 * dynamic via auth()'s cookies() access — this just makes it explicit.
 */
export const dynamic = "force-dynamic";

export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  // Every (app) route requires a registered device for STUDENT — the
  // install/register ceremony (/register-device) is the very first thing a
  // new student does, before reaching any real course content, mirroring
  // Examplify's own device-registration flow. FACULTY/PROCTOR/INSTITUTION_ADMIN
  // never install anything and are never gated here.
  const session = await auth();
  if (session?.user?.role === "STUDENT" && session.user.institutionId) {
    const registered = await hasRegisteredDevice(session.user.institutionId, session.user);
    if (!registered) {
      redirect("/register-device");
    }
  }

  const branding = await getDemoInstitutionBranding();

  const brandStyle: CSSProperties & Record<string, string> = {};
  if (branding?.primaryColor) brandStyle["--brand-primary"] = branding.primaryColor;
  if (branding?.secondaryColor) brandStyle["--brand-secondary"] = branding.secondaryColor;

  const roleTheme = roleDefaultTheme(session?.user?.role);
  // Same CSP nonce mechanism as the root layout's own bootstrap script —
  // required, not optional: this script is blocked outright without it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="flex min-h-full flex-col bg-slate-50 dark:bg-slate-950" style={brandStyle}>
      {/* Sets the signed-in role's default theme (Admin/Faculty dark,
          Student light, Proctor grey) — but only when the user has never
          manually toggled the header's light/dark switch (localStorage
          "theme" unset). A saved manual choice always wins, on any role,
          same as it did before role defaults existed. Runs after the root
          layout's own OS-preference bootstrap, correcting it for a
          first-time visitor rather than replacing that script outright,
          since this layout (unlike the root one) knows the signed-in role.
          next/script, not a raw <script> tag — same reasoning as the root
          layout's own script. strategy="afterInteractive" here, not
          "beforeInteractive": that strategy is a root-layout-only feature.
          Accepting a brief flash of the root script's theme before this
          corrects it is the honest tradeoff for a role DEFAULT (not a
          security-relevant value) — a manual toggle's persisted choice
          still applies with zero flash, since the root script alone
          already gets that right. */}
      <Script id="theme-role-override" strategy="afterInteractive" nonce={nonce}>
        {themeBootstrapOverrideScript(roleTheme, session?.user?.role)}
      </Script>
      <AppHeader />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

type RoleTheme = "dark" | "light" | "grey";

function roleDefaultTheme(role: string | undefined): RoleTheme {
  if (role === "STUDENT") return "light";
  if (role === "PROCTOR") return "grey";
  // FACULTY, INSTITUTION_ADMIN, SUPER_ADMIN, PLATFORM_ADMIN, and the
  // unauthenticated fallback (shouldn't reach this layout without a role,
  // but a safe default matters more than an exhaustive switch here).
  return "dark";
}

function themeBootstrapOverrideScript(theme: RoleTheme, role: string | undefined): string {
  const apply =
    theme === "dark"
      ? 'document.documentElement.classList.add("dark");'
      : theme === "grey"
        ? 'document.documentElement.setAttribute("data-theme","grey");'
        : "";
  // Only trust the saved "theme" value if it was set BY this same role
  // (themeRole matches) — otherwise it belongs to a different account that
  // shares this browser (the demo/dev pattern of switching between
  // admin/faculty/student/proctor logins), and this role's own default
  // should win instead of inheriting a stranger's manual choice.
  const roleJson = JSON.stringify(role ?? "");
  return `(function(){try{var savedForThisRole=localStorage.getItem("themeRole")===${roleJson};if(!localStorage.getItem("theme")||!savedForThisRole){document.documentElement.classList.remove("dark");document.documentElement.removeAttribute("data-theme");${apply}}}catch(e){}})();`;
}
