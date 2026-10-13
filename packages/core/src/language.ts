import type { TextLang as Lang } from "./types";

/**
 * Detects English, Hindi (Devanagari) and Hinglish (Hindi written in Latin
 * script, often mixed with English). Rule-based, fast and deterministic — the
 * user never has to pick a language.
 */

const DEVANAGARI = /[ऀ-ॿ]/g;

/** Common Hindi function words / verbs as typed in Latin script. */
const HINGLISH = new Set(
  (
    "kya kyaa hai hain hoga hogi hota hoti hote tha thi mera mere meri mujhe muje hamara hamare hum ham aap apna apne apni tum " +
    "ghar kitna kitne kitni kitna chahiye chaiye chahte chahta chahti lagwana lagwane lagwani lagana lagane lagaye lagaen lagwaye lagta lagti " +
    "karta karte karti karna karni karu karun karo kare karein kijiye kaise kaisa kaisi kaun kaunsa kaunsi kab kahan kyun kyu " +
    "aur ya me mein mai main se ke ka ki ko par pe bhi nahi nahin na haan ha ji bataiye batao bataye btao milegi milega milenge " +
    "sakte sakta sakti wala wali wale bijli paisa paise rupaye rupay hazar hajar sabse accha acha theek thik liye vala vali yojana yojna " +
    "lagaa sakta hu hun hoon tak abhi kitna jyada zyada kam baat batana chahiye bill aata aati aate"
  ).split(" "),
);
/** Words that look Hinglish but are also English — ignore when scoring. */
const AMBIGUOUS = new Set(["me", "main", "par", "ha", "na", "bill", "to", "ho", "ki", "hi", "so"]);

export function detectLanguage(text: string): Lang {
  const t = text.trim();
  if (!t) return "en";
  const deva = (t.match(DEVANAGARI) ?? []).length;
  const letters = (t.match(/\p{L}/gu) ?? []).length || 1;
  if (deva / letters > 0.25) return "hi";

  const words = t.toLowerCase().match(/[a-z]+/g) ?? [];
  if (!words.length) return "en";
  let strong = 0;
  for (const w of words) if (HINGLISH.has(w) && !AMBIGUOUS.has(w)) strong++;
  if (strong >= 2 || (strong >= 1 && words.length <= 4) || strong / words.length >= 0.2) return "hinglish";
  return "en";
}

/** BCP-47 tag for speech APIs. Hinglish is spoken best by Indian-English voices/recognisers. */
export function speechLang(lang: Lang): string {
  return lang === "hi" ? "hi-IN" : "en-IN";
}
