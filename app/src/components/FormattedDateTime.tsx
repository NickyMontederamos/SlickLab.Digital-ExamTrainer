"use client";

/**
 * Renders a date/time in the *viewer's* actual local timezone. A Server
 * Component calling `date.toLocaleString()` runs that formatting on the
 * server process (UTC on Vercel), not the browser reading the page — same
 * root cause as the bug LocalDateTimeInput.tsx fixes on the input side.
 * This is the read-only counterpart: pass an ISO string, get it formatted
 * correctly client-side, where the real timezone is actually known.
 */
export function FormattedDateTime({
  iso,
  dateStyle = "medium",
  timeStyle = "short",
}: {
  iso: string;
  dateStyle?: "full" | "long" | "medium" | "short";
  timeStyle?: "full" | "long" | "medium" | "short";
}) {
  return <>{new Date(iso).toLocaleString(undefined, { dateStyle, timeStyle })}</>;
}
