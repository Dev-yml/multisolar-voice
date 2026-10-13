import "server-only";

/** The always-on Voice Agent server (Fly.io / Railway). Set VOICE_SERVER_URL once it is deployed. */
const base = () => process.env.VOICE_SERVER_URL?.replace(/\/$/, "");

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  const url = base();
  if (!url) return null;
  try {
    const res = await fetch(`${url}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "x-agent-key": process.env.AGENT_API_KEY ?? "", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type VoiceStatus = { enabled: boolean; inHours: boolean; underBudget: boolean; spentRupees: number; active: number; freeSlots: number; canDial: boolean; speech: string; line: string };

export const voiceServerConfigured = () => Boolean(base());
export const voiceStatus = () => call<VoiceStatus>("/status");
export const dialLead = (leadId: number) => call<{ ok: boolean; message?: string; callId?: number }>("/dial", { method: "POST", body: JSON.stringify({ leadId }) });
