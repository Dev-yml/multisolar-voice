import { WebSocket } from "ws";
import { prisma } from "@msv/data";
import { config, wsBase } from "../config";
import type { DialRequest, PhoneLine } from "../phone-line";
import { personaByPhone } from "./personas";

/**
 * A pretend Tata Smartflo for testing without a phone line. When the dialer "dials", it:
 *  - for no-answer / busy: posts the same webhook Smartflo would send;
 *  - for answer: opens the voice stream to our server exactly like Smartflo (connected → start →
 *    media/mark), "plays" the agent's audio in (scaled) real time, and speaks the persona's lines.
 */
export class SimulatedLine implements PhoneLine {
  name = "simulator";

  constructor(private opts: { log: (m: string) => void }) {}

  async bridge({ agentNumber, callId }: { agentNumber: string; customerNumber: string; callId: number }) {
    this.opts.log(`sim: call ${callId} handed over — would ring the team on …${agentNumber.slice(-4)}, then the customer`);
  }

  async dial({ callId, phone }: DialRequest) {
    const refId = `SIM-${callId}`;
    const persona = personaByPhone(phone);
    const lead = await prisma.lead.findFirst({ where: { phone: { endsWith: phone.slice(-10) } }, select: { attempts: true } });
    const attempt = Math.max(1, lead?.attempts ?? 1);
    const outcome = persona ? (persona.attempts[attempt - 1] ?? persona.attempts.at(-1) ?? "answer") : "no-answer";
    setTimeout(() => {
      if (outcome === "answer") void this.answer(callId, phone, persona?.lines ?? []);
      else void this.webhook({ ref_id: refId, call_status: outcome === "busy" ? "busy" : "missed", hangup_cause: outcome === "busy" ? "USER_BUSY" : "NO_ANSWER" });
    }, 600);
    return { refId };
  }

  private async webhook(body: Record<string, unknown>) {
    await fetch(`${config.publicUrl}/smartflo/webhook?key=${encodeURIComponent(config.streamKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((e) => this.opts.log(`sim webhook failed: ${e.message}`));
  }

  private answer(callId: number, phone: string, lines: string[]) {
    return new Promise<void>((resolve) => {
      const ws = new WebSocket(`${wsBase()}/stream?key=${encodeURIComponent(config.streamKey)}`);
      const streamSid = `SIMSTREAM${callId}`;
      const speed = config.simSpeed;
      let bytes = 0;
      let pending = 0;
      let heardSinceLastLine = false;
      let next = 0;
      let turnTimer: NodeJS.Timeout | undefined;
      const started = Date.now();
      const safety = setTimeout(() => ws.close(), 120_000);

      const say = () => {
        if (ws.readyState !== ws.OPEN) return;
        heardSinceLastLine = false;
        if (next < lines.length) ws.send(JSON.stringify({ event: "sim_text", streamSid, text: lines[next++] }));
        else ws.send(JSON.stringify({ event: "stop", streamSid, stop: { reason: "The caller disconnected the call" } }));
      };

      ws.on("open", () => {
        ws.send(JSON.stringify({ event: "connected" }));
        ws.send(JSON.stringify({
          event: "start", sequenceNumber: "1", streamSid,
          start: {
            streamSid, callSid: `SIMCALL${callId}`, from: "918065378787", to: `91${phone.slice(-10)}`, direction: "outbound",
            mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, bitRate: 64, bitDepth: 8 }, customParameters: {},
          },
        }));
      });

      ws.on("message", (data) => {
        const m = JSON.parse(data.toString()) as { event: string; media?: { payload: string }; mark?: { name: string } };
        if (m.event === "media" && m.media) {
          bytes += Buffer.from(m.media.payload, "base64").length;
          heardSinceLastLine = true;
          clearTimeout(turnTimer);
        } else if (m.event === "mark" && m.mark) {
          const playMs = (bytes / 8) * speed; // 8 bytes per ms at 8 kHz µ-law
          bytes = 0;
          pending++;
          const name = m.mark.name;
          setTimeout(() => {
            if (ws.readyState !== ws.OPEN) return;
            ws.send(JSON.stringify({ event: "mark", streamSid, mark: { name } }));
            pending--;
            if (pending === 0 && heardSinceLastLine) {
              clearTimeout(turnTimer);
              turnTimer = setTimeout(say, 350); // agent finished talking → customer replies
            }
          }, playMs);
        } else if (m.event === "clear") {
          bytes = 0;
        }
      });

      ws.on("close", () => {
        clearTimeout(safety);
        clearTimeout(turnTimer);
        void this.webhook({ ref_id: `SIM-${callId}`, call_id: `SIMCALL${callId}`, call_status: "answered", billsec: Math.round((Date.now() - started) / 1000) });
        resolve();
      });
      ws.on("error", (e) => this.opts.log(`sim ws error: ${e.message}`));
    });
  }
}
