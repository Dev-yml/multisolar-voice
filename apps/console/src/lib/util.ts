export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export const formatDateTime = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d);

export const formatDate = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function duration(sec?: number | null) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

/** "in 31h", "overdue 3h" for the 48-hour escalation clock. */
export function dueIn(dueAt: Date, now = new Date()) {
  const h = Math.round((dueAt.getTime() - now.getTime()) / 3_600_000);
  if (h < 0) return { text: `overdue ${-h}h`, tone: "red" as const };
  if (h <= 24) return { text: `due in ${h}h`, tone: "amber" as const };
  return { text: `due in ${h}h`, tone: "green" as const };
}

/** Indian mobile → 10 digits (strips +91 / 0 / spaces). */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[^\d]/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** "2 min ago", "3 h ago", "yesterday", "12 Oct". */
export function timeAgo(d: Date, now = new Date()) {
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.round(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).format(d);
}

/** Calendar day in India, e.g. "2026-10-10" — for daily charts. */
export const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
