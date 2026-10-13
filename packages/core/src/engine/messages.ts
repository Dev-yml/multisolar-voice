import type { CallLang, DaySlot } from "../types";

/**
 * Every line the rule-based agent can say, in English and Hindi. Kept short:
 * one idea per sentence, because each sentence is spoken separately.
 * Hindi is written in Devanagari so the Hindi voice reads it naturally.
 */

export type DayPart = "morning" | "afternoon" | "evening";

export const SLOT_LABEL: Record<CallLang, Record<DaySlot, string>> = {
  en: { MORNING: "morning", AFTERNOON: "afternoon", EVENING: "evening" },
  hi: { MORNING: "सुबह", AFTERNOON: "दोपहर", EVENING: "शाम" },
};

export const DAY_LABEL: Record<CallLang, (offset: number, weekday: string) => string> = {
  en: (o, w) => (o === 0 ? "today" : o === 1 ? "tomorrow" : o === 2 ? "day after tomorrow" : w),
  hi: (o, w) => (o === 0 ? "आज" : o === 1 ? "कल" : o === 2 ? "परसों" : w),
};

const EN = {
  greetOutbound: (part: DayPart, name?: string) => [
    `Good ${part}${name ? `, ${name}` : ""}!`,
    "This is the Multi Solar Voice Agent, an AI assistant from Multi Solar. This call may be recorded for quality.",
    "You had enquired about rooftop solar. Is this a good time to talk for two minutes?",
  ],
  greetInbound: (part: DayPart) => [
    `Namaste, and good ${part}! Welcome to Multi Solar.`,
    "I'm the Multi Solar Voice Agent, an AI assistant, and this call may be recorded.",
    "Would you like to talk in Hindi or English?",
  ],
  greetInboundKnown: (part: DayPart, name: string) => [
    `Good ${part}, ${name}! Welcome back to Multi Solar.`,
    "I'm the Multi Solar Voice Agent, an AI assistant, and this call may be recorded.",
  ],
  switched: "Sure, I'll continue in English.",
  askSegment: "Is the solar system for your home, for a shop or office, or for a factory?",
  askBill: "What is your average monthly electricity bill, roughly?",
  askBillAgain: "Even a rough figure is fine, for example two thousand or five thousand rupees.",
  askLocation: "Which city are you in? Your PIN code also works.",
  recommend: (bill: string, kw: number, r1: number, r2: number, u1: number, u2: number) => [
    `For a bill of about ${bill}, a system of around ${kw} kW should suit you.`,
    `It needs roughly ${r1} to ${r2} square feet of shadow-free roof and makes about ${u1} to ${u2} units a month.`,
  ],
  price: (kw: number, lo: string, hi: string) => `The indicative price for a ${kw} kW system is ${lo} to ${hi} before subsidy.`,
  subsidy: (amount: string) => `Under PM Surya Ghar you can get up to ${amount} central subsidy, credited to your bank account after installation.`,
  noSubsidy: "This size is not covered by the residential subsidy, so the price shown is the full price.",
  finalNote: "The final quote comes after a free site survey.",
  noPrice: (kw: number) => `For a ${kw} kW system our team will share the exact price after a free site survey.`,
  businessQuote: "For shops, offices and factories, our engineer prepares a custom design and quote after a free site survey.",
  offerVisit: "Shall I book a free site survey for you?",
  askVisitTime: "Which day suits you, and morning, afternoon or evening?",
  askVisitSlot: "Morning, afternoon or evening?",
  visitBooked: (label: string) => `Done! Your free site survey is booked for ${label}. Our team will call before visiting.`,
  anythingElse: "Is there anything else you'd like to know?",
  closing: "Thank you for your time. Have a great day!",
  callbackAsk: "No problem. When should I call you back?",
  callbackDone: (label: string) => `Sure, I'll call you back ${label}. Thank you!`,
  notInterested: "I understand. Thank you for your time. If you ever need solar advice, just call us. Have a good day!",
  dnc: "Sorry for the trouble. I've removed your number and we won't call again. Have a good day.",
  wrongNumber: "Sorry for disturbing you. I'll update our records. Have a good day.",
  escalate: (h: number) => `That's a good question, and our expert will answer it better. Our sales team will call you within ${h} hours on this number.`,
  negotiation: (h: number) => `I can't change prices myself. Our sales team will call you within ${h} hours to discuss the best offer.`,
  humanRequested: (h: number) => `Sure. I've asked our sales team to call you within ${h} hours on this number.`,
  upset: (h: number) => `I'm sorry about that. A senior member of our team will call you within ${h} hours to sort it out.`,
  notUnderstood: "Sorry, I didn't catch that. Could you say it again?",
  knowledgeLead: "",
  subsidyGeneral: (amount: string) => `Homes can get PM Surya Ghar central subsidy of up to ${amount}, depending on system size.`,
  priceNeedsBill: "The price depends on the system size. Tell me your monthly bill and I'll suggest the right size.",
};

const HI: typeof EN = {
  greetOutbound: (_part, name) => [
    `नमस्ते${name ? ` ${name} जी` : ""}!`,
    "मैं मल्टी सोलर की AI असिस्टेंट बोल रही हूँ। यह कॉल क्वालिटी के लिए रिकॉर्ड हो सकती है।",
    "आपने रूफटॉप सोलर के बारे में पूछा था। क्या अभी दो मिनट बात कर सकते हैं?",
  ],
  greetInbound: () => [
    "नमस्ते! मल्टी सोलर में आपका स्वागत है।",
    "मैं मल्टी सोलर की AI असिस्टेंट हूँ, यह कॉल रिकॉर्ड हो सकती है।",
    "आप हिंदी में बात करेंगे या English में?",
  ],
  greetInboundKnown: (_part, name) => [
    `नमस्ते ${name} जी! मल्टी सोलर में आपका फिर से स्वागत है।`,
    "मैं मल्टी सोलर की AI असिस्टेंट हूँ, यह कॉल रिकॉर्ड हो सकती है।",
  ],
  switched: "जी, मैं हिंदी में बात करती हूँ।",
  askSegment: "सोलर सिस्टम आपके घर के लिए चाहिए, दुकान या ऑफिस के लिए, या फैक्ट्री के लिए?",
  askBill: "आपका महीने का बिजली का बिल लगभग कितना आता है?",
  askBillAgain: "अंदाज़े से भी बता सकते हैं, जैसे दो हज़ार या पाँच हज़ार रुपये।",
  askLocation: "आप किस शहर में हैं? पिन कोड भी बता सकते हैं।",
  recommend: (bill, kw, r1, r2, u1, u2) => [
    `लगभग ${bill} के बिल के लिए करीब ${kw} किलोवाट का सिस्टम ठीक रहेगा।`,
    `इसके लिए लगभग ${r1} से ${r2} वर्ग फुट छाया-रहित छत चाहिए, और यह महीने में करीब ${u1} से ${u2} यूनिट बिजली बनाएगा।`,
  ],
  price: (kw, lo, hi) => `${kw} किलोवाट सिस्टम की अनुमानित कीमत सब्सिडी से पहले ${lo} से ${hi} है।`,
  subsidy: (amount) => `पीएम सूर्य घर योजना में आपको ${amount} तक की केंद्रीय सब्सिडी मिल सकती है, जो इंस्टॉलेशन के बाद आपके बैंक खाते में आती है।`,
  noSubsidy: "इस साइज़ पर घरेलू सब्सिडी लागू नहीं होती, इसलिए यही पूरी कीमत है।",
  finalNote: "फाइनल कोटेशन फ्री साइट सर्वे के बाद मिलेगा।",
  noPrice: (kw) => `${kw} किलोवाट सिस्टम की सही कीमत हमारी टीम फ्री साइट सर्वे के बाद बताएगी।`,
  businessQuote: "दुकान, ऑफिस और फैक्ट्री के लिए हमारे इंजीनियर फ्री साइट सर्वे के बाद अलग डिज़ाइन और कोटेशन बनाते हैं।",
  offerVisit: "क्या मैं आपके लिए फ्री साइट सर्वे बुक कर दूँ?",
  askVisitTime: "कौन सा दिन ठीक रहेगा, और सुबह, दोपहर या शाम?",
  askVisitSlot: "सुबह, दोपहर या शाम?",
  visitBooked: (label) => `हो गया! आपका फ्री साइट सर्वे ${label} के लिए बुक है। हमारी टीम आने से पहले कॉल करेगी।`,
  anythingElse: "क्या आप और कुछ जानना चाहेंगे?",
  closing: "आपके समय के लिए धन्यवाद। आपका दिन शुभ हो!",
  callbackAsk: "कोई बात नहीं। मैं आपको कब कॉल करूँ?",
  callbackDone: (label) => `ठीक है, मैं आपको ${label} कॉल करूँगी। धन्यवाद!`,
  notInterested: "मैं समझती हूँ। आपके समय के लिए धन्यवाद। कभी सोलर की जानकारी चाहिए तो हमें कॉल कीजिए। आपका दिन शुभ हो!",
  dnc: "परेशानी के लिए माफ़ी। मैंने आपका नंबर हटा दिया है, अब हम कॉल नहीं करेंगे। आपका दिन शुभ हो।",
  wrongNumber: "परेशान करने के लिए माफ़ी। मैं हमारे रिकॉर्ड ठीक कर देती हूँ। आपका दिन शुभ हो।",
  escalate: (h) => `यह अच्छा सवाल है, इसका सही जवाब हमारे एक्सपर्ट देंगे। हमारी सेल्स टीम ${h} घंटे के अंदर इसी नंबर पर आपको कॉल करेगी।`,
  negotiation: (h) => `कीमत मैं खुद नहीं बदल सकती। हमारी सेल्स टीम ${h} घंटे के अंदर आपको सबसे अच्छे ऑफ़र के लिए कॉल करेगी।`,
  humanRequested: (h) => `जी ज़रूर। मैंने हमारी सेल्स टीम को बता दिया है, वे ${h} घंटे के अंदर इसी नंबर पर आपको कॉल करेंगे।`,
  upset: (h) => `इसके लिए माफ़ी चाहती हूँ। हमारी टीम के एक सीनियर सदस्य ${h} घंटे के अंदर आपको कॉल करके इसे ठीक करेंगे।`,
  notUnderstood: "माफ़ कीजिए, मैं ठीक से सुन नहीं पाई। क्या आप दोबारा बता सकते हैं?",
  knowledgeLead: "हमारी जानकारी के अनुसार:",
  subsidyGeneral: (amount) => `घर के लिए पीएम सूर्य घर योजना में सिस्टम साइज़ के हिसाब से ${amount} तक की केंद्रीय सब्सिडी मिल सकती है।`,
  priceNeedsBill: "कीमत सिस्टम के साइज़ पर निर्भर करती है। अपना महीने का बिल बताइए, मैं सही साइज़ बताती हूँ।",
};

export const MESSAGES: Record<CallLang, typeof EN> = { en: EN, hi: HI };

export function dayPart(now: Date, timeZone = "Asia/Kolkata"): DayPart {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone }).format(now));
  // Late night (after midnight, before 4 am) still reads as evening to callers.
  return h >= 4 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : "evening";
}
