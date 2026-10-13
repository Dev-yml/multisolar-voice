import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth/guard";
import { hit } from "@/lib/rate-limit";

/**
 * Natural voice for browser test calls: the agent's sentence → Sarvam AI text-to-speech (the same voice
 * that real phone calls use, at higher quality because the browser is not a phone line).
 * The API key stays on the server. Without SARVAM_API_KEY the page falls back to the browser's voice.
 */

const Body = z.object({ text: z.string().trim().min(1).max(800), lang: z.enum(["en", "hi"]) });

const cache = new Map<string, string[]>(); // greetings and common replies repeat — don't pay twice

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const key = process.env.SARVAM_API_KEY;
  if (!key) return NextResponse.json({ message: "Sarvam is not set up" }, { status: 501 });
  if (!hit(`tc-voice:${user.id}`, 400, 10 * 60_000).ok) return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Invalid request" }, { status: 400 });

  const { text, lang } = parsed.data;
  const ck = `${lang}|${text}`;
  const cached = cache.get(ck);
  if (cached) return NextResponse.json({ audios: cached });

  const code = lang === "hi" ? "hi-IN" : "en-IN";
  const body: Record<string, unknown> = { text, language_code: code, target_language_code: code, speech_sample_rate: 24000 };
  if (process.env.SARVAM_TTS_MODEL) body.model = process.env.SARVAM_TTS_MODEL;
  if (process.env.SARVAM_TTS_SPEAKER) body.speaker = process.env.SARVAM_TTS_SPEAKER;
  if (process.env.SARVAM_TTS_PACE) body.pace = Number(process.env.SARVAM_TTS_PACE);

  try {
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[test-call] Sarvam TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return NextResponse.json({ message: "Sarvam could not create the voice" }, { status: 502 });
    }
    const audios = ((await res.json()) as { audios?: string[] }).audios ?? [];
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    cache.set(ck, audios);
    return NextResponse.json({ audios });
  } catch (e) {
    console.error("[test-call] Sarvam TTS failed:", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ message: "Sarvam did not answer in time" }, { status: 504 });
  }
}
