/** Shared types for the Multi Solar Voice agent. */

/** What a piece of text is written in. Hinglish = Hindi in Latin script. */
export type TextLang = "en" | "hi" | "hinglish";
/** The language the agent speaks on a call. Hinglish callers are answered in Hindi. */
export type CallLang = "en" | "hi";

export type Segment = "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL";
export type Direction = "INBOUND" | "OUTBOUND";

export type Stage =
  | "LANGUAGE"
  | "CONSENT"
  | "SEGMENT"
  | "BILL"
  | "LOCATION"
  | "OFFER_VISIT"
  | "VISIT_TIME"
  | "CALLBACK_TIME"
  | "QA"
  | "ENDED";

export type Outcome =
  | "SITE_VISIT_BOOKED"
  | "INTERESTED"
  | "CALLBACK"
  | "NOT_INTERESTED"
  | "ESCALATED"
  | "DNC"
  | "WRONG_NUMBER"
  | "COMPLETED";

export type EscalationReason =
  | "NOT_IN_KNOWLEDGE"
  | "HUMAN_REQUESTED"
  | "NOT_UNDERSTOOD"
  | "OUT_OF_SCOPE"
  | "NEGOTIATION"
  | "UPSET";

export type DaySlot = "MORNING" | "AFTERNOON" | "EVENING";

/** Who a customer can be handed to (keypad 1 / 2 / 3, or the AI's transfer tool). */
export type Team = "SALES" | "SALES_HEAD" | "CRM";
export const TEAMS: Team[] = ["SALES", "SALES_HEAD", "CRM"];

export interface Slots {
  name?: string;
  segment?: Segment;
  monthlyBill?: number;
  pincode?: string;
  city?: string;
  kw?: number;
  visit?: { dateISO: string; slot: DaySlot; label: string };
  callback?: { dateISO: string; slot?: DaySlot; label: string };
}

export interface CallState {
  direction: Direction;
  lang: CallLang;
  /** Language the call started in (to report a switch). */
  startLang: CallLang;
  stage: Stage;
  slots: Slots;
  /** Consecutive turns the agent could not understand in the current stage. */
  misunderstood: number;
  escalationIds: number[];
  outcome?: Outcome;
  ended: boolean;
  turns: number;
  /** Last thing the agent said (for "repeat please"). */
  lastSaid: string[];
  /** Short notes for the summary (questions asked, escalations, switches). */
  notes: string[];
  /** Which brain runs this call: "claude" (AI conversation) or "rules" (built-in engine). Set at the start. */
  brain?: "claude" | "rules";
  /** Claude conversation memory, kept between turns (append-only). */
  ai?: { messages: unknown[]; failures: number; allowed: string[] };
  /** The customer asked to speak to a person: hand over after the agent's last sentence. */
  transfer?: { team: Team };
}

// ---------------------------------------------------------------- tools

export interface SizeEstimate {
  kw: number;
  roofSqftMin: number;
  roofSqftMax: number;
  unitsMin: number;
  unitsMax: number;
  /** Where the sizing came from, e.g. "Multi Solar published size guide". */
  source: string;
}

export interface PriceQuote {
  kw: number;
  priceMin: number;
  priceMax: number;
  includesGst: boolean;
  /** True when the price row is sample data, not the company's official sheet. */
  sample: boolean;
}

export interface SubsidyQuote {
  eligible: boolean;
  central: number;
  state: number;
  stateName?: string;
  total: number;
}

export interface KnowledgeHit {
  title: string;
  heading?: string | null;
  text: string;
  /** 0–1: share of the question's key words found in the passage. */
  confidence: number;
  score: number;
}

/**
 * Everything the agent can look up or do. Implemented by the Voice Console
 * (database) for real calls and test calls, and by fakes in unit tests.
 */
export interface Tools {
  estimateSystem(input: { monthlyBill: number; segment: Segment }): Promise<SizeEstimate | null>;
  getPrice(input: { kw: number; segment: Segment }): Promise<PriceQuote | null>;
  getSubsidy(input: { kw: number; segment: Segment; pincode?: string; city?: string }): Promise<SubsidyQuote>;
  searchKnowledge(question: string): Promise<KnowledgeHit[]>;
  bookSiteVisit(input: { dateISO: string; slot: DaySlot; label: string }): Promise<{ ok: boolean }>;
  escalate(input: { reason: EscalationReason; question: string }): Promise<{ id: number; dueHours: number }>;
  scheduleCallback(input: { dateISO: string; slot?: DaySlot; label: string }): Promise<void>;
  markDoNotCall(): Promise<void>;
  saveLead(slots: Slots): Promise<void>;
}

export type EngineEvent =
  | { type: "tool"; name: string; input: unknown; output: unknown }
  | { type: "lang"; from: CallLang; to: CallLang }
  | { type: "stage"; from: Stage; to: Stage }
  | { type: "guard"; blocked: string };

export interface TurnResult {
  /** Sentences for the agent to speak, in order. */
  say: string[];
  events: EngineEvent[];
  state: CallState;
  end: boolean;
}

export interface CallContext {
  direction: Direction;
  now: Date;
  customerName?: string;
  /** Language saved on the lead from an earlier call. */
  knownLang?: CallLang;
  knownSegment?: Segment;
  knownBill?: number;
  agentName: string;
  escalationHours: number;
}
