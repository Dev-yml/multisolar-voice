/**
 * Ten pretend customers for the "10 calls a day" simulation. Each has what happens on each
 * attempt (answer / no-answer / busy) and what they say when they answer.
 */
export type Outcome = "answer" | "no-answer" | "busy";
export type Persona = { phone: string; name: string; city: string; attempts: Outcome[]; lines: string[]; expect: string };

export const PERSONAS: Persona[] = [
  { phone: "9000000101", name: "Vinay (sim)", city: "Gurgaon", attempts: ["answer"], expect: "Hindi, books a site visit, asks about battery",
    lines: ["Haan ji, boliye", "ghar ke liye", "teen-saade teen hazaar", "Gurgaon", "haan, kal shaam", "Battery backup bhi milega kya?", "nahi bas, dhanyavaad"] },
  { phone: "9000000102", name: "Priya (sim)", city: "Noida", attempts: ["answer"], expect: "English, interested, no visit yet",
    lines: ["Yes, tell me", "For my home", "around 2000 rupees", "Noida", "No, not now", "No, thank you"] },
  { phone: "9000000103", name: "Rakesh (sim)", city: "Ludhiana", attempts: ["answer"], expect: "Hindi, factory → custom quote, survey booked",
    lines: ["haan bataiye", "meri factory ke liye", "pachas hazaar", "Ludhiana", "haan, parson subah", "nahi, bas itna hi"] },
  { phone: "9000000104", name: "Suresh (sim)", city: "Jaipur", attempts: ["answer"], expect: "busy now → callback tomorrow morning",
    lines: ["abhi busy hoon, kal subah call karna"] },
  { phone: "9000000105", name: "Anjali (sim)", city: "Delhi", attempts: ["answer"], expect: "not interested",
    lines: ["No, I'm not interested"] },
  { phone: "9000000106", name: "Mohit (sim)", city: "Faridabad", attempts: ["answer"], expect: "asks never to be called → Do-Not-Call",
    lines: ["please don't call me again"] },
  { phone: "9000000107", name: "Neha (sim)", city: "Pune", attempts: ["answer"], expect: "asks for a discount → sales callback in 48 h",
    lines: ["Yes", "home", "5000", "Pune", "Can you give some discount?", "No, thank you"] },
  { phone: "9000000108", name: "Arun (sim)", city: "Lucknow", attempts: ["no-answer", "no-answer", "answer"], expect: "answers on the 3rd try, books a visit",
    lines: ["haan ji", "ghar ke liye", "chaar hazaar", "Lucknow", "haan, kal subah", "nahi, dhanyavaad"] },
  { phone: "9000000109", name: "Kavita (sim)", city: "Indore", attempts: ["busy", "busy", "busy"], expect: "busy on all 3 tries → stops" , lines: [] },
  { phone: "9000000110", name: "Deepak (sim)", city: "Bhopal", attempts: ["no-answer", "no-answer", "no-answer"], expect: "never answers → stops after 3", lines: [] },
];

export const personaByPhone = (phone: string) => PERSONAS.find((p) => phone.endsWith(p.phone));
