import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { BrandCredit } from "@/components/BrandCredit";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CM Law Exam Readiness Trainer",
  // "Practice environment" and "not affiliated with ExamSoft" are both
  // load-bearing words here, not just description flavor — this app
  // deliberately mimics real secure-exam interaction patterns (see
  // Milestone 8, docs/PITCH_ROADMAP.md) and must never read as, or be
  // mistaken for, the actual graded exam software it's training students
  // to use.
  description:
    "Practice environment for College of Maasin — College of Law students to build familiarity with secure digital exam interfaces before sitting official exams. Not affiliated with or endorsed by ExamSoft/ExamSoft Worldwide, LLC.",
};

// Runs before hydration so the .dark class is already correct on first
// paint — reading localStorage in a component instead would flash the
// wrong theme for a frame. Falls back to prefers-color-scheme when the
// user has never toggled explicitly.
const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // middleware.ts sets this per-request nonce on both the CSP header (which
  // Next.js auto-applies to its own framework-generated scripts) and this
  // plain request header, specifically so a hand-authored inline <script>
  // like the one below can be explicitly nonced too — without this, the CSP
  // correctly blocks it (was a real, latent bug: this script had never
  // actually been nonced, just never caught because this project's CSP E2E
  // suite hadn't been re-run since middleware.ts's CSP was added).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* next/script's beforeInteractive strategy, not a raw <script> tag —
            React 19 explicitly warns against a bare <script> as plain JSX
            content (it's never executed on a client-side re-render, and was
            producing a real hydration mismatch here). beforeInteractive is
            still injected before hydration, preserving the original intent:
            the .dark class is correct on first paint, no flash. */}
        <Script id="theme-bootstrap" strategy="beforeInteractive" nonce={nonce}>
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <BrandCredit />
      </body>
    </html>
  );
}
