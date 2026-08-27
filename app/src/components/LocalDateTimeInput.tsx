"use client";

import { useEffect, useState } from "react";

/**
 * A datetime-local input that actually round-trips through UTC correctly.
 *
 * A plain `<input type="datetime-local">` submitted via a native form POST
 * carries no timezone info at all ("2026-08-27T18:00"). When a server
 * action did `new Date(rawValue)`, Node parsed that as local time in the
 * SERVER's own timezone (UTC on Vercel) — not the browser's. An admin in
 * Manila typing "6:00 PM" intending Philippine time had it silently stored
 * as 6:00 PM UTC (2:00 AM the next day in Manila), an 8-hour corruption on
 * every save, and every display of that value read it back the same wrong
 * way, hiding the bug until a student actually looked at the wrong time.
 *
 * Fix: do the local-to-UTC conversion in the browser, where the true
 * timezone is actually known. The visible input carries no `name` — a
 * hidden sibling input, using the field name the server action already
 * reads, carries a real ISO-8601 string with a 'Z' suffix, which
 * `new Date()` parses unambiguously as UTC no matter what timezone the
 * server process happens to run in.
 *
 * SSR renders the visible input empty (the server can't know the client's
 * timezone yet); a `useEffect` fills it in right after mount, once the
 * browser's own local timezone can be used to convert `valueUtcIso`. A
 * one-frame blank flash on load is the honest tradeoff for correctness.
 */
export function LocalDateTimeInput({
  name,
  valueUtcIso,
  minUtcIso,
  maxUtcIso,
  required,
  className,
}: {
  name: string;
  valueUtcIso?: string | null;
  minUtcIso?: string | null;
  maxUtcIso?: string | null;
  required?: boolean;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState("");
  const [utcIso, setUtcIso] = useState(valueUtcIso ?? "");
  const [localMin, setLocalMin] = useState<string | undefined>(undefined);
  const [localMax, setLocalMax] = useState<string | undefined>(undefined);

  useEffect(() => {
    setLocalValue(valueUtcIso ? toLocalInputValue(new Date(valueUtcIso)) : "");
    setUtcIso(valueUtcIso ?? "");
  }, [valueUtcIso]);

  useEffect(() => {
    setLocalMin(minUtcIso ? toLocalInputValue(new Date(minUtcIso)) : undefined);
  }, [minUtcIso]);

  useEffect(() => {
    setLocalMax(maxUtcIso ? toLocalInputValue(new Date(maxUtcIso)) : undefined);
  }, [maxUtcIso]);

  return (
    <>
      <input
        type="datetime-local"
        className={className}
        value={localValue}
        min={localMin}
        max={localMax}
        required={required}
        onChange={(e) => {
          const next = e.target.value;
          setLocalValue(next);
          setUtcIso(next ? new Date(next).toISOString() : "");
        }}
      />
      <input type="hidden" name={name} value={utcIso} />
    </>
  );
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
