import Link from "next/link";
import {
  Activity, BellRing, CalendarCheck, ChevronRight, FileText, Headset, Mic, PhoneCall, PhoneIncoming, PhoneOutgoing, Radio, Upload, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { closeStaleTestCalls } from "@/lib/calls";
import { voiceServerConfigured, voiceStatus } from "@/lib/voice-server";
import { prisma } from "@/lib/db";
import { cn, istDay, timeAgo } from "@/lib/util";
import { LineChart } from "./charts";
import { RangeSelect } from "./RangeSelect";
import { Card, Empty, OUTCOME, Stat, type Trend } from "./ui";

const DAY = 86_400_000;

function pct(cur: number, prev: number): Trend | null {
  if (prev === 0) return cur > 0 ? { text: "new", dir: "up" } : null;
  const d = Math.round(((cur - prev) / prev) * 100);
  return { text: `${Math.abs(d)}%`, dir: d > 0 ? "up" : d < 0 ? "down" : "flat" };
}

type Item = { at: Date; icon: LucideIcon; tone: string; title: string; sub: string; href: string };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string; range?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const range = [7, 14, 30].includes(Number(sp.range)) ? Number(sp.range) : 7;
  await closeStaleTestCalls();

  const now = new Date();
  const since = new Date(now.getTime() - range * DAY);
  const prevSince = new Date(now.getTime() - 2 * range * DAY);
  const cur = { gte: since };
  const prev = { gte: prevSince, lt: since };

  const [
    calls, callsPrev, visits, visitsPrev, escNew, openEsc, overdue, leads, leadsNew, leadsPrev,
    callDays, visitDays, recentCalls, recentVisits, recentEsc, settings, prices,
  ] = await Promise.all([
    prisma.call.count({ where: { startedAt: cur } }),
    prisma.call.count({ where: { startedAt: prev } }),
    prisma.siteVisit.count({ where: { createdAt: cur } }),
    prisma.siteVisit.count({ where: { createdAt: prev } }),
    prisma.escalation.count({ where: { createdAt: cur } }),
    prisma.escalation.count({ where: { status: { not: "RESOLVED" } } }),
    prisma.escalation.count({ where: { status: { not: "RESOLVED" }, dueAt: { lt: now } } }),
    prisma.lead.count(),
    prisma.lead.count({ where: { createdAt: cur } }),
    prisma.lead.count({ where: { createdAt: prev } }),
    prisma.call.findMany({ where: { startedAt: cur }, select: { startedAt: true }, take: 20_000 }),
    prisma.siteVisit.findMany({ where: { createdAt: cur }, select: { createdAt: true }, take: 20_000 }),
    prisma.call.findMany({ orderBy: { startedAt: "desc" }, take: 6, include: { lead: { select: { name: true, phone: true } } } }),
    prisma.siteVisit.findMany({ orderBy: { createdAt: "desc" }, take: 4, include: { lead: { select: { name: true, city: true } } } }),
    prisma.escalation.findMany({ orderBy: { createdAt: "desc" }, take: 4, include: { lead: { select: { name: true } } } }),
    prisma.agentSettings.findUnique({ where: { id: 1 } }),
    prisma.priceRow.count({ where: { sample: true } }),
  ]);
  const configured = voiceServerConfigured();
  const voice = configured ? await voiceStatus() : null;

  // Daily series (IST days)
  const days = Array.from({ length: range }, (_, i) => new Date(now.getTime() - (range - 1 - i) * DAY));
  const keys = days.map(istDay);
  const count = (dates: Date[]) => {
    const m = new Map<string, number>();
    for (const d of dates) m.set(istDay(d), (m.get(istDay(d)) ?? 0) + 1);
    return keys.map((k) => m.get(k) ?? 0);
  };
  const labels = days.map((d) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d));
  const callSeries = count(callDays.map((c) => c.startedAt));
  const visitSeries = count(visitDays.map((v) => v.createdAt));

  // Recent activity feed
  const items: Item[] = [
    ...recentCalls.map<Item>((c) => {
      const who = c.lead?.name ?? c.lead?.phone ?? c.fromNumber ?? c.toNumber ?? "Unknown caller";
      const outcome = c.outcome ? OUTCOME[c.outcome]?.label ?? c.outcome : "in progress";
      if (c.isTest) return { at: c.startedAt, icon: Headset, tone: "bg-orange-50 text-orange-600", title: "Test call", sub: `${who} · ${outcome}`, href: `/calls/${c.id}` };
      return c.direction === "INBOUND"
        ? { at: c.startedAt, icon: PhoneIncoming, tone: "bg-emerald-50 text-emerald-600", title: "Inbound call", sub: `${who} · ${outcome}`, href: `/calls/${c.id}` }
        : { at: c.startedAt, icon: PhoneOutgoing, tone: "bg-orange-50 text-orange-600", title: "Outbound call", sub: `${who} · ${outcome}`, href: `/calls/${c.id}` };
    }),
    ...recentVisits.map<Item>((v) => ({
      at: v.createdAt, icon: CalendarCheck, tone: "bg-violet-50 text-violet-600", title: "Site visit booked",
      sub: [v.lead?.name, v.lead?.city].filter(Boolean).join(" – ") || v.label, href: "/leads",
    })),
    ...recentEsc.map<Item>((e) => ({
      at: e.createdAt, icon: BellRing, tone: "bg-sky-50 text-sky-600", title: "New question for sales", sub: `“${e.question.slice(0, 60)}${e.question.length > 60 ? "…" : ""}”`, href: "/escalations",
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  const status = [
    { icon: Radio, label: "Phone line", value: voice ? (voice.line === "smartflo" ? "Tata Smartflo" : "Simulator") : configured ? "Unreachable" : "Not connected", ok: Boolean(voice), href: "/settings" },
    { icon: Mic, label: "Voice", value: voice ? (voice.speech === "sarvam" ? "Sarvam" : "Simulated") : "Browser voice", ok: Boolean(voice), href: "/settings" },
    {
      icon: Activity, label: "Auto-dialer", href: "/settings", ok: Boolean(voice?.canDial),
      value: voice ? (voice.canDial ? `Calling · ${voice.active} live` : !voice.enabled ? "Switched off" : !voice.inHours ? "Outside hours" : "Budget reached") : settings?.outboundEnabled ? "On (no server)" : "Switched off",
    },
    { icon: Wallet, label: "This month", value: voice ? `₹${Math.round(voice.spentRupees).toLocaleString("en-IN")}` : "₹0", ok: true, href: "/calls" },
  ];
  const first = user.name.split(" ")[0];
  const period = `last ${range} days`;

  return (
    <>
      {sp.denied && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-600/15">Your role cannot open that page.</p>}

      {/* Hero with the solar field */}
      <section className="relative mb-6 overflow-hidden rounded-3xl border border-[#f3e6d8] bg-[#fff7ef] shadow-[0_1px_2px_rgb(18_28_34/0.04),0_10px_30px_-12px_rgb(160_90_20/0.18)]">
        <div aria-hidden className="absolute inset-y-0 right-0 w-[68%] bg-[url('/images/solar-sunset.jpg')] bg-cover bg-[position:60%_62%]" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,#fff7ef_0%,#fff7ef_36%,rgb(255_247_239/0.82)_50%,rgb(255_247_239/0.25)_72%,rgb(255_247_239/0)_100%)]" />
        <div className="relative p-6 sm:p-8">
          <p className="eyebrow text-ink-2">Voice agent · {period}</p>
          <h1 className="mt-2 text-[2.2rem] font-extrabold leading-tight tracking-[-0.03em] text-ink sm:text-[2.6rem]">
            Welcome back, <span className="text-accent">{first}</span>
          </h1>
          <p className="mt-2 max-w-xl text-[0.98rem] text-ink-2">
            {calls} calls, {visits} site visit{visits === 1 ? "" : "s"} booked and {openEsc} question{openEsc === 1 ? "" : "s"} waiting for the sales team.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/leads" className="btn btn-ghost h-12 rounded-xl px-5"><Upload size={18} /> Import leads</Link>
            <Link href="/test-call" className="btn btn-accent h-12 rounded-xl px-5"><Headset size={18} /> Start a test call</Link>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {status.map((s) => (
              <Link key={s.label} href={s.href} className="group flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-3.5 shadow-[0_1px_2px_rgb(18_28_34/0.05),0_8px_20px_-12px_rgb(18_28_34/0.2)] ring-1 ring-black/[0.03] transition-transform hover:-translate-y-0.5">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60"><s.icon size={19} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.7rem] font-bold uppercase tracking-wider text-muted">{s.label}</span>
                  <span className="flex items-center gap-1.5 truncate text-[0.95rem] font-bold text-ink">
                    <span className={cn("h-2 w-2 rounded-full", s.ok ? "bg-emerald-500" : "bg-slate-400")} />
                    {s.value}
                  </span>
                </span>
                <ChevronRight size={18} className="text-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {prices > 0 && (
        <Link href="/pricing" className="group mb-6 flex items-center gap-3 rounded-2xl border border-orange-200/70 bg-orange-50/80 px-5 py-3.5 text-[0.95rem] text-ink-2 transition-colors hover:bg-orange-50">
          <FileText size={20} className="shrink-0 text-orange-600" />
          <span><b className="text-ink">{prices} prices</b> are still website sample data. <span className="font-semibold text-ink underline decoration-dotted underline-offset-4">Add the official sheet</span></span>
          <ChevronRight size={18} className="ml-auto text-orange-600 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
      {!configured && (
        <p className="mb-6 rounded-2xl border border-[#ebe7e0] bg-white px-5 py-3 text-sm text-muted">Phone server not connected yet — calls here are browser tests.</p>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Calls" value={calls} hint={period} icon={PhoneCall} tone="blue" trend={pct(calls, callsPrev)} />
        <Stat label="Site visits booked" value={visits} hint={period} icon={CalendarCheck} tone="green" trend={pct(visits, visitsPrev)} />
        <Stat label="Open escalations" value={openEsc} hint={`${escNew} raised · ${overdue ? `${overdue} overdue` : "none overdue"}`} icon={BellRing} tone="orange" />
        <Stat label="Leads" value={leads} hint="all time" icon={Users} tone="violet" trend={pct(leadsNew, leadsPrev)} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[1.15rem] font-bold">Calls &amp; Site Visits</h2>
              <div className="mt-2 flex gap-5 text-sm text-muted">
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#f47b20]" /> Calls</span>
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#1f9d55]" /> Site visits</span>
              </div>
            </div>
            <RangeSelect value={range} />
          </div>
          <LineChart labels={labels} series={[{ name: "Calls", color: "#f47b20", values: callSeries }, { name: "Site visits", color: "#1f9d55", values: visitSeries }]} />
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: "Calls", value: calls.toLocaleString("en-IN"), tone: "text-orange-600" },
              { label: "Site visits", value: visits.toLocaleString("en-IN"), tone: "text-emerald-600" },
              { label: "Visit rate", value: calls ? `${Math.round((visits / calls) * 100)}%` : "—", tone: "text-ink" },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl bg-[#faf8f5] px-4 py-3 ring-1 ring-[#efebe4]">
                <p className="text-xs font-semibold text-muted">{m.label} · {period}</p>
                <p className={cn("digits mt-1 text-2xl", m.tone)}>{m.value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[1.15rem] font-bold">Recent Activity</h2>
            <Link href="/calls" className="text-sm font-semibold text-navy-3 underline decoration-dotted underline-offset-4 hover:decoration-solid">View all</Link>
          </div>
          {items.length ? (
            <ul className="divide-y divide-[#f1ede7]">
              {items.map((it, i) => (
                <li key={i}>
                  <Link href={it.href} className="flex items-center gap-3.5 py-3 transition-colors hover:bg-[#fffaf4]">
                    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", it.tone)}><it.icon size={19} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.95rem] font-bold text-ink">{it.title}</span>
                      <span className="block truncate text-sm text-muted">{it.sub}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(it.at, now)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty>No activity yet. Try a test call.</Empty>}
        </Card>
      </div>
    </>
  );
}
