import type { DaySlot, Segment } from "../types";

/**
 * Rule-based understanding of what a caller said, for English, Hindi
 * (Devanagari) and Hinglish. Deterministic and unit-tested; the LLM brain
 * adds nuance later, but these rules keep the agent safe and predictable.
 */

const norm = (t: string) => t.toLowerCase().normalize("NFKC").replace(/[।?!.,]/g, " ").replace(/\s+/g, " ").trim();
const has = (t: string, words: string[]) => words.some((w) => new RegExp(`(^|[^\\p{L}\\p{M}])${w}($|[^\\p{L}\\p{M}])`, "u").test(t));

// ---------------------------------------------------------------- numbers

const UNITS: Record<string, number> = {
  ek: 1, one: 1, एक: 1,
  do: 2, two: 2, दो: 2,
  teen: 3, tin: 3, three: 3, तीन: 3,
  char: 4, chaar: 4, four: 4, चार: 4,
  paanch: 5, panch: 5, five: 5, पांच: 5, पाँच: 5,
  chhe: 6, chhah: 6, che: 6, six: 6, छह: 6, छः: 6, छे: 6,
  saat: 7, seven: 7, सात: 7,
  aath: 8, eight: 8, आठ: 8,
  nau: 9, nine: 9, नौ: 9,
  das: 10, ten: 10, दस: 10,
  gyarah: 11, eleven: 11, ग्यारह: 11,
  barah: 12, twelve: 12, बारह: 12,
  terah: 13, तेरह: 13,
  chaudah: 14, चौदह: 14,
  pandrah: 15, fifteen: 15, पंद्रह: 15, पन्द्रह: 15,
  solah: 16, सोलह: 16,
  satrah: 17, सत्रह: 17,
  atharah: 18, athara: 18, अठारह: 18,
  unnees: 19, उन्नीस: 19,
  bees: 20, twenty: 20, बीस: 20,
  pachees: 25, पच्चीस: 25,
  tees: 30, thirty: 30, तीस: 30,
  chalis: 40, chaalis: 40, forty: 40, चालीस: 40,
  pachas: 50, fifty: 50, पचास: 50,
};
const FRACTIONS: Record<string, number> = { dedh: 1.5, डेढ़: 1.5, dhai: 2.5, dhaai: 2.5, ढाई: 2.5 };
const MODIFIERS: Record<string, number> = { saade: 0.5, sadhe: 0.5, sade: 0.5, साढ़े: 0.5, साढे: 0.5, sava: 0.25, सवा: 0.25, paune: -0.25, पौने: -0.25 };
const SCALES: Record<string, number> = {
  hazaar: 1000, hazar: 1000, hajar: 1000, hajaar: 1000, thousand: 1000, हज़ार: 1000, हजार: 1000, k: 1000,
  sau: 100, hundred: 100, सौ: 100,
  lakh: 100000, lac: 100000, लाख: 100000,
};

/**
 * Finds a rupee amount in free speech: "3500", "3,500", "₹3.5k",
 * "saade teen hazaar", "साढ़े तीन हज़ार", "teen-saade teen hazaar",
 * "pandrah sau", "dedh lakh". Returns the first amount found.
 */
export function parseAmount(text: string): number | null {
  // Digits first, on text that still has its commas and decimal points.
  const raw = text.toLowerCase().normalize("NFKC").replace(/₹|rs\.?|rupees?|रुपये|रुपए|rupaye/g, " ");
  const t = norm(text).replace(/₹|rs\.?|rupees?|रुपये|रुपए|rupaye/g, " ").replace(/-/g, " ");
  // Digits, optionally with a scale word: "3500", "3,500", "3.5 k", "4 hazaar"
  const digit = raw.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|hazaar|hazar|hajar|thousand|हज़ार|हजार|lakh|lac|लाख|sau|सौ|hundred)?(?![\d])/u);
  if (digit) {
    const n = parseFloat(digit[1].replace(/,/g, ""));
    const scale = digit[2] ? SCALES[digit[2]] ?? 1 : 1;
    if (Number.isFinite(n)) return Math.round(n * scale);
  }
  // Words: [modifier] unit [scale]  |  fraction [scale]
  const words = t.split(" ");
  for (let i = 0; i < words.length; i++) {
    let mod = 0;
    let j = i;
    if (MODIFIERS[words[j]] !== undefined) {
      mod = MODIFIERS[words[j]];
      j++;
    }
    let base: number | undefined = FRACTIONS[words[j]];
    if (base === undefined) base = UNITS[words[j]];
    if (base === undefined) continue;
    const value = FRACTIONS[words[j]] !== undefined ? base : base + mod;
    const scale = SCALES[words[j + 1]];
    if (scale) return Math.round(value * scale);
    // "teen saade teen hazaar" → keep scanning for the fuller phrase
  }
  return null;
}

export function parsePincode(text: string): string | null {
  const m = text.match(/(?<!\d)([1-9]\d{5})(?!\d)/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- intents

export function isYes(text: string): boolean {
  const t = norm(text);
  return has(t, ["yes", "yeah", "yep", "sure", "ok", "okay", "haan", "han", "ha", "hanji", "haanji", "ji", "bilkul", "zaroor", "jarur", "jaroor", "theek", "thik", "boliye", "batao", "bataiye", "chalega", "kar do", "kardo", "हाँ", "हां", "जी", "बिल्कुल", "ज़रूर", "जरूर", "ठीक", "बोलिए", "बताइए", "please", "go ahead", "of course"]) && !isNo(text);
}

export function isNo(text: string): boolean {
  const t = norm(text);
  // "na"/"ना" is left out on purpose: "theek hai na" is a tag, not a refusal.
  return has(t, ["no", "nope", "nahi", "nahin", "nai", "mat", "नहीं", "नही", "मत", "not now", "no thanks", "nothing", "kuch nahi", "कुछ नहीं", "bas", "बस", "that's all", "thats all"]);
}

export function wantsHuman(text: string): boolean {
  const t = norm(text);
  return has(t, ["human", "person", "real person", "agent se", "insaan", "insan", "aadmi", "kisi se baat", "manager", "executive", "salesperson", "इंसान", "आदमी", "किसी से बात", "मैनेजर", "talk to someone", "speak to someone"]);
}

export function wantsNoCalls(text: string): boolean {
  const t = norm(text);
  return has(t, ["don't call", "dont call", "do not call", "stop calling", "call mat karo", "call mat karna", "phone mat karo", "dobara call mat", "remove my number", "number hata", "कॉल मत", "फोन मत", "नंबर हटा"]);
}

export function notInterested(text: string): boolean {
  const t = norm(text);
  return has(t, ["not interested", "no interest", "interested nahi", "interest nahi", "nahi chahiye", "nahin chahiye", "zarurat nahi", "jarurat nahi", "need nahi", "नहीं चाहिए", "ज़रूरत नहीं", "जरूरत नहीं", "रुचि नहीं"]);
}

export function wrongNumber(text: string): boolean {
  const t = norm(text);
  return has(t, ["wrong number", "galat number", "गलत नंबर", "i didn't enquire", "maine nahi poocha", "maine enquiry nahi", "मैंने नहीं पूछा"]);
}

export function isBusy(text: string): boolean {
  const t = norm(text);
  return has(t, ["busy", "later", "baad mein", "baad me", "abhi nahi", "abhi time nahi", "call back", "callback", "phir call", "dobara call karo", "बाद में", "अभी नहीं", "व्यस्त", "meeting", "driving"]);
}

export function isUpset(text: string): boolean {
  const t = norm(text);
  return has(t, ["fraud", "cheat", "bakwas", "bekar", "pagal", "complaint", "shikayat", "gussa", "धोखा", "बकवास", "शिकायत", "गुस्सा", "worst", "useless"]);
}

export function wantsRepeat(text: string): boolean {
  const t = norm(text);
  return has(t, ["repeat", "again", "dobara bolo", "phir se", "kya bola", "samjha nahi", "sunai nahi", "फिर से", "दोबारा", "क्या बोला", "pardon"]);
}

export type Topic = "PRICE" | "SUBSIDY" | "NEGOTIATION" | "OUT_OF_SCOPE" | "QUESTION" | null;

/** What a question is about, so the agent can answer before returning to its script. */
export function topicOf(text: string): Topic {
  const t = norm(text);
  if (has(t, ["discount", "chhoot", "chhut", "छूट", "kam karo", "kam kar do", "sasta", "सस्ता", "best price", "last price", "negotiate", "kam ho sakta", "कम कर"])) return "NEGOTIATION";
  if (has(t, ["battery", "batteries", "बैटरी", "off grid", "offgrid", "hybrid", "हाइब्रिड", "megawatt", "mw", "inverter battery", "generator", "wind", "solar pump", "pump"])) return "OUT_OF_SCOPE";
  if (has(t, ["subsidy", "subsidi", "सब्सिडी", "anudan", "अनुदान", "surya ghar", "सूर्य घर", "yojana", "योजना", "government", "sarkar", "सरकार"])) return "SUBSIDY";
  if (has(t, ["price", "cost", "kitne ka", "kitna paisa", "kitna kharcha", "kharcha", "kimat", "keemat", "daam", "rate", "कीमत", "खर्च", "दाम", "कितने का", "कितना पैसा", "how much"])) return "PRICE";
  if (/\?/.test(text) || has(t, ["what", "how", "which", "why", "when", "where", "does", "do you", "can", "is it", "kya", "kaise", "kaun", "kitna", "kitni", "kitne", "kab", "kahan", "kyun", "क्या", "कैसे", "कौन", "कितना", "कितनी", "कितने", "कब", "कहाँ", "क्यों", "warranty", "वारंटी", "guarantee", "efficiency", "topcon", "perc", "maintenance", "cleaning", "loan", "emi"])) return "QUESTION";
  return null;
}

export function detectSegment(text: string): Segment | null {
  const t = norm(text);
  if (has(t, ["factory", "industry", "industrial", "plant", "warehouse godown", "udyog", "फैक्ट्री", "उद्योग", "कारखाना", "karkhana", "mill"])) return "INDUSTRIAL";
  if (has(t, ["shop", "office", "business", "commercial", "dukaan", "dukan", "showroom", "hotel", "school", "hospital", "warehouse", "godown", "दुकान", "ऑफिस", "ऑफ़िस", "बिज़नेस", "शोरूम", "गोदाम"])) return "COMMERCIAL";
  if (has(t, ["home", "house", "ghar", "residential", "flat", "villa", "kothi", "makaan", "makan", "घर", "मकान", "कोठी", "residence", "family"])) return "RESIDENTIAL";
  return null;
}

export function detectLanguageChoice(text: string): "en" | "hi" | null {
  const t = norm(text);
  if (has(t, ["hindi", "हिंदी", "हिन्दी"])) return "hi";
  if (has(t, ["english", "angrezi", "अंग्रेज़ी", "अंग्रेजी", "इंग्लिश"])) return "en";
  return null;
}

// ---------------------------------------------------------------- time

export function detectSlot(text: string): DaySlot | null {
  const t = norm(text);
  if (has(t, ["morning", "subah", "savere", "सुबह", "सवेरे"])) return "MORNING";
  if (has(t, ["afternoon", "dopahar", "dopehar", "lunch", "दोपहर"])) return "AFTERNOON";
  if (has(t, ["evening", "shaam", "sham", "शाम"])) return "EVENING";
  return null;
}

const WEEKDAYS: [string[], number][] = [
  [["sunday", "ravivar", "itwar", "रविवार", "इतवार"], 0],
  [["monday", "somvar", "सोमवार"], 1],
  [["tuesday", "mangalvar", "मंगलवार"], 2],
  [["wednesday", "budhvar", "बुधवार"], 3],
  [["thursday", "guruvar", "veervar", "गुरुवार", "वीरवार"], 4],
  [["friday", "shukravar", "शुक्रवार"], 5],
  [["saturday", "shanivar", "शनिवार"], 6],
];

/** Day offset from today (IST) mentioned in the text, or null. "kal" means tomorrow in this context. */
export function detectDayOffset(text: string, todayWeekday: number): number | null {
  const t = norm(text);
  if (has(t, ["day after tomorrow", "parson", "parso", "परसों"])) return 2;
  if (has(t, ["tomorrow", "kal", "कल"])) return 1;
  if (has(t, ["today", "aaj", "आज"])) return 0;
  for (const [names, day] of WEEKDAYS) if (has(t, names)) return ((day - todayWeekday + 7) % 7) || 7;
  return null;
}
