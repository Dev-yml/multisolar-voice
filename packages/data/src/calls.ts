import { RuleAgent, TEAMS, initialState, summarizeCall, type CallContext, type CallLang, type CallState, type Direction, type Outcome, type Team, type TurnResult } from "@msv/core";
import type { AgentSettings, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { buildTools } from "./agent-tools";
import { ClaudeAgent, claudeAvailable, type ClaudeConfig, type SayFn } from "./claude-agent";

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

// ---------------------------------------------------------------- hand-over to people (keypad 1 / 2 / 3)

/** Keypad 1 = Sales (the "transfer number"), 2 = Sales Head, 3 = Customer care (CRM). */
export function teamNumber(s: AgentSettings, team: Team): string | null {
  return team === "SALES" ? s.transferNumber : team === "SALES_HEAD" ? s.salesHeadNumber : s.crmNumber;
}
export const teamsWithLine = (s: AgentSettings): Team[] => TEAMS.filter((t) => Boolean(teamNumber(s, t)));
export const TEAM_LABEL: Record<Team, Record<CallLang, string>> = {
  SALES: { en: "sales team", hi: "सेल्स टीम" },
  SALES_HEAD: { en: "sales head", hi: "सेल्स हेड" },
  CRM: { en: "customer care team", hi: "कस्टमर केयर टीम" },
};
const KEY_TEAM: Record<string, Team> = { "1": "SALES", "2": "SALES_HEAD", "3": "CRM" };

/** What the phone side needs besides the words: keypad menu, call length, and a hand-over to make. */
function callInfo(settings: AgentSettings, state: CallState) {
  const team = state.transfer?.team;
  const number = team ? teamNumber(settings, team) : null;
  return {
    brain: state.brain ?? "rules",
    menu: settings.keypadMenu ? teamsWithLine(settings) : [],
    maxCallSeconds: settings.maxCallSeconds,
    transfer: team && number ? { team, number } : undefined,
  };
}

const STRONGER: Outcome[] = ["DNC", "SITE_VISIT_BOOKED", "CALLBACK"];

/** Record the hand-over so the team sees it (and can follow up if the connecting call is missed). */
async function recordHandOver(call: { id: number; leadId: number | null }, s: CallState, team: Team, how: string, escalationHours: number) {
  const e = await prisma.escalation.create({
    data: {
      callId: call.id,
      leadId: call.leadId,
      reason: "TRANSFER",
      question: `Caller asked for the ${TEAM_LABEL[team].en} (${how}). The phone system connects them — please follow up if the call was missed.`,
      dueAt: new Date(Date.now() + Math.min(escalationHours, 2) * 3_600_000),
    },
  });
  s.escalationIds.push(e.id);
  if (!s.outcome || !STRONGER.includes(s.outcome)) s.outcome = "ESCALATED";
  s.notes.push(`Handed to the ${TEAM_LABEL[team].en} (${how}).`);
}

function claudeConfig(settings: AgentSettings, ctx: CallContext, call: { direction: Direction; startedAt: Date; answeredAt: Date | null }): ClaudeConfig {
  return {
    model: settings.claudeModel,
    agentName: settings.agentName,
    voice: settings.voice === "male" ? "male" : "female",
    direction: call.direction,
    customerName: ctx.customerName,
    teams: teamsWithLine(settings),
    escalationHours: settings.escalationHours,
    maxCallSeconds: settings.maxCallSeconds,
    startedAt: call.answeredAt ?? call.startedAt,
  };
}

async function contextFor(call: { direction: Direction; leadId: number | null; startedAt: Date }): Promise<{ ctx: CallContext; settings: AgentSettings }> {
  const [settings, lead] = await Promise.all([
    getSettings(),
    call.leadId ? prisma.lead.findUnique({ where: { id: call.leadId } }) : null,
  ]);
  const ctx: CallContext = {
    direction: call.direction,
    now: new Date(),
    customerName: lead?.name ?? undefined,
    knownLang: (lead?.language as CallLang | null) ?? undefined,
    knownSegment: lead?.segment ?? undefined,
    knownBill: lead?.monthlyBill ?? undefined,
    agentName: settings.agentName,
    escalationHours: settings.escalationHours,
  };
  return { ctx, settings };
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

/**
 * Rough running cost of an answered phone minute, in paise: Tata Voice Streaming ₹5 + Sarvam ≈ ₹1.34
 * + Claude ≈ ₹0.95 (see the cost sheet). Used for the monthly budget. Override with COST_PAISE_PER_MIN.
 */
export function estimateCostPaise(durationSec: number) {
  const perMin = Number(process.env.COST_PAISE_PER_MIN ?? 730);
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
  const { ctx, settings } = await contextFor(call);
  if (input.startLanguage && !ctx.knownLang) ctx.knownLang = input.startLanguage;
  ctx.customerName ??= input.customerName || undefined;
  const phone = call.direction === "OUTBOUND" ? call.toNumber : call.fromNumber;
  const tools = buildTools({ callId: call.id, leadId, phone, escalationHours: ctx.escalationHours });
  let result: TurnResult;
  if (settings.brain === "claude" && claudeAvailable()) {
    result = new ClaudeAgent(tools, claudeConfig(settings, ctx, call)).start(initialState(ctx));
  } else {
    result = await new RuleAgent(tools, ctx).start(initialState(ctx));
    result.state.brain = "rules";
  }
  await persist(call.id, result, null, leadId);
  return { callId: call.id, say: result.say, end: result.end, state: result.state, events: result.events, spoken: false, ...callInfo(settings, result.state) };
}

/**
 * The caller said `text`. With `onSay`, the AI brain hands over each sentence as soon as it is ready
 * (the phone starts speaking before the whole reply is written); `spoken` then tells the caller not to
 * speak `say` again.
 */
export async function callTurn(callId: number, text: string, opts: { onSay?: SayFn } = {}) {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call) throw new Error("Call not found");
  if (call.endedAt) return { callId, say: [] as string[], end: true, state: call.state as unknown as CallState, events: [], spoken: false, menu: [] as Team[], maxCallSeconds: 0, brain: "rules" as const, transfer: undefined };
  const { ctx, settings } = await contextFor(call);
  const phone = call.direction === "OUTBOUND" ? call.toNumber : call.fromNumber;
  const tools = buildTools({ callId, leadId: call.leadId, phone, escalationHours: ctx.escalationHours });
  const state = call.state as unknown as CallState;
  const said = text.slice(0, 1000);
  let result: TurnResult;
  let spoken = false;
  if (state.brain === "claude" && claudeAvailable()) {
    result = await new ClaudeAgent(tools, claudeConfig(settings, ctx, call)).reply(state, said, opts.onSay);
    spoken = Boolean(opts.onSay);
  } else {
    result = await new RuleAgent(tools, ctx).reply(state, said);
  }
  if (result.state.transfer && !state.transfer) await recordHandOver(call, result.state, result.state.transfer.team, "asked the AI assistant", settings.escalationHours);
  await persist(callId, result, said, call.leadId);
  return { callId, say: result.say, end: result.end, state: result.state, events: result.events, spoken, ...callInfo(settings, result.state) };
}

/** The caller pressed a key: 1 = Sales, 2 = Sales Head, 3 = Customer care. Other keys are ignored (null). */
export async function pressKey(callId: number, digit: string) {
  const team = KEY_TEAM[digit];
  if (!team) return null;
  const call = await prisma.call.findUnique({ where: { id: callId } });
  // The keypad menu is offered right after the agent's goodbye, so a key up to 90 s after the end still counts.
  if (!call || !call.state || (call.endedAt && Date.now() - call.endedAt.getTime() > 90_000)) return null;
  if ((call.state as unknown as CallState).transfer) return null;
  const { settings } = await contextFor(call);
  const s = structuredClone(call.state as unknown as CallState);
  const lang = s.lang;
  const label = TEAM_LABEL[team][lang];
  const she = settings.voice !== "male";
  let say: string;
  if (teamNumber(settings, team)) {
    s.transfer = { team };
    await recordHandOver(call, s, team, `pressed ${digit}`, settings.escalationHours);
    say = lang === "hi"
      ? `ज़रूर! मैं आपको हमारी ${label} से जोड़ ${she ? "रही" : "रहा"} हूँ। एक मिनट में उनकी कॉल आएगी, कृपया उठा लीजिए। धन्यवाद!`
      : `Sure! I'm connecting you with our ${label}. You'll get a call from them in a minute — please pick it up. Thank you!`;
  } else {
    const phone = call.direction === "OUTBOUND" ? call.toNumber : call.fromNumber;
    const esc = await buildTools({ callId, leadId: call.leadId, phone, escalationHours: settings.escalationHours })
      .escalate({ reason: "HUMAN_REQUESTED", question: `Caller pressed ${digit} for the ${TEAM_LABEL[team].en}, but no number is set for it.` });
    s.escalationIds.push(esc.id);
    if (!s.outcome || !STRONGER.includes(s.outcome)) s.outcome = "ESCALATED";
    say = lang === "hi"
      ? `${label} की लाइन अभी उपलब्ध नहीं है। हमारी टीम ${settings.escalationHours} घंटे के अंदर आपको कॉल करेगी। धन्यवाद!`
      : `Our ${label} line isn't available right now. The team will call you within ${settings.escalationHours} hours. Thank you!`;
  }
  s.ended = true;
  s.stage = "ENDED";
  const result: TurnResult = { say: [say], events: [], state: s, end: true };
  await persist(callId, result, `[pressed ${digit}]`, call.leadId);
  return { callId, say: [say], end: true, state: s, events: [], spoken: false, ...callInfo(settings, s) };
}

/** Caller hung up (or the tester pressed End). */
export async function endCall(callId: number, reason = "Caller hung up") {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call || call.endedAt) return;
  const s = (call.state as unknown as CallState | null) ?? null;
  const endedAt = new Date();
  // Picked up and hung up before saying anything: counts as not reached, so the dialer tries again later.
  const talkSec = call.answeredAt ? Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000) : 0;
  const quickHangUp =
    call.direction === "OUTBOUND" && !call.isTest && Boolean(call.answeredAt) && talkSec < 20 &&
    (await prisma.callTurn.count({ where: { callId, speaker: "CUSTOMER" } })) === 0;
  if (quickHangUp) reason = "Picked up and hung up straight away — the dialer will try again later";
  const last = await prisma.callTurn.findFirst({ where: { callId }, orderBy: { seq: "desc" }, select: { seq: true } });
  await prisma.callTurn.create({ data: { callId, seq: (last?.seq ?? 0) + 1, speaker: "SYSTEM", text: reason } });
  await prisma.call.update({
    where: { id: callId },
    data: {
      endedAt,
      durationSec: call.answeredAt || call.isTest ? Math.max(1, Math.round((endedAt.getTime() - (call.answeredAt ?? call.startedAt).getTime()) / 1000)) : 0,
      costPaise: call.answeredAt && !call.isTest ? estimateCostPaise(Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000)) : undefined,
      outcome: quickHangUp ? "NO_ANSWER" : s?.outcome ?? (s?.escalationIds?.length ? "ESCALATED" : call.answeredAt || (s && s.turns > 1) ? "COMPLETED" : "NO_ANSWER"),
      summary: quickHangUp ? reason : s ? summarizeCall(s) : reason,
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
