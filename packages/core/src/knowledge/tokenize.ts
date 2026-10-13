/**
 * Tokeniser shared by indexing and querying. Handles English, Devanagari and
 * Hinglish, with a small synonym map so "subsidy kitni milegi", "सब्सिडी" and
 * "subsidy amount" all hit the same documents.
 */

const STOP = new Set(
  (
    "a an the is are was were be been of to in on for and or with by at from as it this that these those what which who how do does did can could " +
    "will would should i me my we our you your they them their there here about into than then so if not no yes please tell want need " +
    "kya hai hain ka ki ke ko se me mein mai main par pe aur ya bhi hota hoti hote mera mere meri mujhe aap apna apne hum ham kaise kaun " +
    "kitna kitne kitni chahiye karna karni karta karte karu kare batao bataiye ji haan nahi na tha thi wala wali wale liye sakte sakta " +
    "है हैं का की के को से में मैं पर और या भी होता होती मेरा मेरे मेरी मुझे आप हम कैसे कौन कितना कितने कितनी चाहिए करना क्या"
  ).split(/\s+/),
);

/** Hinglish/Hindi → canonical English terms (applied to queries and documents alike). */
const SYNONYMS: Record<string, string[]> = {
  सोलर: ["solar"], सौर: ["solar"], पैनल: ["panel"], panels: ["panel"], module: ["panel", "module"], modules: ["panel", "module"],
  सब्सिडी: ["subsidy"], anudan: ["subsidy"], अनुदान: ["subsidy"], cfa: ["subsidy"],
  वारंटी: ["warranty"], guarantee: ["warranty"], गारंटी: ["warranty"],
  lagwana: ["install", "installation"], lagwane: ["install", "installation"], lagana: ["install"], lagane: ["install"], लगवाना: ["install"], लगाना: ["install"], installing: ["install"], installed: ["install"],
  ghar: ["home", "residential", "house"], घर: ["home", "residential", "house"], house: ["home", "residential"], makaan: ["home", "residential"],
  factory: ["industrial", "factory"], फैक्ट्री: ["industrial", "factory"], udyog: ["industrial"], industry: ["industrial"],
  dukaan: ["commercial", "shop"], dukan: ["commercial", "shop"], दुकान: ["commercial", "shop"], business: ["commercial"], office: ["commercial"],
  bijli: ["electricity"], बिजली: ["electricity"], बिल: ["bill"],
  kimat: ["price", "cost"], keemat: ["price", "cost"], कीमत: ["price", "cost"], daam: ["price", "cost"], kharcha: ["cost"], खर्च: ["cost"],
  efficiency: ["efficiency"], दक्षता: ["efficiency"],
  topcon: ["topcon"], टॉपकॉन: ["topcon"], perc: ["perc", "mono"], monocrystalline: ["mono", "perc"],
  certified: ["certification"], certificate: ["certification"], certifications: ["certification"],
  epc: ["epc", "engineering", "procurement", "construction"],
  karta: ["do"], banate: ["manufacture"], banata: ["manufacture"], manufacturing: ["manufacture"], manufacturer: ["manufacture"], manufactures: ["manufacture"],
  छत: ["roof"], chhat: ["roof"], chat: ["roof"], rooftop: ["roof", "rooftop"],
  maintenance: ["maintenance"], saaf: ["cleaning", "maintenance"], सफाई: ["cleaning", "maintenance"],
  netmetering: ["net", "metering"], मीटरिंग: ["metering"],
};

const stem = (w: string) =>
  /^[a-z]+$/.test(w) && w.length > 4 ? w.replace(/(ings|ing|ies|es|s|ed)$/, (m) => (m === "ies" ? "y" : "")) : w;

export function tokenize(text: string): string[] {
  // \p{M}: Devanagari vowel signs (matras) are combining marks, not letters.
  const words = text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (STOP.has(w) || (w.length < 2 && !/\d/.test(w))) continue;
    out.push(stem(w));
    const syn = SYNONYMS[w];
    if (syn) out.push(...syn);
  }
  return out;
}
