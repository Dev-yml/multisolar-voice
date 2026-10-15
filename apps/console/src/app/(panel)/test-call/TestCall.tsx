"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bot, Mic, PhoneOff, Send, Sparkles, User, Volume2 } from "lucide-react";
import { cn } from "@/lib/util";

type Event = { type: string; name?: string; input?: unknown; output?: unknown; from?: string; to?: string; blocked?: string };
type Line =
  | { kind: "agent"; text: string; lang: string }
  | { kind: "customer"; text: string }
  | { kind: "tool"; text: string; detail?: string }
  | { kind: "note"; text: string };
type Reply = {
  callId: number; say: string[]; end: boolean; events: Event[]; message?: string;
  state: { lang: string; stage: string; outcome?: string; slots: Record<string, unknown>; brain?: string };
  menu?: string[]; transfer?: { team: string; last4: string };
};
const TEAM_KEY: Record<string, { digit: string; label: string }> = {
  SALES: { digit: "1", label: "Sales" },
  SALES_HEAD: { digit: "2", label: "Sales Head" },
  CRM: { digit: "3", label: "Customer care" },
};
const NO_MENU = ["DNC", "WRONG_NUMBER", "NOT_INTERESTED"];

const QUICK = {
  OUTBOUND: ["Haan ji, boliye", "ghar ke liye", "teen-saade teen hazaar", "Gurgaon", "haan, kal shaam", "Battery backup bhi milega kya?", "nahi bas, dhanyavaad"],
  INBOUND: ["English", "For my home", "My bill is around 5000", "Jaipur", "What warranty do you give on the modules?", "Can you give some discount?", "No, thank you"],
};

const TOOL_LABEL: Record<string, string> = {
  estimateSystem: "Sized the system",
  getPrice: "Looked up price",
  getSubsidy: "Checked subsidy",
  searchKnowledge: "Searched knowledge",
  bookSiteVisit: "Booked site visit",
  escalate: "Escalated to sales",
  scheduleCallback: "Scheduled callback",
  markDoNotCall: "Added to Do-Not-Call",
  saveLead: "Saved lead details",
};

function toolLine(e: Event): Line | null {
  if (e.type === "lang") return { kind: "note", text: `Language switched: ${e.from === "hi" ? "Hindi" : "English"} → ${e.to === "hi" ? "Hindi" : "English"}` };
  if (e.type === "guard") return { kind: "note", text: `Safety: blocked an unverified number (${e.blocked})` };
  if (e.type !== "tool" || !e.name || e.name === "saveLead") return null;
  return { kind: "tool", text: TOOL_LABEL[e.name] ?? e.name, detail: JSON.stringify(e.output ?? e.input) };
}

/**
 * Browser voices differ a lot. Windows' built-in ones (Kalpana, Hemant, Heera, Ravi) sound robotic;
 * Edge's "Online (Natural)" voices (Swara, Madhur, Neerja, Prabhat) and Chrome's "Google हिन्दी" are far better.
 */
function voiceScore(v: SpeechSynthesisVoice, lang: "en" | "hi") {
  const want = lang === "hi" ? "hi-IN" : "en-IN";
  const l = v.lang.replace("_", "-");
  let s = l === want ? 100 : l.startsWith(lang) ? 40 : -1000;
  if (/natural|neural|online/i.test(v.name)) s += 60;
  if (/google/i.test(v.name)) s += 35;
  if (/swara|madhur|neerja|prabhat|aarti|arjun/i.test(v.name)) s += 15;
  return s;
}
function bestVoice(voices: SpeechSynthesisVoice[], lang: "en" | "hi") {
  return [...voices].sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang)).find((v) => voiceScore(v, lang) > 0) ?? null;
}
const voiceLang = (v: SpeechSynthesisVoice): "en" | "hi" | null => (v.lang.startsWith("hi") ? "hi" : v.lang.startsWith("en") ? "en" : null);

// Browser speech recognition (free, built in) for the mic button.
type Recognition = { lang: string; interimResults: boolean; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void };
function recognitionCtor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function TestCall({ agentName, sarvamVoice }: { agentName: string; sarvamVoice: boolean }) {
  const [direction, setDirection] = useState<"OUTBOUND" | "INBOUND">("OUTBOUND");
  const [name, setName] = useState("Vinay");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [callId, setCallId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [state, setState] = useState<Reply["state"] | null>(null);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string[]>([]);
  const [keyOpen, setKeyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [speak, setSpeak] = useState(true);
  const [voiceMode, setVoiceMode] = useState<"sarvam" | "browser">(sarvamVoice ? "sarvam" : "browser");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicePick, setVoicePick] = useState<Record<"en" | "hi", string>>({ en: "", hi: "" });
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechToken = useRef(0);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMicSupported(Boolean(recognitionCtor()));
    // Voices load asynchronously (Chrome/Edge fill the list a moment after the page opens).
    const synth = window.speechSynthesis;
    const load = () => setVoices((synth?.getVoices() ?? []).filter((v) => voiceLang(v)));
    load();
    synth?.addEventListener?.("voiceschanged", load);
    return () => {
      synth?.removeEventListener?.("voiceschanged", load);
      stopSpeaking();
    };
  }, []);
  // Closing the tab or leaving the page hangs up, like putting the phone down.
  useEffect(() => {
    if (callId === null || ended) return;
    const bye = () => navigator.sendBeacon("/api/test-call/end", JSON.stringify({ callId }));
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      bye(); // left the page inside the app
    };
  }, [callId, ended]);
  // Block bodies: newer browsers return a Promise from scrollIntoView, which React rejects as a cleanup.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines]);

  function stopSpeaking() {
    speechToken.current++;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
  }

  function sayWithBrowser(sentences: string[], lang: "en" | "hi") {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const voice = voices.find((v) => v.voiceURI === voicePick[lang]) ?? bestVoice(voices, lang);
    for (const s of sentences) {
      const u = new SpeechSynthesisUtterance(s);
      u.lang = voice?.lang ?? (lang === "hi" ? "hi-IN" : "en-IN");
      if (voice) u.voice = voice;
      u.rate = lang === "hi" ? 0.95 : 1;
      synth.speak(u);
    }
  }

  async function sayWithSarvam(sentences: string[], lang: "en" | "hi", token: number) {
    const res = await fetch("/api/test-call/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sentences.join(" ").slice(0, 800), lang }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const { audios } = (await res.json()) as { audios: string[] };
    for (const b64 of audios) {
      if (token !== speechToken.current) return; // customer spoke / hung up meanwhile
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      const audio = new Audio(url);
      audioRef.current = audio;
      await new Promise<void>((done) => {
        audio.onended = () => done();
        audio.onerror = () => done();
        audio.onpause = () => done();
        audio.play().catch(() => done());
      });
      URL.revokeObjectURL(url);
    }
  }

  function say(sentences: string[], lang: string) {
    if (!speak || !sentences.length) return;
    const l = lang === "hi" ? "hi" : "en";
    stopSpeaking();
    const token = speechToken.current;
    if (voiceMode === "sarvam") {
      sayWithSarvam(sentences, l, token).catch(() => {
        if (token !== speechToken.current) return;
        setVoiceNote("Sarvam voice did not load — using the browser voice for now.");
        sayWithBrowser(sentences, l);
      });
      return;
    }
    sayWithBrowser(sentences, l);
  }

  function apply(r: Reply, customer?: string) {
    const add: Line[] = [];
    if (customer) add.push({ kind: "customer", text: customer });
    for (const e of r.events ?? []) {
      const l = toolLine(e);
      if (l) add.push(l);
    }
    for (const s of r.say) add.push({ kind: "agent", text: s, lang: r.state.lang });
    if (r.menu) setMenu(r.menu);
    const offerKeys = r.end && !r.transfer && (r.menu?.length ?? 0) > 0 && !NO_MENU.includes(r.state.outcome ?? "");
    if (r.transfer) {
      const t = TEAM_KEY[r.transfer.team]?.label ?? r.transfer.team;
      add.push({ kind: "tool", text: `Hand-over to ${t}`, detail: `On a phone call the ${t} line (…${r.transfer.last4}) rings first, then the customer.` });
      add.push({ kind: "note", text: `On a real call: ${t} (…${r.transfer.last4}) is rung first, then the customer.` });
    }
    if (offerKeys) add.push({ kind: "note", text: `Keypad menu: ${r.menu!.map((m) => `${TEAM_KEY[m]?.digit} ${TEAM_KEY[m]?.label}`).join(" · ")} — press below (8 seconds on a phone).` });
    else if (r.end) add.push({ kind: "note", text: "Call ended by the agent." });
    setKeyOpen(offerKeys);
    setLines((prev) => [...prev, ...add]);
    setState(r.state);
    setEnded(r.end);
    say(r.say, r.state.lang);
  }

  async function post(path: string, body: unknown): Promise<Reply | null> {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as Reply;
      if (!res.ok) {
        setError(data.message ?? "Something went wrong.");
        return null;
      }
      return data;
    } catch {
      setError("Could not reach the console server.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setLines([]);
    setEnded(false);
    setKeyOpen(false);
    const r = await post("/api/test-call/start", { direction, name: name || undefined, phone: phone || undefined, language });
    if (!r) return;
    setCallId(r.callId);
    apply(r);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function send(msg: string) {
    const t = msg.trim();
    if (!t || !callId || ended || busy) return;
    setText("");
    stopSpeaking();
    const r = await post("/api/test-call/turn", { callId, text: t });
    if (r) apply(r, t);
    inputRef.current?.focus();
  }

  async function press(digit: string) {
    if (!callId || busy) return;
    stopSpeaking();
    const r = await post("/api/test-call/key", { callId, digit });
    setKeyOpen(false);
    if (r) apply(r, `Pressed ${digit}`);
  }

  async function hangUp() {
    if (!callId) return;
    stopSpeaking();
    if (!ended) await post("/api/test-call/end", { callId });
    setEnded(true);
    setLines((prev) => [...prev, { kind: "note", text: "You hung up." }]);
  }

  function listen() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    stopSpeaking();
    const rec = new Ctor();
    rec.lang = state?.lang === "hi" ? "hi-IN" : "en-IN";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const heard = e.results[0]?.[0]?.transcript ?? "";
      if (heard) void send(heard);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const live = callId !== null && !ended;

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-5">
        <div className="glass rounded-3xl p-5">
          <p className="text-[0.95rem] font-semibold">New test call</p>
          <p className="mt-0.5 text-xs text-muted">Talk to the agent exactly like a customer would.</p>
          <div className="neu-inset mt-4 grid grid-cols-2 gap-1 rounded-2xl p-1.5" role="radiogroup" aria-label="Call direction">
            {(["OUTBOUND", "INBOUND"] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={direction === d} disabled={live} onClick={() => setDirection(d)}
                className={cn("rounded-lg px-3 py-2 text-[0.8rem] font-semibold transition-all", direction === d ? "neu text-navy-3" : "text-muted hover:text-ink")}>
                {d === "OUTBOUND" ? "Agent calls customer" : "Customer calls in"}
              </button>
            ))}
          </div>
          <label className="mt-5 block text-xs font-semibold text-muted" htmlFor="tc-name">Customer name</label>
          <input id="tc-name" className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} disabled={live} placeholder="e.g. Vinay" />
          <label className="mt-3 block text-xs font-semibold text-muted" htmlFor="tc-phone">Mobile (optional)</label>
          <input id="tc-phone" className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={live} inputMode="tel" placeholder="Saves the result on this lead" />
          <label className="mt-3 block text-xs font-semibold text-muted" htmlFor="tc-lang">Agent starts in</label>
          <select id="tc-lang" className="input mt-1" value={language} onChange={(e) => setLanguage(e.target.value as "en" | "hi")} disabled={live}>
            <option value="en">English (switches to Hindi if the customer speaks Hindi)</option>
            <option value="hi">Hindi</option>
          </select>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={speak} onChange={(e) => { setSpeak(e.target.checked); if (!e.target.checked) stopSpeaking(); }} />
            Speak the agent&apos;s replies
          </label>
          {speak && (
            <div className="mt-3 space-y-2 rounded-2xl bg-[#faf8f5] p-3 ring-1 ring-[#ebe7e0]">
              <label className="block text-xs font-semibold text-muted" htmlFor="tc-voice"><Volume2 size={13} className="mr-1 inline" />Voice</label>
              <select id="tc-voice" className="input" value={voiceMode} onChange={(e) => { setVoiceMode(e.target.value as "sarvam" | "browser"); setVoiceNote(null); }}>
                <option value="sarvam" disabled={!sarvamVoice}>Sarvam AI — natural Hindi/English{sarvamVoice ? "" : " (add SARVAM_API_KEY)"}</option>
                <option value="browser">Browser voice (free)</option>
              </select>
              {voiceMode === "browser" && (["hi", "en"] as const).map((l) => {
                const list = voices.filter((v) => voiceLang(v) === l).sort((a, b) => voiceScore(b, l) - voiceScore(a, l));
                const best = bestVoice(voices, l);
                return (
                  <select key={l} className="input text-xs" aria-label={l === "hi" ? "Hindi voice" : "English voice"} value={voicePick[l]} onChange={(e) => setVoicePick((p) => ({ ...p, [l]: e.target.value }))}>
                    <option value="">{l === "hi" ? "Hindi" : "English"}: best available{best ? ` (${best.name})` : " — none installed"}</option>
                    {list.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
                  </select>
                );
              })}
              {voiceMode === "browser" && !voices.some((v) => /natural|online|google/i.test(v.name)) && (
                <p className="text-xs leading-relaxed text-muted">Tip: open the console in <b>Microsoft Edge</b> for natural Indian voices (Swara, Neerja), or use Sarvam AI.</p>
              )}
              {voiceNote && <p className="text-xs text-amber-700">{voiceNote}</p>}
            </div>
          )}
          <div className="mt-5 flex gap-2">
            {live ? (
              <button type="button" className="btn btn-danger h-11 w-full rounded-xl" onClick={hangUp} disabled={busy}><PhoneOff size={16} /> Hang up</button>
            ) : (
              <button type="button" className="btn btn-accent h-11 w-full rounded-xl" onClick={start} disabled={busy}>{busy ? "Connecting…" : callId ? "Start another call" : "Start call"}</button>
            )}
          </div>
          {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-600/15">{error}</p>}
        </div>

        {state && (
          <div className="glass rounded-3xl p-5 text-sm">
            <p className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-accent" /> What the agent knows</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted">Language</dt><dd>{state.lang === "hi" ? "Hindi" : "English"}</dd>
              <dt className="text-muted">Step</dt><dd>{state.stage.replaceAll("_", " ").toLowerCase()}</dd>
              {Object.entries(state.slots).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-words">{typeof v === "object" ? (v as { label?: string }).label ?? JSON.stringify(v) : String(v)}</dd></div>
              ))}
              {state.outcome && (<><dt className="text-muted">Outcome</dt><dd className="font-semibold">{state.outcome.replaceAll("_", " ").toLowerCase()}</dd></>)}
            </dl>
            {callId && <Link href={`/calls/${callId}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-navy-3 hover:underline">Open the saved call record →</Link>}
          </div>
        )}
      </div>

      <div className="glass flex min-h-[70svh] flex-col lg:min-h-[600px] overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between bg-[linear-gradient(120deg,#1b2a30,#2a3f46)] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="relative grid h-10 w-10 place-items-center rounded-full bg-white/15 ring-1 ring-white/20">
              <Bot size={20} />
              <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[#22363d]", live ? "bg-emerald-400" : "bg-slate-400")} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">{agentName}</p>
              <p className="text-xs text-white/60">{state?.brain === "claude" ? "Claude AI" : "Rule engine"} · English / Hindi</p>
            </div>
          </div>
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1", live ? "bg-emerald-400/15 text-emerald-200 ring-emerald-300/30" : "bg-white/10 text-white/70 ring-white/15")}>
            {live ? "● On call" : callId ? "Call ended" : "Not connected"}
          </span>
        </div>

        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6" aria-live="polite">
          {!lines.length && (
            <p className="mx-auto mt-20 max-w-sm text-center text-sm leading-relaxed text-muted">
              <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-navy/5 text-navy-3"><Bot size={26} /></span>
              Start a call, then type (or tap the mic and speak) as the customer. Every turn, tool lookup and the final summary are saved like a real call.
            </p>
          )}
          {lines.map((l, i) =>
            l.kind === "agent" ? (
              <div key={i} className="flex max-w-[85%] items-end gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy text-white"><Bot size={14} /></span>
                <div className="neu rounded-2xl rounded-bl-md px-4 py-2.5 text-[0.95rem] font-medium leading-relaxed" lang={l.lang}>{l.text}</div>
              </div>
            ) : l.kind === "customer" ? (
              <div key={i} className="ml-auto flex max-w-[85%] items-end justify-end gap-2">
                <div className="rounded-2xl rounded-br-md bg-[linear-gradient(135deg,#ff9338,#f47b20)] px-4 py-2.5 text-[0.95rem] text-white shadow-[0_6px_14px_-8px_rgb(244_123_32/0.7)]">{l.text}</div>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange-100 text-orange-700"><User size={14} /></span>
              </div>
            ) : l.kind === "tool" ? (
              <div key={i} className="flex justify-center">
                <span title={l.detail} className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 ring-1 ring-orange-600/15"><Sparkles size={12} /> {l.text}</span>
              </div>
            ) : (
              <p key={i} className="text-center text-xs text-muted">{l.text}</p>
            ),
          )}
          {busy && callId && <p className="text-xs text-muted">Agent is thinking…</p>}
          <div ref={endRef} />
        </div>

        {(live || keyOpen) && menu.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/70 bg-white/40 px-3 py-2 sm:px-4">
            <span className="text-xs font-semibold text-muted">Keypad</span>
            {menu.map((m) => (
              <button key={m} type="button" onClick={() => press(TEAM_KEY[m].digit)} disabled={busy}
                className="btn btn-ghost btn-sm rounded-xl" aria-label={`Press ${TEAM_KEY[m].digit} for ${TEAM_KEY[m].label}`}>
                <b className="digits">{TEAM_KEY[m].digit}</b> {TEAM_KEY[m].label}
              </button>
            ))}
          </div>
        )}
        {live && (
          <div className="border-t border-white/70 bg-white/30 p-3 sm:p-4">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {QUICK[direction].map((q) => (
                <button key={q} type="button" onClick={() => send(q)} disabled={busy} className="neu shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:text-navy-3 active:shadow-[inset_2px_2px_5px_rgb(150_165_192/0.5),inset_-2px_-2px_5px_#fff]">{q}</button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="flex gap-2">
              <input ref={inputRef} className="input h-11 min-w-0 rounded-xl" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type what the customer says (English, Hindi or Hinglish)…" aria-label="Customer says" maxLength={1000} />
              {micSupported && (
                <button type="button" onClick={listen} className={cn("btn btn-ghost h-11 rounded-xl", listening && "border-rose-300 text-rose-600")} aria-pressed={listening}>
                  {listening ? "Listening…" : <><Mic size={16} /> <span className="hidden sm:inline">Speak</span></>}
                </button>
              )}
              <button type="submit" className="btn h-11 rounded-xl" disabled={busy || !text.trim()}><Send size={16} /> <span className="hidden sm:inline">Send</span></button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
