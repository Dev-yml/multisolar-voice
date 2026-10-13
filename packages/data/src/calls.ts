import { RuleAgent, initialState, summarizeCall, type CallContext, type CallLang, type CallState, type Direction, type TurnResult } from "@msv/core";
import type { LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { buildTools } from "./agent-tools";

/**
 * One conversation, turn by turn. Used by browser test calls and by the phone
 * Voice Agent server (it sends the caller's words, gets the reply).
 * The conversation state is saved on the Call row between turns.
 */

export async function getSettings() {
  return prisma.agentSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

const LEAD_STATUS: Partial<Record<NonNullable<CallState["outcome"]>, LeadStatus>> = {
  SITE_VISIT_BOOKED: "SITE_VISIT",
  INTERESTED: "INTERESTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  DNC: "DNC",
  WRONG_NUMBER: "LOST",
};

async function contextFor(call: { direction: Direction; leadId: number | null; startedAt: Date }): Promise<CallContext> {
  const [settings, lead] = await Promise.all([
    getSettings(),
    call.leadId ? prisma.lead.findUnique({ where: { id: call.leadId } }) : null,
  ]);
  return {
    direction: call.direction,
    now: new Date(),
    customerName: lead?.name ?? undefined,
    knownLang: (lead?.language as CallLang | null) ?? undefined,
    knownSegment: lead?.segment ?? undefined,
    knownBill: lead?.monthlyBill ?? undefined,
    agentName: settings.agentName,
    escalationHours: settings.escalationHours,
  };
}

async function persist(callId: number, result: TurnResult, customerText: string | null, leadId: number | null) {
  const last = await prisma.callTurn.findFirst({ where: { callId }, orderBy: { seq: "desc" }, select: { seq: true } });
  let seq = (last?.seq ?? 0) + 1;
  const rows: Prisma.CallTurnCreateManyInput[] = [];
  if (customerText !== null) rows.push({ callId, seq: seq++, speaker: "CUSTOMER", text: customerText });
  for (const e of result.events) {
    if (e.type === "tool") rows.push({ callId, seq: seq++, speaker: "SYSTEM", text: e.name, tool: e.name, toolData: JSON.parse(JSON.stringify({ input: e.input, output: e.output })) });
    else if (e.type === "lang") rows.push({ callId, seq: seq++, speaker: "SYSTEM", text: `Language switched ${e.from} → ${e.to}`, tool: "language" });
    else if (e.type === "guard") rows.push({ callId, seq: seq++, speaker: "SYSTEM", text: `Number guard blocked: ${e.blocked}`, tool: "guard" });
  }
  if (result.say.length) rows.push({ callId, seq: seq++, speaker: "AGENT", text: result.say.join(" "), language: result.state.lang });
  await prisma.callTurn.createMany({ data: rows });

  const s = result.state;
  const data: Prisma.CallUpdateInput = { state: s as unknown as Prisma.InputJsonValue, language: s.lang };
  if (result.end || s.ended) {
    const call = await prisma.call.findUniqueOrThrow({ where: { id: callId }, select: { startedAt: true, answeredAt: true, isTest: true } });
    const endedAt = new Date();
    const durationSec = Math.max(1, Math.round((endedAt.getTime() - (call.answeredAt ?? call.startedAt).getTime()) / 1000));
    Object.assign(data, {
      endedAt,
      durationSec,
      costPaise: call.answeredAt && !call.isTest ? estimateCostPaise(durationSec) : undefined,
      outcome: s.outcome ?? "COMPLETED",
      summary: summarizeCall(s),
    });
  }
  await prisma.call.update({ where: { id: callId }, data });

  if (leadId) {
    const status = s.outcome ? LEAD_STATUS[s.outcome] : undefined;
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } });
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        language: s.lang,
        status: status ?? (lead?.status === "NEW" ? "CONTACTED" : undefined),
      },
    });
  }
}

/** Rough running cost of an answered phone minute (Tata + Sarvam + server), in paise. Override with COST_PAISE_PER_MIN. */
export function estimateCostPaise(durationSec: number) {
  const perMin = Number(process.env.COST_PAISE_PER_MIN ?? 200);
  return Math.round((durationSec / 60) * perMin);
}

export async function startCall(input: {
  direction: Direction;
  leadId?: number | null;
  fromNumber?: string;
  toNumber?: string;
  isTest: boolean;
  providerCallId?: string;
  startLanguage?: CallLang;
  customerName?: string;
  /** Phone calls placed by the dialer already have a Call row: continue that one. */
  callId?: number;
  answered?: boolean;
}) {
  let leadId = input.leadId ?? null;
  const call = input.callId
    ? await prisma.call.update({
        where: { id: input.callId },
        data: { answeredAt: input.answered ? new Date() : undefined, providerCallId: input.providerCallId ?? undefined },
      })
    : await prisma.call.create({
        data: {
          direction: input.direction, leadId, fromNumber: input.fromNumber, toNumber: input.toNumber, isTest: input.isTest,
          providerCallId: input.providerCallId, answeredAt: input.answered ? new Date() : undefined,
        },
      });
  leadId = call.leadId;
  const ctx = await contextFor(call);
  if (input.startLanguage && !ctx.knownLang) ctx.knownLang = input.startLanguage;
  ctx.customerName ??= input.customerName || undefined;
  const phone = call.direction === "OUTBOUND" ? call.toNumber : call.fromNumber;
  const agent = new RuleAgent(buildTools({ callId: call.id, leadId, phone, escalationHours: ctx.escalationHours }), ctx);
  const result = await agent.start(initialState(ctx));
  await persist(call.id, result, null, leadId);
  return { callId: call.id, say: result.say, end: result.end, state: result.state, events: result.events };
}

export async function callTurn(callId: number, text: string) {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call) throw new Error("Call not found");
  if (call.endedAt) return { callId, say: [] as string[], end: true, state: call.state as unknown as CallState, events: [] };
  const ctx = await contextFor(call);
  const phone = call.direction === "OUTBOUND" ? call.toNumber : call.fromNumber;
  const agent = new RuleAgent(buildTools({ callId, leadId: call.leadId, phone, escalationHours: ctx.escalationHours }), ctx);
  const result = await agent.reply(call.state as unknown as CallState, text.slice(0, 1000));
  await persist(callId, result, text.slice(0, 1000), call.leadId);
  return { callId, say: result.say, end: result.end, state: result.state, events: result.events };
}

/** Caller hung up (or the tester pressed End). */
export async function endCall(callId: number, reason = "Caller hung up") {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call || call.endedAt) return;
  const s = (call.state as unknown as CallState | null) ?? null;
  const endedAt = new Date();
  const last = await prisma.callTurn.findFirst({ where: { callId }, orderBy: { seq: "desc" }, select: { seq: true } });
  await prisma.callTurn.create({ data: { callId, seq: (last?.seq ?? 0) + 1, speaker: "SYSTEM", text: reason } });
  await prisma.call.update({
    where: { id: callId },
    data: {
      endedAt,
      durationSec: call.answeredAt || call.isTest ? Math.max(1, Math.round((endedAt.getTime() - (call.answeredAt ?? call.startedAt).getTime()) / 1000)) : 0,
      costPaise: call.answeredAt && !call.isTest ? estimateCostPaise(Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000)) : undefined,
      outcome: s?.outcome ?? (s?.escalationIds?.length ? "ESCALATED" : call.answeredAt || (s && s.turns > 1) ? "COMPLETED" : "NO_ANSWER"),
      summary: s ? summarizeCall(s) : reason,
    },
  });
}

/** Browser tests the tester walked away from (tab closed mid-call) are closed after 15 minutes. */
export async function closeStaleTestCalls() {
  const stale = await prisma.call.findMany({
    where: { isTest: true, endedAt: null, startedAt: { lt: new Date(Date.now() - 15 * 60_000) } },
    select: { id: true },
    take: 50,
  });
  for (const c of stale) await endCall(c.id, "Test call left open — closed automatically");
}
