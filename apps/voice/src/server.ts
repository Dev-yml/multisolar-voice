import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { applyCallWebhook, dialerStatus } from "@msv/data";
import { config, signCall, wsBase } from "./config";
import type { Dialer } from "./dialer";
import type { PhoneLine } from "./phone-line";
import type { SpeechToText, TextToSpeech } from "./providers/speech";
import { CallSession } from "./session";

/**
 * HTTP + WebSocket server.
 *
 *   GET  /health                       — for the host's health check
 *   GET|POST /smartflo/endpoint?key=…  — Smartflo "dynamic" Voice Bot endpoint → { success, wss_url }
 *   WS   /stream?key=… | ?c=…&t=…      — Smartflo voice stream (static URL uses ?key=)
 *   POST /smartflo/webhook?key=…       — Smartflo call events (recording URL, missed calls); key may also come as header x-msv-key
 *   POST /dial      (x-agent-key)      — "Call now" from the Console
 *   GET  /status    (x-agent-key)      — dialer status
 */

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit = 256_000): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error("Body too large");
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  const type = req.headers["content-type"] ?? "";
  if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(raw));
  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

/** Smartflo webhook fields vary by event and by the variables chosen in the portal — accept the common names. */
function pick(o: Record<string, unknown>, ...keys: string[]) {
  for (const k of keys) {
    const v = o[k] ?? o[`$${k}`];
    if (v !== undefined && v !== null && String(v) !== "") return String(v);
  }
  return undefined;
}

export function createVoiceServer(deps: {
  stt: SpeechToText;
  tts: TextToSpeech;
  line: PhoneLine;
  dialer?: Dialer;
  sim: boolean;
  log: (m: string) => void;
}) {
  const { log } = deps;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    // Smartflo can send the secret in the URL (?key=) or, better, as a custom header (x-msv-key) — header wins.
    const key = String(req.headers["x-msv-key"] ?? url.searchParams.get("key") ?? "");
    const agentOk = same(String(req.headers["x-agent-key"] ?? ""), config.agentKey);
    try {
      if (url.pathname === "/health") return json(res, 200, { ok: true });

      if (url.pathname === "/smartflo/endpoint") {
        // Must answer within 2 s with exactly { success, wss_url } — no database work here.
        if (!same(key, config.streamKey)) return json(res, 403, { success: false });
        const body = req.method === "POST" ? await readBody(req) : Object.fromEntries(url.searchParams);
        const callRef = pick(body, "callId", "call_id") ?? `c${Date.now()}`;
        return json(res, 200, { success: true, wss_url: `${wsBase()}/stream?c=${encodeURIComponent(callRef)}&t=${signCall(callRef)}` });
      }

      if (url.pathname === "/smartflo/webhook" && req.method === "POST") {
        if (!same(key, config.streamKey)) return json(res, 403, { ok: false });
        const b = await readBody(req);
        const custom = (typeof b.custom_identifier === "object" && b.custom_identifier) || {};
        const ourCallId = Number(pick(b, "msv_call_id") ?? pick(custom as Record<string, unknown>, "msv_call_id")) || undefined;
        const id = await applyCallWebhook({
          ourCallId,
          refId: pick(b, "ref_id", "refId"),
          callId: pick(b, "call_id", "uuid", "callId"),
          status: pick(b, "call_status", "status"),
          recordingUrl: pick(b, "recording_url", "recordingUrl"),
          durationSec: Number(pick(b, "billsec", "duration")) || undefined,
          hangupCause: pick(b, "hangup_cause", "hangup_cause_description"),
        });
        log(`webhook: ${pick(b, "call_status", "status") ?? "event"} → call ${id ?? "(not matched)"}`);
        return json(res, 200, { ok: true });
      }

      if (url.pathname === "/dial" && req.method === "POST") {
        if (!agentOk) return json(res, 401, { ok: false, message: "Unauthorized" });
        if (!deps.dialer) return json(res, 503, { ok: false, message: "Dialer is off" });
        const b = await readBody(req);
        const r = await deps.dialer.dialNow(Number(b.leadId));
        return json(res, r.ok ? 200 : 409, r);
      }

      if (url.pathname === "/status") {
        if (!agentOk) return json(res, 401, { ok: false });
        const st = await dialerStatus();
        const { settings: _s, ...rest } = st;
        return json(res, 200, { ...rest, speech: config.speech, line: deps.line.name });
      }

      return json(res, 404, { ok: false });
    } catch (e) {
      log(`http error ${url.pathname}: ${e instanceof Error ? e.message : e}`);
      return json(res, 500, { ok: false });
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://local");
    const ok =
      url.pathname === "/stream" &&
      (same(url.searchParams.get("key") ?? "", config.streamKey) ||
        same(url.searchParams.get("t") ?? "", signCall(url.searchParams.get("c") ?? "")));
    if (!ok) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      new CallSession(ws, { stt: deps.stt, tts: deps.tts, line: deps.line, sim: deps.sim, log });
    });
  });

  return server;
}
