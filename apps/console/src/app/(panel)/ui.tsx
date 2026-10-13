import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/util";

export function Card({ className, flush = false, children }: { className?: string; flush?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("glass rounded-3xl", !flush && "p-5 sm:p-6", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, sub, icon: Icon, children }: { title: string; sub?: string; icon?: LucideIcon; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-200/70">
            <Icon size={18} strokeWidth={2.2} />
          </span>
        )}
        <div>
          <h2 className="text-[1.08rem] font-bold text-ink">{title}</h2>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function PageTitle({ title, sub, eyebrow, children }: { title: string; sub?: string; eyebrow?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2 text-accent-ink">{eyebrow}</p>}
        <h1 className="text-[1.9rem] font-extrabold leading-tight tracking-[-0.025em] text-ink">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/15",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/15",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/15",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20",
  grey: "bg-slate-100 text-slate-600 ring-slate-500/15",
} as const;
const DOTS = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-rose-500", blue: "bg-blue-500", violet: "bg-violet-500", orange: "bg-orange-500", grey: "bg-slate-400" } as const;
export type Tone = keyof typeof TONES;
export const TONE_BAR: Record<Tone, string> = DOTS;

export function Badge({ tone = "grey", dot = false, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]", TONES[tone])}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}

export const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  SITE_VISIT_BOOKED: { label: "Site visit booked", tone: "green" },
  INTERESTED: { label: "Interested", tone: "blue" },
  CALLBACK: { label: "Callback", tone: "violet" },
  NOT_INTERESTED: { label: "Not interested", tone: "grey" },
  ESCALATED: { label: "Escalated", tone: "orange" },
  DNC: { label: "Do not call", tone: "red" },
  WRONG_NUMBER: { label: "Wrong number", tone: "grey" },
  COMPLETED: { label: "Completed", tone: "blue" },
  NO_ANSWER: { label: "No answer", tone: "grey" },
  BUSY: { label: "Busy", tone: "amber" },
  FAILED: { label: "Failed", tone: "red" },
};

export const LEAD_STATUS: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "orange" },
  CONTACTED: { label: "Contacted", tone: "blue" },
  INTERESTED: { label: "Interested", tone: "violet" },
  SITE_VISIT: { label: "Site visit", tone: "green" },
  NOT_INTERESTED: { label: "Not interested", tone: "grey" },
  WON: { label: "Won", tone: "green" },
  LOST: { label: "Lost", tone: "grey" },
  DNC: { label: "Do not call", tone: "red" },
};

export function OutcomeBadge({ outcome }: { outcome?: string | null }) {
  if (!outcome) return <Badge tone="amber" dot>In progress</Badge>;
  const o = OUTCOME[outcome] ?? { label: outcome, tone: "grey" as Tone };
  return <Badge tone={o.tone} dot>{o.label}</Badge>;
}

export function LeadBadge({ status }: { status: string }) {
  const s = LEAD_STATUS[status] ?? { label: status, tone: "grey" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

const STAT_TONES = {
  blue: "bg-orange-50 text-orange-600 ring-orange-200/70",
  green: "bg-emerald-50 text-emerald-600 ring-emerald-200/70",
  orange: "bg-amber-50 text-amber-600 ring-amber-200/70",
  violet: "bg-violet-50 text-violet-600 ring-violet-200/70",
} as const;

export type Trend = { text: string; dir: "up" | "down" | "flat" };

export function Stat({ label, value, hint, icon: Icon, tone = "blue", trend }: { label: string; value: React.ReactNode; hint?: string; icon?: LucideIcon; tone?: keyof typeof STAT_TONES; trend?: Trend | null }) {
  return (
    <Card className="card-hover p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.88rem] font-semibold text-muted">{label}</p>
          <div className="mt-2 flex items-baseline gap-3">
            <p className="digits text-[2.75rem] leading-none">{value}</p>
            {trend && (
              <span
                title="Compared with the previous period"
                className={cn("inline-flex items-center gap-0.5 text-sm font-bold", trend.dir === "up" ? "text-emerald-600" : trend.dir === "down" ? "text-rose-600" : "text-muted")}
              >
                {trend.dir === "up" ? "↑" : trend.dir === "down" ? "↓" : "→"} {trend.text}
              </span>
            )}
          </div>
          {hint && <p className="mt-2.5 text-[0.82rem] text-muted">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1", STAT_TONES[tone])}>
            <Icon size={22} strokeWidth={2.1} />
          </span>
        )}
      </div>
    </Card>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="neu-inset rounded-2xl px-4 py-10 text-center text-sm font-medium text-muted">{children}</p>;
}

export function Avatar({ name, tone = "navy" }: { name?: string | null; tone?: "navy" | "orange" }) {
  const initials = (name ?? "?").replace(/\(.*?\)/g, "").trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-[0.8rem] font-extrabold ring-1", tone === "navy" ? "bg-[#eef3f1] text-[#1f3a33] ring-[#dfe8e4]" : "bg-orange-50 text-orange-700 ring-orange-200/70")}>
      {initials}
    </span>
  );
}

export const SEGMENT_LABEL: Record<string, string> = { RESIDENTIAL: "Home", COMMERCIAL: "Business", INDUSTRIAL: "Factory" };
