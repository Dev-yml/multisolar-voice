/** Sarvam text-to-speech voice choices (shared by the phone server and the browser test call). */

export const TTS_MODELS = [
  { id: "bulbul:v3", label: "Bulbul V3 — natural Indian voices (₹3 per 1,000 characters)" },
  { id: "bulbul:v4-flash", label: "Bulbul V4 Flash — lower cost (₹2 per 1,000 characters), persona voices" },
  { id: "bulbul:v2", label: "Bulbul V2 — older voices" },
] as const;

/** Speaker names Sarvam lists for bulbul:v3 (docs.sarvam.ai). Listen in Test call and pick one. */
export const V3_SPEAKERS = [
  "priya", "ritu", "neha", "pooja", "simran", "kavya", "ishita", "shreya", "roopa", "tanya", "shruti", "suhani", "kavitha", "rupali",
  "shubh", "aditya", "rahul", "rohan", "amit", "dev", "ratan", "varun", "manan", "sumit", "kabir", "aayan", "ashutosh", "advait",
  "anand", "tarun", "sunny", "mani", "gokul", "vijay", "mohit", "rehan", "soham",
];
export const V2_SPEAKERS = ["anushka", "manisha", "vidya", "arya", "abhilash", "karun", "hitesh"];

const DEFAULT_SPEAKER: Record<string, { female: string; male: string }> = {
  "bulbul:v3": { female: "priya", male: "rahul" },
  "bulbul:v2": { female: "anushka", male: "abhilash" },
};

/** Model + speaker to send to Sarvam. An empty speaker means "a default voice for the chosen gender". */
export function ttsVoice(s: { ttsModel?: string | null; ttsSpeaker?: string | null; voice?: string | null }) {
  const model = s.ttsModel?.trim() || "bulbul:v3";
  const speaker = s.ttsSpeaker?.trim().toLowerCase() || DEFAULT_SPEAKER[model]?.[s.voice === "male" ? "male" : "female"];
  return { model, speaker };
}
