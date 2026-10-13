import type { CallLang, PriceQuote, Segment, SizeEstimate } from "../types";

/**
 * Pure sizing, price and subsidy maths. The Voice Console stores the tables
 * (editable by the team); these functions only compute from them, so every
 * number the agent says traces back to a row someone approved.
 */

export interface SizingRow {
  kw: number;
  billMin: number;
  billMax: number;
  roofSqftMin: number;
  roofSqftMax: number;
  unitsMin: number;
  unitsMax: number;
}

export interface PriceRow {
  segment: Segment;
  kw: number;
  priceMin: number;
  priceMax: number;
  includesGst: boolean;
  sample: boolean;
}

export interface SubsidyRule {
  name: string;
  scope: "CENTRAL" | "STATE";
  /** For state rules: matched against the caller's city/state text (lower case). */
  state?: string | null;
  segment: Segment;
  perKwFirst: number;
  firstKw: number;
  perKwNext: number;
  nextKw: number;
  cap: number;
  active: boolean;
}

/** Picks the published system size whose bill range fits (or is nearest to) the caller's bill. */
export function sizeFromBill(rows: SizingRow[], bill: number, source = "Multi Solar size guide"): SizeEstimate | null {
  if (!rows.length || !(bill > 0)) return null;
  const sorted = [...rows].sort((a, b) => a.kw - b.kw);
  const inside = sorted.find((r) => bill >= r.billMin && bill <= r.billMax);
  const pick =
    inside ??
    sorted.reduce((best, r) => {
      const d = Math.min(Math.abs(bill - r.billMin), Math.abs(bill - r.billMax));
      const bd = Math.min(Math.abs(bill - best.billMin), Math.abs(bill - best.billMax));
      return d < bd ? r : best;
    }, sorted[0]);
  const largest = sorted[sorted.length - 1];
  if (bill > largest.billMax) {
    // Beyond the guide: scale from the largest size, rounded to whole kW.
    const perKw = (largest.billMin + largest.billMax) / 2 / largest.kw;
    const kw = Math.max(largest.kw, Math.round(bill / perKw));
    const f = kw / largest.kw;
    return {
      kw,
      roofSqftMin: Math.round(largest.roofSqftMin * f),
      roofSqftMax: Math.round(largest.roofSqftMax * f),
      unitsMin: Math.round(largest.unitsMin * f),
      unitsMax: Math.round(largest.unitsMax * f),
      source: `${source} (scaled from ${largest.kw} kW)`,
    };
  }
  return { kw: pick.kw, roofSqftMin: pick.roofSqftMin, roofSqftMax: pick.roofSqftMax, unitsMin: pick.unitsMin, unitsMax: pick.unitsMax, source };
}

export function priceFor(rows: PriceRow[], kw: number, segment: Segment): PriceQuote | null {
  const row = rows.find((r) => r.segment === segment && r.kw === kw);
  return row ? { kw, priceMin: row.priceMin, priceMax: row.priceMax, includesGst: row.includesGst, sample: row.sample } : null;
}

/** Tiered subsidy: perKwFirst up to firstKw, then perKwNext for the next nextKw, capped. */
export function subsidyAmount(rule: SubsidyRule, kw: number): number {
  const first = Math.min(kw, rule.firstKw) * rule.perKwFirst;
  const next = Math.min(Math.max(kw - rule.firstKw, 0), rule.nextKw) * rule.perKwNext;
  return Math.min(Math.round(first + next), rule.cap);
}

export function subsidyFor(rules: SubsidyRule[], kw: number, segment: Segment, place?: string) {
  const active = rules.filter((r) => r.active && r.segment === segment);
  const central = active.find((r) => r.scope === "CENTRAL");
  const where = (place ?? "").toLowerCase();
  const state = where ? active.find((r) => r.scope === "STATE" && r.state && where.includes(r.state.toLowerCase())) : undefined;
  const c = central ? subsidyAmount(central, kw) : 0;
  const s = state ? subsidyAmount(state, kw) : 0;
  return { eligible: c + s > 0, central: c, state: s, stateName: state?.state ?? undefined, total: c + s };
}

/** "₹65,000", "₹1.5 lakh" / "₹1.5 लाख" — the forms the agent speaks. */
export function formatINR(n: number, lang: CallLang = "en"): string {
  if (n >= 100000) {
    const l = Math.round((n / 100000) * 100) / 100;
    return `₹${l} ${lang === "hi" ? "लाख" : "lakh"}`;
  }
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
