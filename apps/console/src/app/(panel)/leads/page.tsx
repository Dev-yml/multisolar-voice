import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { FileUp, PencilLine, Search, UserPlus } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { SALES } from "@/lib/roles";
import { formatDateTime, inr } from "@/lib/util";
import { voiceServerConfigured } from "@/lib/voice-server";
import { ActionForm } from "../ActionForm";
import { addLead, callNow, importLeads, updateLead } from "../actions";
import { Avatar, Badge, Card, CardHeader, Empty, LEAD_STATUS, LeadBadge, PageTitle, SEGMENT_LABEL } from "../ui";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireUser();
  const canEdit = SALES.includes(user.role);
  const canCall = canEdit && voiceServerConfigured();
  const sp = await searchParams;
  const where: Prisma.LeadWhereInput = {};
  if (sp.status && sp.status in LEAD_STATUS) where.status = sp.status as Prisma.LeadWhereInput["status"];
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q, mode: "insensitive" } }, { city: { contains: sp.q, mode: "insensitive" } }];
  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { calls: { orderBy: { startedAt: "desc" }, take: 1, select: { id: true, startedAt: true, outcome: true } }, _count: { select: { calls: true } } },
    }),
    prisma.lead.count({ where }),
  ]);

  return (
    <>
      <PageTitle title="Leads" sub="People the agent calls or who called in. Only numbers with consent are called by the auto-dialer." />

      {canEdit && (
        <div className="mb-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader title="Add a lead" sub="One customer at a time" icon={UserPlus} />
            <ActionForm action={addLead} submit="Add lead" resetOnOk>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <input name="name" placeholder="Name" className="input" />
                <input name="phone" placeholder="Mobile (10 digits)" required inputMode="tel" className="input" />
                <input name="city" placeholder="City" className="input" />
                <select name="segment" className="input" defaultValue="">
                  <option value="">Type (optional)</option><option value="RESIDENTIAL">Home</option><option value="COMMERCIAL">Business</option><option value="INDUSTRIAL">Factory</option>
                </select>
                <input name="monthlyBill" placeholder="Monthly bill ₹ (optional)" inputMode="numeric" className="input" />
              </div>
              <label className="mt-3 flex items-start gap-2 text-sm text-ink-2"><input type="checkbox" name="consent" className="mt-0.5" /> Customer agreed to be called (form, missed call or written consent)</label>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title="Import from CSV" sub="Many leads at once — duplicates are skipped" icon={FileUp} />
            <p className="text-xs text-muted">Columns: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.7rem]">name, phone, city, segment, monthly_bill, consent</code></p>
            <ActionForm action={importLeads} submit="Import" className="mt-3">
              <label className="neu-inset flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-4 text-sm text-muted">
                <FileUp size={18} className="text-navy-3" />
                <input type="file" name="file" accept=".csv,text/csv" required className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#eef2f8] file:px-3 file:py-1.5 file:font-bold file:text-navy-3 file:shadow-[3px_3px_8px_rgb(150_165_192/0.5),-3px_-3px_8px_#fff]" />
              </label>
            </ActionForm>
          </Card>
        </div>
      )}

      <Card flush>
        <form className="flex flex-wrap items-center gap-2 border-b border-white/70 p-3 sm:p-4">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98a2b3]" />
            <input name="q" defaultValue={sp.q} placeholder="Search name, number, city" className="input pl-9" />
          </div>
          <select name="status" defaultValue={sp.status ?? ""} className="input w-44">
            <option value="">All statuses</option>
            {Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn btn-ghost">Filter</button>
          <span className="ml-auto rounded-full px-3 py-1 text-sm font-semibold text-muted neu-inset-sm"><span className="digits">{total}</span> lead{total === 1 ? "" : "s"}</span>
        </form>

        {leads.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Lead</th><th>Details</th><th>Activity</th><th>Status</th>{canEdit && <th className="text-right">Actions</th>}</tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const details = [l.segment && SEGMENT_LABEL[l.segment], l.monthlyBill && `${inr(l.monthlyBill)}/mo`, l.city, l.language && (l.language === "hi" ? "Hindi" : "English")].filter(Boolean);
                  return (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap">
                        <span className="flex items-center gap-3">
                          <Avatar name={l.name ?? "?"} />
                          <span>
                            <span className="block font-semibold">{l.name ?? "Unnamed"}</span>
                            <span className="block text-xs tabular-nums text-muted">{l.phone}</span>
                          </span>
                        </span>
                      </td>
                      <td className="min-w-48 text-sm text-ink-2">{details.length ? details.join(" · ") : <span className="text-muted">No details yet</span>}</td>
                      <td className="whitespace-nowrap text-xs text-muted">
                        <span className="block">
                          {l._count.calls} call{l._count.calls === 1 ? "" : "s"}
                          {l.calls[0] && <> · <Link className="font-medium text-navy-3 hover:underline" href={`/calls/${l.calls[0].id}`}>{formatDateTime(l.calls[0].startedAt)}</Link></>}
                        </span>
                        <span className="block">
                          {l.attempts > 0 ? `${l.attempts} dial attempt${l.attempts === 1 ? "" : "s"}` : `source: ${l.source}`}
                          {l.nextCallAt && l.nextCallAt > new Date() && <> · callback {formatDateTime(l.nextCallAt)}</>}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <LeadBadge status={l.status} />
                          {l.consentAt ? <Badge tone="green">consent</Badge> : <Badge tone="amber">no consent</Badge>}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="whitespace-nowrap text-right">
                          <span className="inline-flex items-center justify-end gap-2">
                            {canCall && l.consentAt && l.status !== "DNC" && (
                              <ActionForm action={callNow} submit="Call now" compact>
                                <input type="hidden" name="id" value={l.id} />
                              </ActionForm>
                            )}
                            <details className="relative text-left">
                              <summary className="btn btn-ghost btn-sm cursor-pointer"><PencilLine size={14} /> Edit</summary>
                              <div className="glass-strong absolute right-0 z-20 mt-2 w-80 rounded-2xl p-4">
                                <ActionForm action={updateLead}>
                                  <input type="hidden" name="id" value={l.id} />
                                  <label className="text-xs font-semibold text-muted" htmlFor={`st-${l.id}`}>Status</label>
                                  <select id={`st-${l.id}`} name="status" defaultValue={l.status} className="input mt-1">
                                    {Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                  </select>
                                  <label className="mt-3 block text-xs font-semibold text-muted" htmlFor={`nt-${l.id}`}>Notes</label>
                                  <textarea id={`nt-${l.id}`} name="notes" defaultValue={l.notes ?? ""} rows={3} placeholder="Notes for the sales team" className="input mt-1" />
                                </ActionForm>
                              </div>
                            </details>
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6"><Empty>No leads yet.</Empty></div>
        )}
      </Card>
    </>
  );
}
