import "server-only";
import { prisma } from "@/lib/db";
import { hit } from "@/lib/rate-limit";

/**
 * The browser test-call API may only touch browser test calls — never a real phone call
 * (those have a Smartflo call id) and never a simulator call.
 */
export async function ownTestCall(callId: number) {
  const call = await prisma.call.findUnique({ where: { id: callId }, select: { isTest: true, providerCallId: true, startedAt: true } });
  return Boolean(call && call.isTest && !call.providerCallId && Date.now() - call.startedAt.getTime() < 6 * 3_600_000);
}

/** Per-user limits so a stuck script cannot flood the database. */
export const testCallLimit = (userId: number, kind: "start" | "turn") =>
  kind === "start" ? hit(`tc-start:${userId}`, 30, 10 * 60_000) : hit(`tc-turn:${userId}`, 400, 10 * 60_000);

/**
 * What a browser test call may see: no AI memory (internal) and only the last 4 digits of a team's
 * hand-over number.
 */
export function forBrowser<T extends { state?: unknown; transfer?: { team: string; number: string } }>(res: T) {
  const { transfer, state, ...rest } = res;
  const visible = { ...((state ?? {}) as Record<string, unknown>) };
  delete visible.ai;
  return { ...rest, state: visible, transfer: transfer ? { team: transfer.team, last4: transfer.number.slice(-4) } : undefined };
}
