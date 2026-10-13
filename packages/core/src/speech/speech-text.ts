import type { TextLang as Lang } from "../types";

/**
 * Turns an answer into natural spoken text, one short sentence at a time.
 * Written text is full of things voices read badly — "₹78,000", "3 kW",
 * "5–8", "CFA", "TOPCon", bullets and URLs — so they are expanded first.
 * Shared by browser and server text-to-speech. Pure and unit-tested.
 */

const ACRONYMS: [RegExp, string][] = [
  [/\bTOPCon\b/g, "Top-Con"],
  [/\bMono PERC\b/gi, "Mono Perk"],
  [/\bPERC\b/g, "Perk"],
  [/\bCFA\b/g, "C F A"],
  [/\bALMM\b/g, "A L M M"],
  [/\bEPC\b/g, "E P C"],
  [/\bBIS\b/g, "B I S"],
  [/\bIEC\b/g, "I E C"],
  [/\bMNRE\b/g, "M N R E"],
  [/\bPIB\b/g, "P I B"],
  [/\bDISCOMs?\b/g, "discom"],
  [/\bDCR\b/g, "D C R"],
  [/\bGBI\b/g, "G B I"],
  [/\bPM\b/g, "P M"],
  [/\bEL\b/g, "E L"],
  [/\bISO\b/g, "I S O"],
  [/\bPIN\b/g, "pin"],
  [/\bCEL\b/g, "C E L"],
  [/\bAI\b/g, "A I"],
];

const UNITS: Record<"en" | "hi", { rupees: string; kw: string; mw: string; w: string; pct: string; to: string; per: string; sqft: string }> = {
  en: { rupees: "rupees", kw: "kilowatt", mw: "megawatt", w: "watt", pct: "percent", to: "to", per: "per", sqft: "square feet" },
  hi: { rupees: "रुपये", kw: "किलोवाट", mw: "मेगावाट", w: "वाट", pct: "प्रतिशत", to: "से", per: "प्रति", sqft: "वर्ग फुट" },
};

export function toSpeech(text: string, lang: Lang): string {
  const u = UNITS[lang === "hi" ? "hi" : "en"];
  let s = text
    // Structure → sentences
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s*[•\-*]\s+(.+?)\s*$/gm, (_, item: string) => (/[.!?।]$/.test(item) ? item : `${item}.`))
    .replace(/[“”"]/g, "")
    .replace(/\s*[—–]\s+/g, ", ")
    .replace(/\be\.g\.\s*/gi, "for example ")
    // Money: ₹1.5 lakh, ₹78,000, Rs 30,000
    .replace(/(?:₹|Rs\.?|INR)\s?(\d(?:[\d,]*\d)?(?:\.\d+)?)(\s?(?:lakh|crore|k)\b)?/gi, (_, n: string, scale = "") => `${n}${scale} ${u.rupees}`)
    // Ranges: 5–8 kW, 100–120 units, 400-500
    .replace(/(\d(?:[\d,.]*\d)?)\s?[–-]\s?(\d(?:[\d,.]*\d)?)/g, `$1 ${u.to} $2`)
    // Rates and units
    .replace(/\/\s?kW\b/gi, ` ${u.per} ${u.kw}`)
    .replace(/\/\s?(month|unit)\b/gi, (_, w: string) => ` ${u.per} ${w}`)
    .replace(/(\d)\s?kWp?\b/gi, `$1 ${u.kw}`)
    .replace(/\bkW\b/g, u.kw)
    .replace(/(\d)\s?MW\b/g, `$1 ${u.mw}`)
    .replace(/(\d)\s?W\b/g, `$1 ${u.w}`)
    .replace(/(\d)\s?%/g, `$1 ${u.pct}`)
    .replace(/\bsq\.?\s?ft\b/gi, u.sqft)
    .replace(/(\d)\s?mm\b/g, "$1 millimetre")
    .replace(/(\d)\s?Pa\b/g, "$1 pascal")
    .replace(/±/g, "plus or minus ")
    .replace(/×/g, " times ")
    .replace(/[·|]/g, ", ")
    .replace(/[()]/g, ", ");
  for (const [re, spoken] of ACRONYMS) s = s.replace(re, spoken);
  return s
    .replace(/\s+,/g, ",")
    .replace(/,\s*,+/g, ",")
    .replace(/,\s*([.!?।])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Short sentences for paced playback ("step by step"). Very long sentences are split at commas. */
export function speechSentences(text: string, lang: Lang, maxLen = 180): string[] {
  const spoken = toSpeech(text, lang);
  const parts = spoken
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 1);
  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= maxLen) {
      out.push(p);
      continue;
    }
    let buf = "";
    for (const piece of p.split(/,\s+/)) {
      if (buf && buf.length + piece.length > maxLen) {
        out.push(`${buf},`);
        buf = piece;
      } else buf = buf ? `${buf}, ${piece}` : piece;
    }
    if (buf) out.push(buf);
  }
  return out;
}
