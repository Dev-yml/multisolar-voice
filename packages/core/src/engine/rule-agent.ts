import { detectLanguage } from "../language";
import { formatINR } from "../pricing";
import type { CallContext, CallLang, CallState, DaySlot, EngineEvent, EscalationReason, Stage, Tools, TurnResult } from "../types";
import { lakhForms, NumberAllowlist } from "./guard";
import { DAY_LABEL, dayPart, MESSAGES, SLOT_LABEL } from "./messages";
import {
  detectDayOffset,
  detectLanguageChoice,
  detectSegment,
  detectSlot,
  isBusy,
  isNo,
  isUpset,
  isYes,
  notInterested,
  parseAmount,
  parsePincode,
  topicOf,
  wantsHuman,
  wantsNoCalls,
  wantsRepeat,
  wrongNumber,
} from "./nlu";

/**
 * Rule-based Multi Solar Voice Agent. Runs without any AI key: it follows the
 * approved call flow, understands English, Hindi and Hinglish answers, uses
 * the tools for every number, and hands anything it cannot answer to the
 * sales team. The LLM brain (Claude) will replace the wording, not the rules.
 *
 * Stateless: every turn takes the saved CallState and returns the new one,
 * so a call can be stored in the database between turns.
 */

type Flags = { quoted?: boolean; billSkipped?: boolean; locationSkipped?: boolean; visitDeclined?: boolean; pendingDay?: number; pendingSlot?: DaySlot };
type State = CallState & { flags?: Flags };

const TZ = "Asia/Kolkata";
const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_HI = ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"];
const DONE_WORDS = /\b(no|nothing|that'?s all|thanks?|thank you|bas|kuch nahi|dhanyavaad|dhanyawad|shukriya)\b|नहीं|कुछ नहीं|बस|धन्यवाद|शुक्रिया/i;
const DONT_KNOW = /pata nahi|pata nahin|maloom nahi|don'?t know|not sure|idea nahi|नहीं पता|पता नहीं|मालूम नहीं/i;
const ASK_QUESTION = { en: "Sure, what would you like to know?", hi: "जी, बताइए क्या जानना चाहेंगे?" } as const;
const EN_MARKERS = new Set(
  // Words that are also common in Hinglish ("me", "to", "do", "in") are left out.
  "the is are am my i i'm we you your can could would will what how which why when where please want need about have has it this that for with and of does tell our".split(" "),
);

function istDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), weekday };
}

function dateAfter(now: Date, offset: number) {
  const { y, m, d, weekday } = istDate(now);
  const dt = new Date(Date.UTC(y, m - 1, d + offset));
  return { iso: dt.toISOString().slice(0, 10), weekday: (weekday + offset) % 7 };
}

function firstSentences(text: string, max = 2, maxChars = 260): string {
  // FAQ passages are stored as "Q: … A: …" — speak only the answer.
  text = text.replace(/^\s*Q:[\s\S]*?\bA:\s*/, "");
  const parts = text.replace(/\s+/g, " ").match(/[^.!?।]+[.!?।]+/g) ?? [text];
  let out = "";
  for (const p of parts.slice(0, max)) {
    if ((out + p).length > maxChars && out) break;
    out += p.trim() + " ";
  }
  return out.trim() || text.slice(0, maxChars);
}

export function initialState(ctx: CallContext): State {
  const lang: CallLang = ctx.knownLang ?? "en";
  return {
    direction: ctx.direction,
    lang,
    startLang: lang,
    stage: ctx.direction === "OUTBOUND" ? "CONSENT" : "LANGUAGE",
    slots: { name: ctx.customerName, segment: ctx.knownSegment, monthlyBill: ctx.knownBill },
    misunderstood: 0,
    escalationIds: [],
    ended: false,
    turns: 0,
    lastSaid: [],
    notes: [],
    flags: {},
  };
}

export class RuleAgent {
  constructor(private tools: Tools, private ctx: CallContext) {}

  private out: string[] = [];
  private events: EngineEvent[] = [];
  private allow = new NumberAllowlist();

  private get m() {
    return MESSAGES[this.s.lang];
  }
  private s!: State;

  private begin(state: CallState) {
    this.s = structuredClone(state) as State;
    this.s.flags ??= {};
    this.out = [];
    this.events = [];
    this.allow = new NumberAllowlist([2, this.ctx.escalationHours]);
    if (this.s.slots.monthlyBill) this.allow.add(...lakhForms(this.s.slots.monthlyBill));
  }

  private say(...lines: string[]) {
    this.out.push(...lines.filter(Boolean));
  }

  private setStage(to: Stage) {
    if (to !== this.s.stage) this.events.push({ type: "stage", from: this.s.stage, to });
    if (to !== this.s.stage) this.s.misunderstood = 0;
    this.s.stage = to;
  }

  private async tool<T>(name: string, input: unknown, run: () => Promise<T>): Promise<T> {
    const output = await run();
    this.events.push({ type: "tool", name, input, output });
    this.allow.addFrom(output);
    return output;
  }

  private finish(end = false): TurnResult {
    // Number guard: drop any sentence carrying a number no tool produced.
    const safe: string[] = [];
    for (const line of this.out) {
      const bad = this.allow.violations(line);
      if (bad.length) this.events.push({ type: "guard", blocked: line });
      else safe.push(line);
    }
    if (end) {
      this.s.ended = true;
      this.setStage("ENDED");
      this.s.outcome ??= this.finalOutcome();
    }
    this.s.lastSaid = safe;
    return { say: safe, events: this.events, state: this.s, end };
  }

  private finalOutcome() {
    if (this.s.slots.visit) return "SITE_VISIT_BOOKED" as const;
    if (this.s.escalationIds.length) return "ESCALATED" as const;
    if (this.s.flags?.quoted) return "INTERESTED" as const;
    return "COMPLETED" as const;
  }

  private switchTo(lang: CallLang) {
    if (lang === this.s.lang) return false;
    this.events.push({ type: "lang", from: this.s.lang, to: lang });
    this.s.notes.push(`Language switched from ${this.s.lang === "en" ? "English" : "Hindi"} to ${lang === "en" ? "English" : "Hindi"}.`);
    this.s.lang = lang;
    return true;
  }

  /** Follow the caller's language turn by turn; short or numeric replies never trigger a switch. */
  private followLanguage(text: string) {
    const explicit = detectLanguageChoice(text);
    if (explicit) return this.switchTo(explicit);
    const detected = detectLanguage(text);
    if (detected !== "en") return this.switchTo("hi");
    // Back to English only on clear English ("can you tell me about the warranty"),
    // never on Hindi numbers typed in Latin script ("teen saade teen hazaar").
    const latinWords = (text.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length > 1);
    const englishMarkers = latinWords.filter((w) => EN_MARKERS.has(w)).length;
    if (this.s.lang === "hi" && latinWords.length >= 3 && englishMarkers >= 2) return this.switchTo("en");
    return false;
  }

  private async escalate(reason: EscalationReason, question: string) {
    const r = await this.tool("escalate", { reason, question }, () => this.tools.escalate({ reason, question }));
    this.s.escalationIds.push(r.id);
    this.s.notes.push(`Escalated (${reason.toLowerCase().replace(/_/g, " ")}): "${question.slice(0, 140)}"`);
    return r.dueHours;
  }

  // ---------------------------------------------------------------- start

  async start(state: CallState): Promise<TurnResult> {
    this.begin(state);
    const part = dayPart(this.ctx.now, TZ);
    const name = this.s.slots.name;
    if (this.s.direction === "OUTBOUND") {
      this.say(...this.m.greetOutbound(part, name));
      this.setStage("CONSENT");
    } else if (name) {
      this.say(...this.m.greetInboundKnown(part, name));
      await this.advance();
    } else {
      this.say(...this.m.greetInbound(part));
      this.setStage("LANGUAGE");
    }
    return this.finish();
  }

  // ---------------------------------------------------------------- reply

  async reply(state: CallState, rawText: string): Promise<TurnResult> {
    this.begin(state);
    if (this.s.ended) return this.finish(true);
    this.s.turns++;
    const text = rawText.trim();
    if (!text) {
      this.say(this.m.notUnderstood);
      return this.finish();
    }
    this.allow.add(text);

    if (this.followLanguage(text) && this.s.stage !== "LANGUAGE") this.say(this.m.switched);

    // Requests that apply at any point in the call.
    if (wantsNoCalls(text)) {
      await this.tool("markDoNotCall", {}, () => this.tools.markDoNotCall());
      this.s.outcome = "DNC";
      this.say(this.m.dnc);
      return this.finish(true);
    }
    if (this.s.direction === "OUTBOUND" && wrongNumber(text)) {
      this.s.outcome = "WRONG_NUMBER";
      this.say(this.m.wrongNumber);
      return this.finish(true);
    }
    if (wantsRepeat(text) && this.s.lastSaid.length) {
      this.say(...this.s.lastSaid);
      return this.finish();
    }
    if (wantsHuman(text)) {
      const h = await this.escalate("HUMAN_REQUESTED", text);
      this.say(this.m.humanRequested(h), this.m.anythingElse);
      this.setStage("QA");
      return this.finish();
    }
    if (isUpset(text)) {
      const h = await this.escalate("UPSET", text);
      this.say(this.m.upset(h), this.m.anythingElse);
      this.setStage("QA");
      return this.finish();
    }

    switch (this.s.stage) {
      case "LANGUAGE":
        return this.onLanguage(text);
      case "CONSENT":
        return this.onConsent(text);
      case "SEGMENT":
        return this.onSegment(text);
      case "BILL":
        return this.onBill(text);
      case "LOCATION":
        return this.onLocation(text);
      case "OFFER_VISIT":
        return this.onOfferVisit(text);
      case "VISIT_TIME":
        return this.onVisitTime(text);
      case "CALLBACK_TIME":
        return this.onCallbackTime(text);
      case "QA":
      default:
        return this.onQuestionTime(text);
    }
  }

  // ---------------------------------------------------------------- stages

  private async onLanguage(text: string) {
    // The language was set by followLanguage(); a substantive first answer is used straight away.
    const seg = detectSegment(text);
    if (seg) this.s.slots.segment = seg;
    const amount = parseAmount(text);
    if (amount && amount >= 100) this.s.slots.monthlyBill = amount;
    if (this.s.lang === "hi") this.say(this.m.switched);
    if (topicOf(text) && !seg && !detectLanguageChoice(text)) {
      await this.answer(text);
      await this.advance();
      return this.finish();
    }
    await this.advance();
    return this.finish();
  }

  private async onConsent(text: string) {
    if (isBusy(text)) {
      if (await this.tryCallback(text)) return this.finish(true);
      this.setStage("CALLBACK_TIME");
      this.say(this.m.callbackAsk);
      return this.finish();
    }
    if (notInterested(text) || (isNo(text) && !isYes(text))) {
      this.s.outcome = "NOT_INTERESTED";
      this.say(this.m.notInterested);
      return this.finish(true);
    }
    const seg = detectSegment(text);
    if (seg) this.s.slots.segment = seg;
    if (isYes(text) || seg) {
      await this.advance();
      return this.finish();
    }
    if (topicOf(text)) {
      await this.answer(text);
      await this.advance();
      return this.finish();
    }
    return this.notUnderstood(() => this.advance());
  }

  private async onSegment(text: string) {
    const seg = detectSegment(text);
    if (seg) {
      this.s.slots.segment = seg;
      const amount = parseAmount(text);
      if (amount && amount >= 100) this.s.slots.monthlyBill = amount;
      await this.advance();
      return this.finish();
    }
    if (topicOf(text) && !isYes(text)) {
      await this.answer(text);
      this.say(this.m.askSegment);
      return this.finish();
    }
    return this.notUnderstood(async () => {
      this.s.slots.segment = "RESIDENTIAL";
      this.s.notes.push("Segment not stated; assumed home (residential).");
      await this.advance();
    });
  }

  private async onBill(text: string) {
    const amount = parseAmount(text);
    if (amount && amount >= 100 && amount <= 5_000_000) {
      this.s.slots.monthlyBill = amount;
      this.allow.add(...lakhForms(amount));
      await this.advance();
      return this.finish();
    }
    if (DONT_KNOW.test(text) || isNo(text)) {
      if (this.s.misunderstood === 0) {
        this.s.misunderstood++;
        this.say(this.m.askBillAgain);
        return this.finish();
      }
      this.s.flags!.billSkipped = true;
      await this.advance();
      return this.finish();
    }
    if (topicOf(text)) {
      await this.answer(text);
      this.say(this.m.askBill);
      return this.finish();
    }
    return this.notUnderstood(async () => {
      this.s.flags!.billSkipped = true;
      await this.advance();
    });
  }

  private async onLocation(text: string) {
    const pin = parsePincode(text);
    if (pin) this.s.slots.pincode = pin;
    else {
      const t = topicOf(text);
      if (t && t !== "QUESTION") {
        await this.answer(text);
        this.say(this.m.askLocation);
        return this.finish();
      }
      // "for my factory" / "5000" are not city names — keep the detail, ask for the city again.
      const seg = detectSegment(text);
      const amount = parseAmount(text);
      if (seg || (amount && amount >= 100)) {
        if (seg) this.s.slots.segment = seg;
        if (amount && amount >= 100) this.s.slots.monthlyBill = amount;
        this.say(this.m.askLocation);
        return this.finish();
      }
      const place = text
        .replace(/\b(i am|i'm|im|from|in|at|main|mai|hoon|hun|hu|se|mein|me|my city is|city|shahar|sheher|ka|ki|ke|hai|ji)\b/gi, " ")
        .replace(/में|से|हूँ|हूं|है|शहर|मैं|जी/g, " ")
        .replace(/[^\p{L}\p{M}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (place && place.split(" ").length <= 4) this.s.slots.city = place;
      else
        return this.notUnderstood(async () => {
          this.s.flags!.locationSkipped = true;
          await this.advance();
        });
    }
    await this.tool("saveLead", this.s.slots, () => this.tools.saveLead(this.s.slots));
    await this.advance();
    return this.finish();
  }

  private async onOfferVisit(text: string) {
    if (isYes(text) && !isNo(text)) {
      this.capturePendingTime(text);
      if (await this.tryBookVisit()) return this.finish();
      this.setStage("VISIT_TIME");
      this.say(this.s.flags?.pendingDay !== undefined ? this.m.askVisitSlot : this.m.askVisitTime);
      return this.finish();
    }
    if (isNo(text) || notInterested(text)) {
      this.s.flags!.visitDeclined = true;
      this.setStage("QA");
      this.say(this.m.anythingElse);
      return this.finish();
    }
    if (detectDayOffset(text, istDate(this.ctx.now).weekday) !== null || detectSlot(text)) {
      this.capturePendingTime(text);
      if (await this.tryBookVisit()) return this.finish();
      this.setStage("VISIT_TIME");
      this.say(this.m.askVisitSlot);
      return this.finish();
    }
    if (topicOf(text)) {
      await this.answer(text);
      this.say(this.m.offerVisit);
      return this.finish();
    }
    return this.notUnderstood(async () => {
      this.s.flags!.visitDeclined = true;
      this.setStage("QA");
      this.say(this.m.anythingElse);
    });
  }

  private async onVisitTime(text: string) {
    this.capturePendingTime(text);
    if (await this.tryBookVisit()) return this.finish();
    const f = this.s.flags!;
    if (f.pendingDay !== undefined && !f.pendingSlot) this.say(this.m.askVisitSlot);
    else if (f.pendingSlot && f.pendingDay === undefined) this.say(this.m.askVisitTime);
    else return this.notUnderstood(async () => {
      this.s.flags!.visitDeclined = true;
      const h = await this.escalate("NOT_UNDERSTOOD", `Site survey time not understood: "${text}"`);
      this.setStage("QA");
      this.say(this.m.humanRequested(h), this.m.anythingElse);
    });
    return this.finish();
  }

  private async onCallbackTime(text: string) {
    if (await this.tryCallback(text, true)) return this.finish(true);
    return this.finish(true);
  }

  private async onQuestionTime(text: string) {
    const topic = topicOf(text);
    if (!topic && (DONE_WORDS.test(text) || notInterested(text))) {
      this.say(this.m.closing);
      return this.finish(true);
    }
    if (!topic && isYes(text) && text.split(/\s+/).length <= 3) {
      this.say(ASK_QUESTION[this.s.lang]);
      return this.finish();
    }
    const needsBill = await this.answer(text);
    if (needsBill) {
      this.setStage("BILL");
      return this.finish();
    }
    this.say(this.m.anythingElse);
    return this.finish();
  }

  // ---------------------------------------------------------------- helpers

  /** Ask the next missing question, quoting once segment, bill and place are known. */
  private async advance() {
    const { slots } = this.s;
    const f = this.s.flags!;
    if (!slots.segment) {
      this.setStage("SEGMENT");
      this.say(this.m.askSegment);
      return;
    }
    if (slots.monthlyBill === undefined && !f.billSkipped) {
      this.setStage("BILL");
      this.say(this.m.askBill);
      return;
    }
    if (!slots.city && !slots.pincode && !f.locationSkipped) {
      this.setStage("LOCATION");
      this.say(this.m.askLocation);
      return;
    }
    if (!f.quoted) {
      await this.quote();
      f.quoted = true;
    }
    if (!slots.visit && !f.visitDeclined) {
      this.setStage("OFFER_VISIT");
      this.say(this.m.offerVisit);
      return;
    }
    this.setStage("QA");
    this.say(this.m.anythingElse);
  }

  private async quote() {
    const { slots } = this.s;
    const segment = slots.segment ?? "RESIDENTIAL";
    if (segment !== "RESIDENTIAL") {
      this.say(this.m.businessQuote);
      return;
    }
    if (!slots.monthlyBill) {
      this.say(this.m.finalNote);
      return;
    }
    const est = await this.tool("estimateSystem", { monthlyBill: slots.monthlyBill, segment }, () =>
      this.tools.estimateSystem({ monthlyBill: slots.monthlyBill!, segment }),
    );
    if (!est) {
      this.say(this.m.finalNote);
      return;
    }
    slots.kw = est.kw;
    this.say(...this.m.recommend(formatINR(slots.monthlyBill, this.s.lang), est.kw, est.roofSqftMin, est.roofSqftMax, est.unitsMin, est.unitsMax));
    const price = await this.tool("getPrice", { kw: est.kw, segment }, () => this.tools.getPrice({ kw: est.kw, segment }));
    if (price) this.allow.add(...lakhForms(price.priceMin), ...lakhForms(price.priceMax));
    const sub = await this.tool("getSubsidy", { kw: est.kw, segment, pincode: slots.pincode, city: slots.city }, () =>
      this.tools.getSubsidy({ kw: est.kw, segment, pincode: slots.pincode, city: slots.city }),
    );
    if (price) {
      this.say(this.m.price(est.kw, formatINR(price.priceMin, this.s.lang), formatINR(price.priceMax, this.s.lang)));
      this.say(sub.eligible ? this.m.subsidy(formatINR(sub.total, this.s.lang)) : this.m.noSubsidy);
      this.say(this.m.finalNote);
    } else {
      this.say(this.m.noPrice(est.kw));
      if (sub.eligible) this.say(this.m.subsidy(formatINR(sub.total, this.s.lang)));
    }
    this.s.notes.push(`Quoted about ${est.kw} kW${price ? ` at ${formatINR(price.priceMin)}–${formatINR(price.priceMax)} before subsidy` : ""}${sub.eligible ? `, subsidy up to ${formatINR(sub.total)}` : ""}.`);
  }

  /** Answers a side question. Returns true when the answer needs the caller's bill first. */
  private async answer(text: string): Promise<boolean> {
    const topic = topicOf(text);
    const { slots } = this.s;
    if (topic === "NEGOTIATION") {
      this.say(this.m.negotiation(await this.escalate("NEGOTIATION", text)));
      return false;
    }
    if (topic === "OUT_OF_SCOPE") {
      this.say(this.m.escalate(await this.escalate("OUT_OF_SCOPE", text)));
      return false;
    }
    if (topic === "SUBSIDY") {
      const kw = slots.kw ?? 3;
      const sub = await this.tool("getSubsidy", { kw, segment: "RESIDENTIAL", city: slots.city }, () =>
        this.tools.getSubsidy({ kw, segment: "RESIDENTIAL", pincode: slots.pincode, city: slots.city }),
      );
      if (sub.eligible) this.say(slots.kw ? this.m.subsidy(formatINR(sub.total, this.s.lang)) : this.m.subsidyGeneral(formatINR(sub.total, this.s.lang)));
      else this.say(this.m.escalate(await this.escalate("NOT_IN_KNOWLEDGE", text)));
      return false;
    }
    if (topic === "PRICE") {
      if (!slots.kw) {
        if (slots.monthlyBill === undefined && (slots.segment ?? "RESIDENTIAL") === "RESIDENTIAL") {
          this.say(this.m.priceNeedsBill);
          return true;
        }
        this.say(this.m.businessQuote);
        return false;
      }
      const price = await this.tool("getPrice", { kw: slots.kw, segment: slots.segment ?? "RESIDENTIAL" }, () =>
        this.tools.getPrice({ kw: slots.kw!, segment: slots.segment ?? "RESIDENTIAL" }),
      );
      if (price) {
        this.allow.add(...lakhForms(price.priceMin), ...lakhForms(price.priceMax));
        this.say(this.m.price(slots.kw, formatINR(price.priceMin, this.s.lang), formatINR(price.priceMax, this.s.lang)), this.m.finalNote);
      } else this.say(this.m.noPrice(slots.kw));
      return false;
    }
    const hits = await this.tool("searchKnowledge", { question: text }, () => this.tools.searchKnowledge(text));
    const top = hits[0];
    if (top && top.confidence >= 0.5) {
      const answer = firstSentences(top.text);
      this.allow.add(answer);
      this.say(this.s.lang === "hi" ? `${this.m.knowledgeLead} ${answer}` : answer);
      this.s.notes.push(`Answered from "${top.title}": "${text.slice(0, 100)}"`);
      return false;
    }
    this.say(this.m.escalate(await this.escalate("NOT_IN_KNOWLEDGE", text)));
    return false;
  }

  private capturePendingTime(text: string) {
    const f = this.s.flags!;
    const day = detectDayOffset(text, istDate(this.ctx.now).weekday);
    const slot = detectSlot(text);
    if (day !== null) f.pendingDay = day;
    if (slot) f.pendingSlot = slot;
  }

  private timeLabel(offset: number, slot?: DaySlot) {
    const { weekday } = dateAfter(this.ctx.now, offset);
    const day = DAY_LABEL[this.s.lang](offset, (this.s.lang === "hi" ? WEEKDAY_HI : WEEKDAY_EN)[weekday]);
    return slot ? `${day} ${SLOT_LABEL[this.s.lang][slot]}` : day;
  }

  private async tryBookVisit(): Promise<boolean> {
    const f = this.s.flags!;
    if (f.pendingDay === undefined || !f.pendingSlot) return false;
    const { iso } = dateAfter(this.ctx.now, f.pendingDay);
    const label = this.timeLabel(f.pendingDay, f.pendingSlot);
    await this.tool("bookSiteVisit", { dateISO: iso, slot: f.pendingSlot, label }, () =>
      this.tools.bookSiteVisit({ dateISO: iso, slot: f.pendingSlot!, label }),
    );
    this.s.slots.visit = { dateISO: iso, slot: f.pendingSlot, label };
    this.s.outcome = "SITE_VISIT_BOOKED";
    this.s.notes.push(`Site survey booked: ${label} (${iso}).`);
    this.setStage("QA");
    this.say(this.m.visitBooked(label), this.m.anythingElse);
    return true;
  }

  /** Schedules a callback from whatever time the caller gave; `force` books "later today" when none was given. */
  private async tryCallback(text: string, force = false): Promise<boolean> {
    const day = detectDayOffset(text, istDate(this.ctx.now).weekday);
    const slot = detectSlot(text) ?? undefined;
    if (day === null && !slot && !force) return false;
    const offset = day ?? 0;
    const { iso } = dateAfter(this.ctx.now, offset);
    const label = day === null && !slot ? (this.s.lang === "hi" ? "आज बाद में" : "later today") : this.timeLabel(offset, slot);
    await this.tool("scheduleCallback", { dateISO: iso, slot, label }, () => this.tools.scheduleCallback({ dateISO: iso, slot, label }));
    this.s.slots.callback = { dateISO: iso, slot, label };
    this.s.outcome = "CALLBACK";
    this.s.notes.push(`Callback requested: ${label}.`);
    this.say(this.m.callbackDone(label));
    return true;
  }

  private async notUnderstood(giveUp: () => Promise<void>) {
    this.s.misunderstood++;
    if (this.s.misunderstood >= 2) {
      this.s.misunderstood = 0;
      await giveUp();
      return this.finish();
    }
    this.say(this.m.notUnderstood);
    return this.finish();
  }
}
