import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <BrandCredit />
      </body>
    </html>
  );
}
