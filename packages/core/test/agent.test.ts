import { describe, expect, it } from "vitest";
import { initialState, RuleAgent, summarizeCall, type CallContext, type CallState } from "../src";
import { fakeTools } from "./fakes";

// Wednesday 8 Oct 2026, 18:15 IST → "Good evening"
const NOW = new Date("2026-10-08T12:45:00Z");

function setup(over: Partial<CallContext> = {}) {
  const { tools, log } = fakeTools();
  const ctx: CallContext = { direction: "OUTBOUND", now: NOW, customerName: "Vinay", agentName: "Multi Solar Voice Agent", escalationHours: 48, ...over };
  const agent = new RuleAgent(tools, ctx);
  let state: CallState = initialState(ctx);
  const turns: string[][] = [];
  return {
    log,
    get state() { return state; },
    async start() { const r = await agent.start(state); state = r.state; turns.push(r.say); return r; },
    async say(text: string) { const r = await agent.reply(state, text); state = r.state; turns.push(r.say); return r; },
  };
}

describe("outbound call to Vinay (the example in the plan)", () => {
  it("greets in English, switches to Hindi, quotes from tools, books a survey, escalates batteries", async () => {
    const c = setup();
    const g = await c.start();
    expect(g.say[0]).toBe("Good evening, Vinay!");
    expect(g.say.join(" ")).toMatch(/AI assistant/);
    expect(g.say.join(" ")).toMatch(/recorded/);

    const r1 = await c.say("Haan ji, boliye");
    expect(c.state.lang).toBe("hi");
    expect(r1.say[0]).toBe("जी, मैं हिंदी में बात करती हूँ।");
    expect(r1.say.at(-1)).toMatch(/घर के लिए/); // asks home / shop / factory

    await c.say("ghar ke liye");
    expect(c.state.stage).toBe("BILL");

    await c.say("teen-saade teen hazaar");
    expect(c.state.lang).toBe("hi"); // Hindi numbers in Latin script must not switch to English
    expect(c.state.slots.monthlyBill).toBe(3500);

    const quote = await c.say("Gurgaon");
    const text = quote.say.join(" ");
    expect(text).toMatch(/3 किलोवाट/);
    expect(text).toMatch(/₹1.5 लाख से ₹1.8 लाख/);
    expect(text).toMatch(/₹78,000/);
    expect(c.state.stage).toBe("OFFER_VISIT");
    expect(c.log.map((l) => l.name)).toEqual(expect.arrayContaining(["saveLead", "estimateSystem", "getPrice", "getSubsidy"]));

    const booked = await c.say("haan, kal shaam");
    expect(booked.say[0]).toMatch(/कल शाम/);
    expect(c.state.slots.visit?.dateISO).toBe("2026-10-09");
    expect(c.state.slots.visit?.slot).toBe("EVENING");

    const esc = await c.say("Battery backup bhi milega kya?");
    expect(esc.say[0]).toMatch(/48 घंटे/);
    expect(c.state.escalationIds).toHaveLength(1);

    const end = await c.say("nahi bas, dhanyavaad");
    expect(end.end).toBe(true);
    expect(c.state.outcome).toBe("SITE_VISIT_BOOKED");
    const summary = summarizeCall(c.state);
    expect(summary).toMatch(/Spoke Hindi \(switched from English\)/);
    expect(summary).toMatch(/Site survey booked/);
    expect(summary).toMatch(/Escalated/);
  });
});

describe("outbound edge cases", () => {
  it("do-not-call request ends the call and marks the number", async () => {
    const c = setup();
    await c.start();
    const r = await c.say("please don't call me again");
    expect(r.end).toBe(true);
    expect(c.state.outcome).toBe("DNC");
    expect(c.log.some((l) => l.name === "markDoNotCall")).toBe(true);
  });
  it("busy caller gets a callback at the time they give", async () => {
    const c = setup();
    await c.start();
    const r = await c.say("abhi busy hoon, kal subah call karna");
    expect(r.end).toBe(true);
    expect(c.state.outcome).toBe("CALLBACK");
    expect(c.state.slots.callback?.label).toBe("कल सुबह");
  });
  it("not interested ends politely", async () => {
    const c = setup();
    await c.start();
    const r = await c.say("No, I'm not interested");
    expect(r.end).toBe(true);
    expect(c.state.outcome).toBe("NOT_INTERESTED");
  });
  it("asking for a person creates a ticket", async () => {
    const c = setup();
    await c.start();
    const r = await c.say("Can I talk to a real person please");
    expect(r.say[0]).toMatch(/48 hours/);
    expect(c.state.escalationIds).toHaveLength(1);
  });
  it("negotiation is never answered by the agent", async () => {
    const c = setup({ knownSegment: "RESIDENTIAL", knownBill: 3000 });
    await c.start();
    await c.say("yes");
    await c.say("Delhi");
    const r = await c.say("can you give some discount?");
    expect(r.say.join(" ")).toMatch(/can't change prices/);
    expect(c.log.filter((l) => l.name === "escalate")).toHaveLength(1);
  });
});

describe("inbound call", () => {
  it("unknown caller picks Hindi, gets a business answer without a price", async () => {
    const c = setup({ direction: "INBOUND", customerName: undefined });
    const g = await c.start();
    expect(g.say.join(" ")).toMatch(/Hindi or English/);
    const r1 = await c.say("Hindi");
    expect(c.state.lang).toBe("hi");
    expect(r1.say.join(" ")).toMatch(/घर के लिए/);
    await c.say("meri factory ke liye");
    await c.say("pachas hazaar");
    const q = await c.say("Ludhiana");
    expect(q.say.join(" ")).toMatch(/फैक्ट्री के लिए हमारे इंजीनियर/);
    expect(c.log.some((l) => l.name === "getPrice")).toBe(false);
  });
  it("answers from the knowledge base in English and stays in English", async () => {
    const c = setup({ direction: "INBOUND", customerName: undefined });
    await c.start();
    await c.say("English");
    const r = await c.say("What warranty do you give on the modules?");
    expect(c.state.lang).toBe("en");
    expect(r.say.join(" ")).toMatch(/performance warranty/);
  });
  it("speaks only the answer part of an FAQ passage", async () => {
    const c = setup({ direction: "INBOUND", customerName: undefined });
    await c.start();
    await c.say("English");
    const r = await c.say("Do you provide installation or only panels?");
    expect(r.say[0]).toMatch(/^Both\. We manufacture/);
    expect(r.say.join(" ")).not.toMatch(/Q:|A:/);
  });
});

describe("location", () => {
  it("does not take a segment or a bill as the city", async () => {
    const c = setup({ knownSegment: "RESIDENTIAL", knownBill: 3000 });
    await c.start();
    await c.say("haan bataiye");
    expect(c.state.stage).toBe("LOCATION");
    await c.say("meri factory ke liye");
    expect(c.state.slots.city).toBeUndefined();
    expect(c.state.slots.segment).toBe("INDUSTRIAL");
    expect(c.state.stage).toBe("LOCATION");
    await c.say("Ludhiana");
    expect(c.state.slots.city).toBe("Ludhiana");
  });
});

describe("greeting", () => {
  it("says good evening after midnight, not good morning", async () => {
    const c = setup({ now: new Date("2026-10-07T18:46:00Z") }); // 00:16 IST
    expect((await c.start()).say[0]).toBe("Good evening, Vinay!");
  });
});

describe("safety", () => {
  it("every number spoken in a full call comes from a tool or the caller", async () => {
    const c = setup();
    const all: string[] = [];
    all.push(...(await c.start()).say);
    for (const t of ["yes", "home", "6000", "Noida", "yes tomorrow morning", "subsidy kitni milegi", "no thanks"]) {
      const r = await c.say(t);
      expect(r.events.filter((e) => e.type === "guard")).toEqual([]);
      all.push(...r.say);
    }
    expect(all.join(" ")).toMatch(/5 kW/);
  });
});
