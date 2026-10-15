import { createHmac } from "node:crypto";

/** All settings come from environment variables (.env locally, the host's settings in production). */
const env = (k: string) => process.env[k]?.trim() || undefined;

const port = Number(env("PORT") ?? 8080);
const agentKey = env("AGENT_API_KEY") ?? "";
const smartfloToken = env("SMARTFLO_API_TOKEN");

export const config = {
  port,
  /** Public https address of this server, e.g. https://msv-voice.fly.dev (used to build the wss:// URL). */
  publicUrl: (env("PUBLIC_URL") ?? `http://localhost:${port}`).replace(/\/$/, ""),
  agentKey,
  /** Key in the Voice Bot URL / dynamic endpoint / webhook URL so only Smartflo can reach them. */
  streamKey: env("STREAM_KEY") ?? (agentKey ? createHmac("sha256", agentKey).update("stream").digest("base64url").slice(0, 32) : ""),
  sarvamKey: env("SARVAM_API_KEY"),
  speech: (env("SPEECH_PROVIDER") ?? (env("SARVAM_API_KEY") ? "sarvam" : "mock")) as "sarvam" | "mock",
  sarvam: {
    sttModel: env("SARVAM_STT_MODEL"),
    ttsModel: env("SARVAM_TTS_MODEL"),
    ttsSpeaker: env("SARVAM_TTS_SPEAKER"),
    ttsPace: env("SARVAM_TTS_PACE") ? Number(env("SARVAM_TTS_PACE")) : undefined,
  },
  smartflo: {
    mode: (env("SMARTFLO_MODE") ?? (smartfloToken ? "live" : "sim")) as "live" | "sim",
    baseUrl: env("SMARTFLO_API_BASE") ?? "https://api-smartflo.tatateleservices.com",
    apiToken: smartfloToken,
    c2cKey: env("SMARTFLO_C2C_API_KEY"),
    callerId: env("SMARTFLO_CALLER_ID"),
    /** Several company numbers (comma-separated): outbound calls take turns using them as caller ID. */
    callerIds: (env("SMARTFLO_CALLER_IDS") ?? env("SMARTFLO_CALLER_ID") ?? "").split(",").map((n) => n.replace(/\D/g, "")).filter((n) => n.length >= 10),
    /** Click-to-Call (agent first, then customer) — used to connect a caller to Sales / Sales Head / CRM. */
    bridgePath: env("SMARTFLO_BRIDGE_PATH") ?? "/v1/click_to_call",
  },
  dialer: {
    enabled: env("DIALER") !== "off",
    tickMs: Number(env("DIALER_TICK_MS") ?? 15_000),
    ignoreHours: env("DIALER_IGNORE_HOURS") === "1",
    unansweredAfterSec: Number(env("DIALER_UNANSWERED_SEC") ?? 90),
  },
  vad: {
    /** Speech if a 20 ms frame is louder than max(minRms, noiseFloor × ratio). */
    minRms: Number(env("VAD_MIN_RMS") ?? 450),
    ratio: Number(env("VAD_RATIO") ?? 3),
    endSilenceMs: Number(env("VAD_END_SILENCE_MS") ?? 700),
    bargeInMs: Number(env("VAD_BARGE_IN_MS") ?? 400),
    maxUtteranceMs: 12_000,
  },
  /** Seconds of silence before the agent asks "are you there?", then hangs up. */
  silenceTimeoutSec: Number(env("SILENCE_TIMEOUT_SEC") ?? 9),
  /** Simulation: how fast fake audio "plays" (1 = real time). */
  simSpeed: Number(env("SIM_SPEED") ?? 1),
};

export function wsBase() {
  return config.publicUrl.replace(/^http/, "ws");
}

/** Per-call token for the dynamic endpoint's wss URL. */
export function signCall(callRef: string) {
  return createHmac("sha256", config.streamKey || "dev").update(`call:${callRef}`).digest("base64url").slice(0, 32);
}

export function assertConfig() {
  const problems: string[] = [];
  if (agentKey.length < 32) problems.push("AGENT_API_KEY must be set (32+ characters, same as the Console's)");
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL must be set (Supabase transaction pooler)");
  if (config.speech === "sarvam" && !config.sarvamKey) problems.push("SARVAM_API_KEY is missing");
  if (config.smartflo.mode === "live" && (!config.smartflo.apiToken || !config.smartflo.c2cKey))
    problems.push("SMARTFLO_API_TOKEN and SMARTFLO_C2C_API_KEY are needed for live outbound calls");
  return problems;
}
