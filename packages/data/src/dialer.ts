import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./calls";

/**
 * Who the auto-dialer may call, right now. Rules (all must hold):
 *  - outbound calling is switched on in Agent settings, inside calling hours (IST), under the monthly budget
 *  - the lead gave consent, is not on the Do-Not-Call list, and is still open (new / contacted / interested)
 *  - either a callback is due (nextCallAt passed), or — if they never picked up — attempts are left
 *    and the retry gap has passed
 *  - the lead has no call in progress
 */

const OPEN_STATUSES = ["NEW", "CONTACTED", "INTERESTED"] as const;

export function istMinutes(now = new Date()) {
  const t = new Date(now.getTime() + 330 * 60_000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export async function dialerStatus(now = new Date(), opts: { ignoreHours?: boolean } = {}) {
  const s = await getSettings();
  const mins = istMinutes(now);
  const inHours = opts.ignoreHours || (mins >= toMin(s.callingStart) && mins < toMin(s.callingEnd));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [spent, active] = await Promise.all([
    prisma.call.aggregate({ where: { startedAt: { gte: monthStart }, isTest: false }, _sum: { costPaise: true } }),
    prisma.call.count({ where: { direction: "OUTBOUND", endedAt: null, startedAt: { gte: new Date(now.getTime() - 20 * 60_000) } } }),
  ]);
  const spentRupees = (spent._sum.costPaise ?? 0) / 100;
  const underBudget = spentRupees < s.monthlyBudget;
  return {
    enabled: s.outboundEnabled,
    inHours,
    underBudget,
    spentRupees,
    active,
    freeSlots: Math.max(0, s.maxConcurrent - active),
    canDial: s.outboundEnabled && inHours && underBudget,
    settings: s,
  };
}

export async function dueLeads(limit: number, now = new Date(), opts: { retryGapMs?: number; source?: string } = {}) {
  if (limit <= 0) return [];
  const s = await getSettings();
  const gapAgo = new Date(now.getTime() - (opts.retryGapMs ?? s.retryGapMinutes * 60_000));
  const where: Prisma.LeadWhereInput = {
    ...(opts.source ? { source: opts.source } : {}),
    consentAt: { not: null },
    status: { in: [...OPEN_STATUSES] },
    calls: { none: { endedAt: null, startedAt: { gte: new Date(now.getTime() - 20 * 60_000) } } },
    OR: [
      // A callback the customer asked for.
      { nextCallAt: { lte: now } },
      // Retries only while the customer has never picked up — once they have talked to the agent,
      // the agent never calls again on its own (only for a booked callback).
      {
        nextCallAt: null,
        attempts: { lt: s.maxAttempts },
        OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: gapAgo } }],
        NOT: { calls: { some: { answeredAt: { not: null } } } },
      },
    ],
  };
  const leads = await prisma.lead.findMany({ where, orderBy: [{ nextCallAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], take: limit * 3 });
  if (!leads.length) return [];
  const dnc = new Set((await prisma.doNotCall.findMany({ where: { phone: { in: leads.map((l) => l.phone) } }, select: { phone: true } })).map((d) => d.phone));
  return leads.filter((l) => !dnc.has(l.phone)).slice(0, limit);
}

/** Create the Call row and count the attempt, before asking the phone line to dial. */
export async function beginDial(lead: { id: number; phone: string }, opts: { isTest?: boolean } = {}) {
  const [call] = await prisma.$transaction([
    prisma.call.create({ data: { direction: "OUTBOUND", leadId: lead.id, toNumber: lead.phone, isTest: Boolean(opts.isTest) } }),
    prisma.lead.update({ where: { id: lead.id }, data: { attempts: { increment: 1 }, lastAttemptAt: new Date(), nextCallAt: null } }),
  ]);
  return call;
}

async function closeCall(callId: number, outcome: "NO_ANSWER" | "BUSY" | "FAILED", note: string) {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call || call.endedAt) return;
  const last = await prisma.callTurn.findFirst({ where: { callId }, orderBy: { seq: "desc" }, select: { seq: true } });
  await prisma.$transaction([
    prisma.callTurn.create({ data: { callId, seq: (last?.seq ?? 0) + 1, speaker: "SYSTEM", text: note } }),
    prisma.call.update({ where: { id: callId }, data: { endedAt: new Date(), durationSec: 0, outcome, summary: note } }),
  ]);
}

export async function dialFailed(callId: number, reason: string) {
  await closeCall(callId, "FAILED", `Could not place the call: ${reason}`);
}

export async function setProviderRef(callId: number, refId: string) {
  await prisma.call.update({ where: { id: callId }, data: { providerRefId: refId } });
}

/** Calls that never connected to the agent within `seconds` count as not answered. */
export async function closeUnanswered(seconds = 90) {
  const stale = await prisma.call.findMany({
    where: { direction: "OUTBOUND", endedAt: null, answeredAt: null, turns: { none: {} }, startedAt: { lt: new Date(Date.now() - seconds * 1000) } },
    select: { id: true },
    take: 50,
  });
  for (const c of stale) await closeCall(c.id, "NO_ANSWER", "Customer did not answer");
  return stale.length;
}

export type WebhookInfo = {
  refId?: string;
  callId?: string;
  ourCallId?: number;
  status?: string;
  recordingUrl?: string;
  durationSec?: number;
  hangupCause?: string;
};

/** A Smartflo webhook arrived: attach the recording, and close calls that were never answered. */
export async function applyCallWebhook(w: WebhookInfo) {
  const or: Prisma.CallWhereInput[] = [];
  if (w.ourCallId) or.push({ id: w.ourCallId });
  if (w.refId) or.push({ providerRefId: w.refId });
  if (w.callId) or.push({ providerCallId: w.callId });
  if (!or.length) return null;
  const call = await prisma.call.findFirst({ where: { OR: or }, orderBy: { startedAt: "desc" } });
  if (!call) return null;
  const data: Prisma.CallUpdateInput = {};
  if (w.recordingUrl && /^https:\/\//.test(w.recordingUrl)) data.recordingUrl = w.recordingUrl.slice(0, 500);
  if (w.callId && !call.providerCallId) data.providerCallId = w.callId;
  if (Object.keys(data).length) await prisma.call.update({ where: { id: call.id }, data });
  const missed = /miss|no.?answer|busy|fail|cancel/i.test(w.status ?? "") || /busy/i.test(w.hangupCause ?? "");
  if (missed && !call.answeredAt && !call.endedAt) {
    await closeCall(call.id, /busy/i.test(`${w.status} ${w.hangupCause}`) ? "BUSY" : "NO_ANSWER", `Not answered (${w.status ?? "missed"})`);
  }
  return call.id;
}
