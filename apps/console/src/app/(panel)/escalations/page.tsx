import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { SALES } from "@/lib/roles";
import { dueIn, formatDateTime } from "@/lib/util";
import { ActionForm } from "../ActionForm";
import { updateEscalation } from "../actions";
import { Badge, Card, Empty, PageTitle } from "../ui";

export const metadata: Metadata = { title: "Escalations" };

const REASON: Record<string, string> = {
  NOT_IN_KNOWLEDGE: "Agent didn't know", HUMAN_REQUESTED: "Asked for a person", NOT_UNDERSTOOD: "Agent couldn't understand",
  OUT_OF_SCOPE: "Outside agent's scope", NEGOTIATION: "Price negotiation", UPSET: "Customer upset",
};

export default async function EscalationsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireUser();
  const canEdit = SALES.includes(user.role);
  const { show } = await searchParams;
  const [items, users] = await Promise.all([
    prisma.escalation.findMany({
      where: show === "resolved" ? { status: "RESOLVED" } : { status: { not: "RESOLVED" } },
      orderBy: show === "resolved" ? { resolvedAt: "desc" } : { dueAt: "asc" },
      take: 100,
      include: { lead: true, assignedTo: { select: { name: true } } },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageTitle title="Escalations" sub="Questions the agent handed to sales. The customer was promised a call back — the clock shows how long is left.">
        <div className="flex gap-2 text-sm">
          <Link href="/escalations" className={show === "resolved" ? "btn btn-ghost" : "btn"}>Open</Link>
          <Link href="/escalations?show=resolved" className={show === "resolved" ? "btn" : "btn btn-ghost"}>Resolved</Link>
        </div>
      </PageTitle>
      {items.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((e) => {
            const due = dueIn(e.dueAt);
            return (
              <Card key={e.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{e.lead?.name ?? "Caller"} <span className="font-normal text-muted">{e.lead?.phone}</span></p>
                    <p className="text-xs text-muted">{REASON[e.reason] ?? e.reason} · {formatDateTime(e.createdAt)}{e.callId && <> · <Link className="underline" href={`/calls/${e.callId}`}>call #{e.callId}</Link></>}</p>
                  </div>
                  {e.status === "RESOLVED" ? <Badge tone="green">resolved</Badge> : <Badge tone={due.tone}>{due.text}</Badge>}
                </div>
                <blockquote className="mt-3 rounded-lg bg-paper px-3 py-2 text-sm">“{e.question}”</blockquote>
                {canEdit ? (
                  <ActionForm action={updateEscalation} className="mt-3">
                    <input type="hidden" name="id" value={e.id} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select name="status" defaultValue={e.status} className="input"><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select>
                      <select name="assignedToId" defaultValue={e.assignedToId ?? ""} className="input"><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                    </div>
                    <textarea name="resolution" defaultValue={e.resolution ?? ""} rows={2} placeholder="What did you tell the customer?" className="input mt-2" />
                    <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="addToKnowledge" /> Teach the agent this answer (adds it to Knowledge)</label>
                  </ActionForm>
                ) : e.resolution && <p className="mt-3 text-sm"><b>Answer:</b> {e.resolution}</p>}
                {e.assignedTo && <p className="mt-2 text-xs text-muted">Assigned to {e.assignedTo.name}</p>}
              </Card>
            );
          })}
        </div>
      ) : <Empty>{show === "resolved" ? "Nothing resolved yet." : "No open escalations."}</Empty>}
    </>
  );
}
