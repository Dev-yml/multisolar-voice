/**
 * Number guard: the agent may only speak numbers that came from a tool
 * (price sheet, subsidy rules, size guide), from what the caller said, or a
 * short fixed list (callback hours, "2 minutes"). Anything else is blocked,
 * which stops an LLM from inventing a price, a subsidy or a percentage.
 */

const numberTokens = (text: string) =>
  (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => String(parseFloat(n.replace(/,/g, ""))));

export class NumberAllowlist {
  private allowed = new Set<string>();
  constructor(base: number[] = []) {
    for (const n of base) this.add(n);
  }
  add(...values: (number | string | null | undefined)[]) {
    for (const v of values) {
      if (v === null || v === undefined) continue;
      for (const t of typeof v === "number" ? [String(v)] : numberTokens(v)) this.allowed.add(t);
    }
    return this;
  }
  /** Adds every number found in a structured tool result. */
  addFrom(value: unknown) {
    const walk = (v: unknown) => {
      if (typeof v === "number") this.add(v);
      else if (typeof v === "string") this.add(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(value);
    return this;
  }
  /** Numbers in `sentence` that were not allowed (empty = safe to say). */
  violations(sentence: string): string[] {
    return numberTokens(sentence).filter((n) => !this.allowed.has(n));
  }
}

/** Lakh figures are spoken as "1.5 lakh": allow both the rupee value and its lakh form. */
export function lakhForms(n: number): number[] {
  return n >= 100000 ? [n, Math.round((n / 100000) * 100) / 100] : [n];
}
