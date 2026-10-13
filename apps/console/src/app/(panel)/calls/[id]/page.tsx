import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { dueIn, duration, formatDate, formatDateTime, inr } from "@/lib/util";
import { Badge, Card, LeadBadge, OutcomeBadge, PageTitle, SEGMENT_LABEL } from "../../ui";

export const metadata: Metadata = { title: "Call" };

const TOOL_LABEL: Record<string, string> = {
  estimateSystem: "Sized the system", getPrice: "Looked up price", getSubsidy: "Checked subsidy", searchKnowledge: "Searched knowledge",
  bookSiteVisit: "Booked site visit", escalate: "Escalated to sales", scheduleCallback: "Scheduled callback", markDoNotCall: "Added to Do-Not-Call", saveLead: "Saved lead details",
};

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const call = await prisma.call.findUnique({
    where: { id },
    include: { lead: true, turns: { orderBy: { seq: "asc" } }, escalations: true, visits: true },
  });
  if (!call) notFound();

  return (
    <>
      <PageTitle title={`Call #${call.id}`} sub={`${call.direction === "OUTBOUND" ? "Outbound" : "Inbound"} · ${formatDateTime(call.startedAt)} · ${duration(call.durationSec)}`}>
        <div className="flex items-center gap-2">{call.isTest && <Badge>{call.providerCallId?.startsWith("SIMCALL") ? "simulated call" : "browser test"}</Badge>}<OutcomeBadge outcome={call.outcome} /></div>
      </PageTitle>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <h2 className="mb-4 text-[0.95rem] font-semibold">Transcript</h2>
          <ol className="space-y-3">
            {call.turns.map((t) =>
              t.speaker === "SYSTEM" ? (
                <li key={t.id} className="flex justify-center">
                  {t.tool && TOOL_LABEL[t.tool] ? (
                    <details className="max-w-full text-center">
                      <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 ring-1 ring-orange-600/15"><Sparkles size={12} /> {TOOL_LABEL[t.tool]}</summary>
                      <pre className="mt-2 max-w-full overflow-x-auto rounded-lg bg-paper p-3 text-left text-xs">{JSON.stringify(t.toolData, null, 2)}</pre>
                    </details>
                  ) : <span className="text-xs text-muted">{t.text}</span>}
                </li>
              ) : (
                <li key={t.id} className={t.speaker === "AGENT" ? "flex max-w-[85%] flex-col items-start" : "ml-auto flex max-w-[85%] flex-col items-end"}>
                  <p className={t.speaker === "AGENT" ? "text-xs text-muted" : "text-right text-xs text-muted"}>{t.speaker === "AGENT" ? "Agent" : "Customer"} · {formatDateTime(t.at)}</p>
                  <p lang={t.language ?? undefined} className={t.speaker === "AGENT" ? "neu mt-1 rounded-2xl rounded-tl-md px-4 py-2.5 font-medium leading-relaxed" : "mt-1 rounded-2xl rounded-tr-md bg-[linear-gradient(135deg,#ff9338,#f47b20)] px-4 py-2.5 text-white shadow-[0_6px_14px_-8px_rgb(244_123_32/0.7)]"}>{t.text}</p>
                </li>
              ),
            )}
          </ol>
        </Card>
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold">Summary</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{call.summary ?? "Call still in progress."}</p>
          </Card>
          <Card>
            <h2 className="font-semibold">Recording</h2>
            {call.recordingUrl ? (
              <audio controls preload="none" src={call.recordingUrl} className="mt-3 w-full" />
            ) : (
              <p className="mt-2 text-sm text-muted">{call.isTest ? "Test calls have no recording." : "Tata Smartflo sends the recording link after the call ends."}</p>
            )}
          </Card>
          {call.lead && (
            <Card>
              <div className="flex items-center justify-between"><h2 className="font-semibold">Lead</h2><LeadBadge status={call.lead.status} /></div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted">Name</dt><dd>{call.lead.name ?? "—"}</dd>
                <dt className="text-muted">Mobile</dt><dd>{call.lead.phone}</dd>
                <dt className="text-muted">Type</dt><dd>{call.lead.segment ? SEGMENT_LABEL[call.lead.segment] : "—"}</dd>
                <dt className="text-muted">Bill</dt><dd>{call.lead.monthlyBill ? `${inr(call.lead.monthlyBill)}/month` : "—"}</dd>
                <dt className="text-muted">City</dt><dd>{call.lead.city ?? call.lead.pincode ?? "—"}</dd>
              </dl>
              <Link href={`/leads?q=${call.lead.phone}`} className="mt-3 inline-block text-sm text-accent-ink underline underline-offset-4">Open lead</Link>
            </Card>
          )}
          {(call.visits.length > 0 || call.escalations.length > 0) && (
            <Card>
              <h2 className="font-semibold">Follow-ups</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {call.visits.map((v) => <li key={v.id}>🏠 Site visit: <b>{formatDate(v.date)}</b>, {v.slot.toLowerCase()} <Badge tone="green">{v.status.toLowerCase()}</Badge></li>)}
                {call.escalations.map((e) => { const d = dueIn(e.dueAt); return <li key={e.id}>📞 {e.question} <Badge tone={e.status === "RESOLVED" ? "green" : d.tone}>{e.status === "RESOLVED" ? "resolved" : d.text}</Badge></li>; })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
