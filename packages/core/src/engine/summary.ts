import { formatINR } from "../pricing";
import type { CallState } from "../types";

const OUTCOME_TEXT: Record<string, string> = {
  SITE_VISIT_BOOKED: "Site survey booked",
  INTERESTED: "Interested, no survey booked yet",
  CALLBACK: "Asked for a callback",
  NOT_INTERESTED: "Not interested",
  ESCALATED: "Handed to the sales team",
  DNC: "Asked not to be called again",
  WRONG_NUMBER: "Wrong number",
  COMPLETED: "Call completed",
};

/** Plain-English call summary built from the saved call state (no AI needed). */
export function summarizeCall(state: CallState): string {
  const s = state.slots;
  const lines: string[] = [];
  lines.push(`${state.direction === "OUTBOUND" ? "Outbound" : "Inbound"} call${s.name ? ` with ${s.name}` : ""}. Outcome: ${OUTCOME_TEXT[state.outcome ?? "COMPLETED"] ?? state.outcome}.`);
  const lang = state.lang === "hi" ? "Hindi" : "English";
  lines.push(state.lang !== state.startLang ? `Spoke ${lang} (switched from ${state.startLang === "hi" ? "Hindi" : "English"}).` : `Spoke ${lang}.`);
  const facts: string[] = [];
  if (s.segment) facts.push(s.segment.toLowerCase());
  if (s.monthlyBill) facts.push(`bill about ${formatINR(s.monthlyBill)}/month`);
  if (s.city) facts.push(s.city);
  if (s.pincode) facts.push(`PIN ${s.pincode}`);
  if (s.kw) facts.push(`suggested ~${s.kw} kW`);
  if (facts.length) lines.push(`Details: ${facts.join(", ")}.`);
  for (const note of state.notes) if (!note.startsWith("Language switched")) lines.push(note);
  return lines.join(" ");
}
