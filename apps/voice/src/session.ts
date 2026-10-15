import type { WebSocket } from "ws";
import { speechSentences, type CallLang, type Outcome, type Team } from "@msv/core";
import { callTurn, endCall, pressKey, prisma, startCall } from "@msv/data";
import { frames, mulawToPcm, rms } from "./audio";
import { config } from "./config";
import type { PhoneLine } from "./phone-line";
import type { SpeechToText, TextToSpeech } from "./providers/speech";

/**
 * One live phone call: Smartflo voice stream ⇄ (Sarvam ears → agent brain → Sarvam mouth).
 *
 *   caller audio ─► voice-activity detection ─► speech-to-text ─► callTurn() ─► text-to-speech ─► caller
 *
 * - Barge-in: if the caller talks over the agent, the agent stops ("clear") and drops the rest of that reply.
 * - Fast replies: with the AI brain, each sentence is spoken as soon as it is written.
 * - Keypad: 1 = Sales, 2 = Sales Head, 3 = Customer care — offered at the end of the call, accepted any time.
 *   The call ends and Smartflo rings the team member, then the customer.
 * - Time limit: the AI wraps up near the target length; the call is closed 45 s after it.
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
const TIME_UP: Record<CallLang, string> = {
  en: "We're almost out of time. Our sales team will call you with all the details. Thank you!",
  hi: "हमारा समय लगभग पूरा हो गया है। पूरी जानकारी के लिए हमारी सेल्स टीम आपको कॉल करेगी। धन्यवाद!",
};
const KEY_NAME: Record<Team, Record<CallLang, string>> = {
  SALES: { en: "1 for sales", hi: "सेल्स के लिए 1" },
  SALES_HEAD: { en: "2 for the sales head", hi: "सेल्स हेड के लिए 2" },
  CRM: { en: "3 for customer care", hi: "कस्टमर केयर के लिए 3" },
};
function menuLine(teams: Team[], lang: CallLang) {
  const parts = teams.map((t) => KEY_NAME[t][lang]);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")}${lang === "hi" ? ", या " : ", or "}${parts[parts.length - 1]}` : parts[0];
  return lang === "hi" ? `हमारी टीम से बात करने के लिए ${list} दबाइए।` : `To speak to our team, press ${list}.`;
}
/** No keypad menu after these endings. */
const NO_MENU: Outcome[] = ["DNC", "WRONG_NUMBER", "NOT_INTERESTED"];

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
  private customer = "";
  private answeredAt = 0;
  private menu: Team[] = [];
  private menuOffered = false;
  private keyDeadline = 0;
  private maxCallSeconds = 0;
  private timeUp = false;
  private handOver: { team: Team; number: string } | null = null;
  /** Reply counter; a barge-in drops the rest of the reply that was being spoken. */
  private turnSeq = 0;
  private interruptedTurn = 0;

  // playback
  private pendingMarks = new Set<string>();
  private markSeq = 0;
  private lastActivity = Date.now();
  private prompted = false;
  private closing = false;

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
      case "dtmf": {
        // Smartflo sends the key the caller pressed; accept the usual field names.
        const m = msg as { dtmf?: { digit?: unknown } | string; digit?: unknown };
        const digit = String((typeof m.dtmf === "object" ? m.dtmf?.digit : m.dtmf) ?? m.digit ?? "").trim().slice(0, 1);
        if (digit) this.enqueue(() => this.onKey(digit));
        break;
      }
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
      // A new caller becomes a lead, so name, city, bill, visit and callback are saved against them.
      // They called us, so a callback they ask for may be dialled; the dialer never redials an answered lead otherwise.
      const mobile = last10(customer);
      if (!leadId && !outbound && !this.deps.sim && /^[6-9]\d{9}$/.test(mobile)) {
        const created = await prisma.lead.upsert({
          where: { phone: mobile },
          update: {},
          create: { phone: mobile, source: "inbound_call", consentAt: new Date() },
        });
        leadId = created.id;
      }
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
    this.customer = last10(customer);
    this.answeredAt = Date.now();
    this.menu = res.menu;
    this.maxCallSeconds = res.maxCallSeconds;
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
        // Barge-in: the caller talks over the agent → stop the agent's audio and the rest of that reply.
        if (this.speaking && this.speechMs >= v.bargeInMs) {
          this.send({ event: "clear", streamSid: this.streamSid });
          this.pendingMarks.clear();
          this.interruptedTurn = this.turnSeq;
          if (!this.handOver) this.endAfterSpeech = false;
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
    if (this.ended || !this.callId || !text.trim() || this.keyDeadline) return;
    this.prompted = false;
    const turn = ++this.turnSeq;
    // The AI brain hands over each sentence as soon as it is written: speak it right away.
    let speaking: Promise<void> = Promise.resolve();
    const res = await callTurn(this.callId, text, {
      onSay: (sentence, lang) => {
        speaking = speaking.then(() => (this.interruptedTurn === turn ? undefined : this.say([sentence], lang)));
      },
    });
    await speaking;
    this.lang = res.state.lang;
    if (!res.spoken && this.interruptedTurn !== turn) await this.say(res.say, res.state.lang);
    await this.afterReply(res);
  }

  /** After the agent's reply: hand over to a person, offer the keypad menu, or end. */
  private async afterReply(res: { end: boolean; state: { outcome?: Outcome; lang: CallLang }; transfer?: { team: Team; number: string } }) {
    if (res.transfer) {
      this.handOver = res.transfer;
      this.endAfterSpeech = true;
      if (!this.speaking) this.hangup();
      return;
    }
    if (!res.end) return;
    const outcome = res.state.outcome;
    if (this.menu.length && !this.menuOffered && !(outcome && NO_MENU.includes(outcome))) {
      this.menuOffered = true;
      await this.say([menuLine(this.menu, res.state.lang)], res.state.lang);
      this.keyDeadline = Date.now() + 8000; // wait for a key, then hang up
      return;
    }
    this.endAfterSpeech = true;
    if (!this.speaking) this.hangup();
  }

  /** Keypad: 1 Sales, 2 Sales Head, 3 Customer care. */
  private async onKey(digit: string) {
    if (this.ended || !this.callId || this.handOver) return;
    const res = await pressKey(this.callId, digit);
    if (!res) return;
    this.deps.log(`call ${this.callId}: caller pressed ${digit}`);
    this.keyDeadline = 0;
    if (this.speaking) {
      this.send({ event: "clear", streamSid: this.streamSid });
      this.pendingMarks.clear();
    }
    this.interruptedTurn = this.turnSeq;
    await this.say(res.say, res.state.lang);
    if (res.transfer) this.handOver = res.transfer;
    this.endAfterSpeech = true;
    if (!this.speaking) this.hangup();
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
    if (this.ended || !this.callId) return;
    // Keypad menu offered and no key pressed: end the call.
    if (this.keyDeadline && !this.speaking && Date.now() > this.keyDeadline) {
      this.keyDeadline = 0;
      this.hangup();
      return;
    }
    // Hard time limit (the AI is already asked to wrap up before the target length).
    if (this.maxCallSeconds && !this.timeUp && !this.endAfterSpeech && !this.keyDeadline && !this.speaking && !this.inSpeech &&
        Date.now() - this.answeredAt > (this.maxCallSeconds + 45) * 1000) {
      this.timeUp = true;
      this.endAfterSpeech = true;
      const id = this.callId;
      this.enqueue(async () => {
        await this.say([TIME_UP[this.lang]], this.lang);
        await endCall(id, "Time limit reached");
        if (!this.speaking) this.hangup();
      });
      return;
    }
    if (this.speaking || this.inSpeech || this.endAfterSpeech || this.keyDeadline) return;
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
    if (this.ended || this.closing) return;
    this.closing = true;
    // Give the last audio a moment, then end the call.
    setTimeout(async () => {
      if (this.providerCallId && this.deps.line?.hangup) await this.deps.line.hangup(this.providerCallId).catch(() => undefined);
      this.ws.close(1000, "done");
      const h = this.handOver;
      if (h && this.customer && this.callId && this.deps.line?.bridge) {
        // The customer's line is free now: ring the team member, then the customer.
        setTimeout(() => {
          this.deps.line!.bridge!({ agentNumber: h.number, customerNumber: this.customer, callId: this.callId! })
            .then(() => this.deps.log(`call ${this.callId}: handed over to ${h.team}`))
            .catch((e) => this.deps.log(`call ${this.callId}: hand-over failed (${e instanceof Error ? e.message : e}) — escalation is on the board`));
        }, 1500);
      }
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
