import { priceFor, sizeFromBill, subsidyFor, type Segment, type Slots, type Tools } from "@msv/core";
import { prisma } from "./db";
import { searchKnowledge } from "./knowledge";

/**
 * The agent's tools, backed by the Voice Console database. Every number the
 * agent speaks comes from these tables, which the team edits in the Console.
 */
export async function loadPricing() {
  const [sizing, prices, rules] = await Promise.all([
    prisma.sizingRow.findMany({ orderBy: { kw: "asc" } }),
    prisma.priceRow.findMany(),
    prisma.subsidyRule.findMany({ where: { active: true } }),
  ]);
  return {
    sizing,
    prices: prices.map((p) => ({ segment: p.segment as Segment, kw: p.kw, priceMin: p.priceMin, priceMax: p.priceMax, includesGst: p.includesGst, sample: p.sample })),
    rules: rules.map((r) => ({ ...r, scope: r.scope as "CENTRAL" | "STATE", segment: r.segment as Segment })),
  };
}

const SLOT_START: Record<string, [number, number]> = { MORNING: [10, 30], AFTERNOON: [14, 30], EVENING: [17, 30] };

/** "2026-10-10" + EVENING → 17:30 IST that day, as a Date. */
export function callbackTime(dateISO: string, slot?: string | null): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [h, mi] = (slot && SLOT_START[slot]) || [11, 0];
  return new Date(Date.UTC(y, m - 1, d, h, mi) - 330 * 60_000);
}

export function buildTools(ctx: { callId: number; leadId: number | null; phone?: string | null; escalationHours: number }): Tools {
  return {
    async estimateSystem({ monthlyBill }) {
      const { sizing } = await loadPricing();
      return sizeFromBill(sizing, monthlyBill, "Multi Solar published size guide");
    },
    async getPrice({ kw, segment }) {
      const { prices } = await loadPricing();
      return priceFor(prices, kw, segment);
    },
    async getSubsidy({ kw, segment, city }) {
      const { rules } = await loadPricing();
      return subsidyFor(rules, kw, segment, city);
    },
    searchKnowledge: (q) => searchKnowledge(q),
    async bookSiteVisit({ dateISO, slot, label }) {
      await prisma.siteVisit.create({ data: { leadId: ctx.leadId, callId: ctx.callId, date: new Date(`${dateISO}T00:00:00Z`), slot, label } });
      if (ctx.leadId) await prisma.lead.update({ where: { id: ctx.leadId }, data: { status: "SITE_VISIT" } });
      return { ok: true };
    },
    async escalate({ reason, question }) {
      const e = await prisma.escalation.create({
        data: { callId: ctx.callId, leadId: ctx.leadId, reason, question, dueAt: new Date(Date.now() + ctx.escalationHours * 3_600_000) },
      });
      return { id: e.id, dueHours: ctx.escalationHours };
    },
    async scheduleCallback({ dateISO, slot, label }) {
      await prisma.callback.create({ data: { leadId: ctx.leadId, callId: ctx.callId, date: new Date(`${dateISO}T00:00:00Z`), slot, label } });
      // The dialer calls back at the start of that slot (IST) — a callback starts a fresh set of attempts.
      if (ctx.leadId) await prisma.lead.update({ where: { id: ctx.leadId }, data: { nextCallAt: callbackTime(dateISO, slot), attempts: 0 } });
    },
    async markDoNotCall() {
      if (ctx.phone) await prisma.doNotCall.upsert({ where: { phone: ctx.phone }, update: {}, create: { phone: ctx.phone } });
      if (ctx.leadId) await prisma.lead.update({ where: { id: ctx.leadId }, data: { status: "DNC" } });
    },
    async saveLead(slots: Slots) {
      if (!ctx.leadId) return;
      await prisma.lead.update({
        where: { id: ctx.leadId },
        data: {
          segment: slots.segment,
          monthlyBill: slots.monthlyBill,
          city: slots.city?.slice(0, 80),
          pincode: slots.pincode,
          name: slots.name ?? undefined,
        },
      });
    },
  };
}
