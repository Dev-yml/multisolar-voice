import type { WebSocket } from "ws";
import { speechSentences, type CallLang } from "@msv/core";
import { callTurn, endCall, prisma, startCall } from "@msv/data";
import { frames, mulawToPcm, rms } from "./audio";
import { config } from "./config";
import type { PhoneLine } from "./phone-line";
import type { SpeechToText, TextToSpeech } from "./providers/speech";

/**
 * One live phone call: Smartflo voice stream ⇄ (Sarvam ears → agent brain → Sarvam mouth).
 *
 *   caller audio ─► voice-activity detection ─► speech-to-text ─► callTurn() ─► text-to-speech ─► caller
 *
 * - Barge-in: if the caller talks over the agent, the agent stops ("clear").
 * - Silence: after a pause the agent asks once if the caller is there, then ends politely.
 * - Every turn is saved by callTurn(), exactly like a browser test call.
 */

type StartEvent = {
  streamSid?: string;
  start?: {
    streamSid?: string;
    callSid?: string;
    from?: string;
    to?: string;
    direction?: string;
    customParameters?: Record<string, string>;
  };
};

const last10 = (n?: string | null) => (n ?? "").replace(/\D/g, "").slice(-10);
const FRAME = 160; // 20 ms at 8 kHz

const SILENCE_PROMPT: Record<CallLang, string> = { en: "Hello, can you hear me?", hi: "हेलो, क्या आप मुझे सुन पा रहे हैं?" };
const SILENCE_BYE: Record<CallLang, string> = {
  en: "I can't hear you. Our team will call you back. Thank you!",
  hi: "आपकी आवाज़ नहीं आ रही। हमारी टीम आपको दोबारा कॉल करेगी। धन्यवाद!",
};

export class CallSession {
  private streamSid = "";
  private providerCallId = "";
  private callId: number | null = null;
  private lang: CallLang = "en";
  private ended = false;
  private endAfterSpeech = false;
  private queue: Promise<void> = Promise.resolve();

  // playback
  private pendingMarks = new Set<string>();
  private markSeq = 0;
  private lastActivity = Date.now();
  private prompted = false;

  // voice activity detection
  private noise = 200;
  private voicedRun = 0;
  private silentMs = 0;
  private inSpeech = false;
  private speechMs = 0;
  private chunks: Int16Array[] = [];
  private timer: NodeJS.Timeout;

  constructor(
    private ws: WebSocket,
    private deps: { stt: SpeechToText; tts: TextToSpeech; line?: PhoneLine; sim: boolean; log: (m: string) => void },
  ) {
    this.timer = setInterval(() => this.watchSilence(), 1000);
    ws.on("message", (data) => this.onMessage(data.toString()));
    ws.on("close", () => this.finish("Caller hung up"));
    ws.on("error", (e) => deps.log(`ws error: ${e.message}`));
  }

  private get speaking() {
    return this.pendingMarks.size > 0;
  }

  private send(obj: unknown) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private onMessage(raw: string) {
    let msg: { event?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.event) {
      case "start":
        this.enqueue(() => this.onStart(msg as StartEvent));
        break;
      case "media":
        this.onMedia((msg as { media?: { payload?: string } }).media?.payload);
        break;
      case "mark": {
        const name = (msg as { mark?: { name?: string } }).mark?.name;
        if (name) this.pendingMarks.delete(name);
        if (!this.speaking) {
          this.lastActivity = Date.now();
          if (this.endAfterSpeech) this.hangup();
        }
        break;
      }
      case "stop":
        this.finish("Caller hung up");
        break;
      case "sim_text":
        // Simulator only: the fake customer "says" this.
        if (this.deps.sim) this.enqueue(() => this.handleText(String((msg as { text?: string }).text ?? "")));
        break;
    }
  }

  private enqueue(job: () => Promise<void>) {
    this.queue = this.queue.then(job).catch((e) => this.deps.log(`call ${this.callId}: ${e instanceof Error ? e.message : e}`));
  }

  // ------------------------------------------------------------ call start

  private async onStart(ev: StartEvent) {
    const s = ev.start ?? {};
    this.streamSid = ev.streamSid ?? s.streamSid ?? "";
    this.providerCallId = s.callSid ?? "";
    const outbound = /out/i.test(s.direction ?? "");
    const customer = outbound ? s.to : s.from;
    const ourId = Number(s.customParameters?.msv_call_id) || null;

    // Outbound calls were created by the dialer: find that row (by id, else by number).
    let callId = ourId;
    if (!callId && outbound) {
      const pending = await prisma.call.findFirst({
        where: { direction: "OUTBOUND", endedAt: null, answeredAt: null, toNumber: { endsWith: last10(customer) }, startedAt: { gte: new Date(Date.now() - 15 * 60_000) } },
        orderBy: { startedAt: "desc" },
      });
      callId = pending?.id ?? null;
    }
    let leadId: number | null = null;
    if (!callId) {
      const lead = last10(customer) ? await prisma.lead.findFirst({ where: { phone: { endsWith: last10(customer) } } }) : null;
      leadId = lead?.id ?? null;
    }
    const res = await startCall({
      direction: outbound ? "OUTBOUND" : "INBOUND",
      callId: callId ?? undefined,
      leadId,
      fromNumber: s.from,
      toNumber: s.to,
      isTest: this.deps.sim,
      providerCallId: this.providerCallId || undefined,
      answered: true,
    });
    this.callId = res.callId;
    this.lang = res.state.lang;
    this.deps.log(`call ${this.callId} connected (${outbound ? "outbound" : "inbound"}, ${last10(customer) ? "…" + last10(customer).slice(-4) : "unknown number"})`);
    await this.say(res.say, res.state.lang);
    if (res.end) this.endAfterSpeech = true;
  }

  // ------------------------------------------------------------ listening

  private onMedia(payload?: string) {
    if (!payload || this.ended || !this.callId) return;
    const pcm = mulawToPcm(Buffer.from(payload, "base64"));
    const v = config.vad;
    for (let i = 0; i + FRAME <= pcm.length; i += FRAME) {
      const level = rms(pcm, i, i + FRAME);
      const voiced = level > Math.max(v.minRms, this.noise * v.ratio);
      if (!voiced && !this.inSpeech) this.noise = this.noise * 0.95 + level * 0.05;

      if (voiced) {
        this.voicedRun += 20;
        this.silentMs = 0;
      } else {
        this.voicedRun = 0;
        if (this.inSpeech) this.silentMs += 20;
      }
      if (!this.inSpeech && this.voicedRun >= 60) {
        this.inSpeech = true;
        this.speechMs = 0;
        this.chunks = [];
      }
      if (this.inSpeech) {
        this.chunks.push(pcm.subarray(i, i + FRAME));
        this.speechMs += 20;
        this.lastActivity = Date.now();
        // Barge-in: the caller talks over the agent → stop the agent's audio.
        if (this.speaking && this.speechMs >= v.bargeInMs) {
          this.send({ event: "clear", streamSid: this.streamSid });
          this.pendingMarks.clear();
          this.endAfterSpeech = false;
        }
        if (this.silentMs >= v.endSilenceMs || this.speechMs >= v.maxUtteranceMs) {
          const audio = concat(this.chunks);
          this.inSpeech = false;
          this.chunks = [];
          if (this.speechMs - this.silentMs >= 250) this.enqueue(() => this.handleAudio(audio));
        }
      }
    }
  }

  private async handleAudio(pcm: Int16Array) {
    if (this.ended) return;
    const t0 = Date.now();
    const { text } = await this.deps.stt.transcribe(pcm);
    // What the caller said is stored in the call record — not in server logs (unless LOG_TRANSCRIPTS=1 for debugging).
    const said = process.env.LOG_TRANSCRIPTS === "1" ? `"${text}"` : `${text.length} chars`;
    this.deps.log(`call ${this.callId}: heard ${text ? said : "(nothing)"} in ${Date.now() - t0} ms`);
    if (text) await this.handleText(text);
  }

  private async handleText(text: string) {
    if (this.ended || !this.callId || !text.trim()) return;
    this.prompted = false;
    const res = await callTurn(this.callId, text);
    this.lang = res.state.lang;
    await this.say(res.say, res.state.lang);
    if (res.end) {
      this.endAfterSpeech = true;
      if (!this.speaking) this.hangup();
    }
  }

  // ------------------------------------------------------------ speaking

  private async say(sentences: string[], lang: CallLang) {
    for (const sentence of sentences) {
      for (const part of speechSentences(sentence, lang)) {
        if (this.ended) return;
        const audio = await this.deps.tts.synth(part, lang);
        for (const f of frames(audio)) this.send({ event: "media", streamSid: this.streamSid, media: { payload: f.toString("base64") } });
        const name = `m${++this.markSeq}`;
        this.pendingMarks.add(name);
        this.send({ event: "mark", streamSid: this.streamSid, mark: { name } });
      }
    }
    this.lastActivity = Date.now();
  }

  private watchSilence() {
    if (this.ended || !this.callId || this.speaking || this.inSpeech || this.endAfterSpeech) return;
    if (Date.now() - this.lastActivity < config.silenceTimeoutSec * 1000) return;
    this.lastActivity = Date.now();
    if (!this.prompted) {
      this.prompted = true;
      this.enqueue(() => this.say([SILENCE_PROMPT[this.lang]], this.lang));
    } else {
      this.endAfterSpeech = true;
      this.enqueue(async () => {
        await this.say([SILENCE_BYE[this.lang]], this.lang);
        if (this.callId) await endCall(this.callId, "No response from caller");
      });
    }
  }

  // ------------------------------------------------------------ ending

  private hangup() {
    if (this.ended) return;
    // Give the last audio a moment, then end the call.
    setTimeout(() => {
      if (this.providerCallId && this.deps.line?.hangup) void this.deps.line.hangup(this.providerCallId);
      this.ws.close(1000, "done");
    }, 400);
  }

  private finish(reason: string) {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.timer);
    const id = this.callId;
    this.queue = this.queue.then(async () => {
      if (id) await endCall(id, reason); // no-op if the agent already ended it
      this.deps.log(`call ${id} ended: ${reason}`);
    });
  }
}

function concat(parts: Int16Array[]) {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
