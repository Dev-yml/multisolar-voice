import type { CallLang } from "@msv/core";
import { getSettings, ttsVoice } from "@msv/data";
import { config } from "../config";
import { mulawSilence, parseWav, pcmToMulaw, resample, wavFromPcm } from "../audio";

/** Ears: telephone audio (8 kHz PCM) → text. */
export interface SpeechToText {
  transcribe(pcm8k: Int16Array): Promise<{ text: string; lang?: string }>;
}

/** Mouth: text → telephone audio (µ-law, 8 kHz). */
export interface TextToSpeech {
  synth(text: string, lang: CallLang): Promise<Buffer>;
}

// ---------------------------------------------------------------- Sarvam

const SARVAM = "https://api.sarvam.ai";

export class SarvamSTT implements SpeechToText {
  constructor(private key: string) {}

  async transcribe(pcm8k: Int16Array) {
    const wav = wavFromPcm(resample(pcm8k, 8000, 16000), 16000); // Sarvam works best at 16 kHz
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "speech.wav");
    form.append("language_code", "unknown"); // auto-detect: English, Hindi, Hinglish
    if (config.sarvam.sttModel) form.append("model", config.sarvam.sttModel);
    const call = () =>
      fetch(`${SARVAM}/speech-to-text`, {
        method: "POST",
        headers: { "api-subscription-key": this.key },
        body: form,
        signal: AbortSignal.timeout(8000),
      });
    let res = await call();
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 700));
      res = await call();
    }
    if (!res.ok) throw new Error(`Sarvam STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { transcript?: string; language_code?: string | null };
    return { text: (j.transcript ?? "").trim(), lang: j.language_code ?? undefined };
  }
}

export class SarvamTTS implements TextToSpeech {
  private cache = new Map<string, Buffer>();
  private voiceAt = 0;
  private voice: { model: string; speaker?: string } = { model: "bulbul:v3" };
  constructor(private key: string) {}

  /** Voice chosen in Agent settings (re-read every minute). SARVAM_TTS_MODEL / _SPEAKER override it. */
  private async currentVoice() {
    if (Date.now() - this.voiceAt > 60_000) {
      try {
        this.voice = ttsVoice(await getSettings());
      } catch {
        /* keep the last known voice */
      }
      this.voiceAt = Date.now();
    }
    return { model: config.sarvam.ttsModel ?? this.voice.model, speaker: config.sarvam.ttsSpeaker ?? this.voice.speaker };
  }

  async synth(text: string, lang: CallLang) {
    const voice = await this.currentVoice();
    const k = `${voice.model}|${voice.speaker}|${lang}|${text}`;
    const hit = this.cache.get(k);
    if (hit) return hit;
    const code = lang === "hi" ? "hi-IN" : "en-IN";
    const body: Record<string, unknown> = {
      text,
      // The current API calls this language_code; older versions target_language_code. Send both.
      language_code: code,
      target_language_code: code,
      speech_sample_rate: 8000,
      model: voice.model,
    };
    if (voice.speaker) body.speaker = voice.speaker;
    if (config.sarvam.ttsPace) body.pace = config.sarvam.ttsPace;
    const call = () =>
      fetch(`${SARVAM}/text-to-speech`, {
        method: "POST",
        headers: { "api-subscription-key": this.key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    let res = await call();
    // Rate limit (several calls at once on the Starter plan): wait a moment and try once more.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 900));
      res = await call();
    }
    if (!res.ok) throw new Error(`Sarvam TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { audios?: string[] };
    const parts = (j.audios ?? []).map((b64) => {
      const { rate, pcm } = parseWav(Buffer.from(b64, "base64"));
      return pcmToMulaw(resample(pcm, rate, 8000));
    });
    const out = Buffer.concat(parts);
    if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(k, out);
    return out;
  }
}

// ---------------------------------------------------------------- Mock (no keys needed)

/** Simulation: the fake customer sends its words as text, so nothing is transcribed. */
export class MockSTT implements SpeechToText {
  async transcribe() {
    return { text: "" };
  }
}

/** Simulation: silence as long as the sentence would take to say (~14 characters per second). */
export class MockTTS implements TextToSpeech {
  async synth(text: string) {
    return mulawSilence(Math.min(8000, Math.max(400, text.length * 70)));
  }
}

export function speechProviders(): { stt: SpeechToText; tts: TextToSpeech; name: string } {
  if (config.speech === "sarvam" && config.sarvamKey) {
    return { stt: new SarvamSTT(config.sarvamKey), tts: new SarvamTTS(config.sarvamKey), name: "sarvam" };
  }
  return { stt: new MockSTT(), tts: new MockTTS(), name: "mock" };
}
