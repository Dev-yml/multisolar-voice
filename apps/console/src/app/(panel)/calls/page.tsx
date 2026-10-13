import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/guard";
import { closeStaleTestCalls } from "@/lib/calls";
import { prisma } from "@/lib/db";
import { duration, formatDateTime } from "@/lib/util";
import { PhoneIncoming, PhoneOutgoing, Search } from "lucide-react";
import { Avatar, Badge, Card, Empty, OUTCOME, OutcomeBadge, PageTitle } from "../ui";

export const metadata: Metadata = { title: "Calls" };

const PAGE = 30;

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ q?: string; outcome?: string; dir?: string; tests?: string; page?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  await closeStaleTestCalls();
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.CallWhereInput = {};
  if (sp.outcome && sp.outcome in OUTCOME) where.outcome = sp.outcome as Prisma.CallWhereInput["outcome"];
  if (sp.dir === "INBOUND" || sp.dir === "OUTBOUND") where.direction = sp.dir;
  if (sp.tests === "hide") where.isTest = false;
  if (sp.q) where.OR = [{ lead: { name: { contains: sp.q, mode: "insensitive" } } }, { lead: { phone: { contains: sp.q, mode: "insensitive" } } }, { summary: { contains: sp.q, mode: "insensitive" } }];
  const [calls, total] = await Promise.all([
    prisma.call.findMany({ where, orderBy: { startedAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE, include: { lead: { select: { name: true, phone: true } } } }),
    prisma.call.count({ where }),
  ]);
  const qs = (p: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), page: String(p) }).toString();

  return (
    <>
      <PageTitle title="Calls" sub="Every call with its transcript, recording, summary and outcome." />
      <form className="glass mb-5 flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98a2b3]" />
          <input name="q" defaultValue={sp.q} placeholder="Search name, number or summary" className="input pl-9" />
        </div>
        <select name="outcome" defaultValue={sp.outcome ?? ""} className="input w-44">
          <option value="">All outcomes</option>
          {Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="dir" defaultValue={sp.dir ?? ""} className="input w-36">
          <option value="">In + out</option><option value="INBOUND">Inbound</option><option value="OUTBOUND">Outbound</option>
        </select>
        <select name="tests" defaultValue={sp.tests ?? ""} className="input w-40">
          <option value="">Include tests</option><option value="hide">Real calls only</option>
        </select>
        <button className="btn btn-ghost">Filter</button>
      </form>
      <Card flush className="overflow-x-auto">
        {calls.length ? (
          <table className="table">
            <thead><tr><th>When</th><th>Customer</th><th>Type</th><th>Language</th><th>Length</th><th>Outcome</th><th>Summary</th></tr></thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} className="hover:bg-paper/60">
                  <td className="whitespace-nowrap"><Link href={`/calls/${c.id}`} className="font-medium underline-offset-4 hover:underline">{formatDateTime(c.startedAt)}</Link></td>
                  <td className="whitespace-nowrap">
                    <span className="flex items-center gap-3">
                      <Avatar name={c.lead?.name ?? "?"} />
                      <span>
                        <span className="block font-semibold">{c.lead?.name ?? "Unknown"}</span>
                        <span className="block text-xs text-muted">{c.lead?.phone ?? c.toNumber ?? c.fromNumber}</span>
                      </span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {c.direction === "OUTBOUND" ? <PhoneOutgoing size={14} className="text-navy-3" /> : <PhoneIncoming size={14} className="text-emerald-600" />}
                      {c.direction === "OUTBOUND" ? "Outbound" : "Inbound"}
                    </span>{" "}
                    {c.isTest && <Badge>test</Badge>}
                  </td>
                  <td>{c.language === "hi" ? "Hindi" : "English"}</td>
                  <td className="tabular-nums">{duration(c.durationSec)}</td>
                  <td><OutcomeBadge outcome={c.outcome} /></td>
                  <td className="min-w-64 max-w-md text-muted"><span className="line-clamp-2">{c.summary ?? "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="p-6"><Empty>No calls match.</Empty></div>}
      </Card>
      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <span>{total} call{total === 1 ? "" : "s"}</span>
        <span className="flex gap-2">
          {page > 1 && <Link className="btn btn-ghost" href={`/calls?${qs(page - 1)}`}>← Newer</Link>}
          {page * PAGE < total && <Link className="btn btn-ghost" href={`/calls?${qs(page + 1)}`}>Older →</Link>}
        </span>
      </div>
    </>
  );
}
