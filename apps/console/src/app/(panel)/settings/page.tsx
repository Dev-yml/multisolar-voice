import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
import { CLAUDE_MODELS, TTS_MODELS, V3_SPEAKERS, claudeAvailable, getSettings } from "@/lib/calls";
import { MANAGERS } from "@/lib/roles";
import { ActionForm } from "../ActionForm";
import { saveSettings } from "../actions";
import { Card, PageTitle } from "../ui";

export const metadata: Metadata = { title: "Agent settings" };

const F = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block text-sm font-medium">{label}{children}{hint && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}</label>
);

export default async function SettingsPage() {
  await requireUser(MANAGERS);
  const s = await getSettings();
  const connections = [
    { name: "Claude — AI conversation", key: "ANTHROPIC_API_KEY", on: claudeAvailable() },
    { name: "Sarvam — natural voice in Test call", key: "SARVAM_API_KEY", on: Boolean(process.env.SARVAM_API_KEY) },
    { name: "Voice Agent server (phone calls)", key: "VOICE_SERVER_URL", on: Boolean(process.env.VOICE_SERVER_URL) },
  ];
  return (
    <>
      <PageTitle title="Agent settings" sub="How the agent introduces itself, when it may call and what it promises." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <ActionForm action={saveSettings} submit="Save settings">
            <div className="grid gap-4 sm:grid-cols-2">
              <F label="Agent name"><input name="agentName" defaultValue={s.agentName} className="input mt-1" /></F>
              <F label="Voice"><select name="voice" defaultValue={s.voice} className="input mt-1"><option value="female">Female</option><option value="male">Male</option></select></F>
              <F label="Starts calls in" hint="Switches to Hindi automatically when the customer speaks Hindi."><select name="startLanguage" defaultValue={s.startLanguage} className="input mt-1"><option value="en">English</option><option value="hi">Hindi</option></select></F>
              <F label="Callback promise (hours)" hint="“Our sales team will call you within … hours.”"><input name="escalationHours" defaultValue={s.escalationHours} inputMode="numeric" className="input mt-1" /></F>
              <F label="Call from" hint="Telemarketing allowed 09:00–21:00 only."><input name="callingStart" defaultValue={s.callingStart} className="input mt-1" /></F>
              <F label="Call until"><input name="callingEnd" defaultValue={s.callingEnd} className="input mt-1" /></F>

              <F label="Monthly budget ₹" hint="Dialer pauses when the month's estimated cost reaches this."><input name="monthlyBudget" defaultValue={s.monthlyBudget} inputMode="numeric" className="input mt-1" /></F>
              <F label="Attempts per lead"><input name="maxAttempts" defaultValue={s.maxAttempts} inputMode="numeric" className="input mt-1" /></F>
              <F label="Gap between attempts (minutes)"><input name="retryGapMinutes" defaultValue={s.retryGapMinutes} inputMode="numeric" className="input mt-1" /></F>
              <F label="Calls at the same time" hint="Keep 1–2 of your Smartflo channels free for incoming calls."><input name="maxConcurrent" defaultValue={s.maxConcurrent} inputMode="numeric" className="input mt-1" /></F>
            </div>

            <h3 className="mt-7 border-t border-[#ebe7e0] pt-5 font-semibold">AI conversation</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <F label="Brain" hint={claudeAvailable() ? "Claude is connected." : "Add ANTHROPIC_API_KEY on the server to use Claude. Until then the rule engine answers."}>
                <select name="brain" defaultValue={s.brain} className="input mt-1"><option value="claude">Claude AI (natural conversation)</option><option value="rules">Rule engine (no AI, fixed script)</option></select>
              </F>
              <F label="Claude model" hint="Haiku 4.5 is fastest and cheapest (used in the cost sheet); Sonnet 5.5 is smarter; Opus 5.5 is the most capable but slower.">
                <select name="claudeModel" defaultValue={s.claudeModel} className="input mt-1">{CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
              </F>
              <F label="Target call length (seconds)" hint="The AI wraps up before this; the call is closed 45 s after it. 210 = 3.5 minutes."><input name="maxCallSeconds" defaultValue={s.maxCallSeconds} inputMode="numeric" className="input mt-1" /></F>
            </div>

            <h3 className="mt-7 border-t border-[#ebe7e0] pt-5 font-semibold">Voice (Sarvam AI)</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <F label="Voice model"><select name="ttsModel" defaultValue={s.ttsModel} className="input mt-1">{TTS_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></F>
              <F label="Speaker" hint="Leave empty for a default female/male voice. Bulbul V3 names are suggested; try them in Test call.">
                <input name="ttsSpeaker" defaultValue={s.ttsSpeaker ?? ""} list="v3-speakers" placeholder="e.g. priya" className="input mt-1" />
                <datalist id="v3-speakers">{V3_SPEAKERS.map((n) => <option key={n} value={n} />)}</datalist>
              </F>
            </div>

            <h3 className="mt-7 border-t border-[#ebe7e0] pt-5 font-semibold">Hand-over to people (keypad)</h3>
            <p className="mt-1 text-xs text-muted">At the end of a call the agent says “press 1 for sales, 2 for the sales head, 3 for customer care”. The call ends and Smartflo rings that person first, then the customer. These numbers must be agents on your Smartflo account. They are never shown to callers or to the AI.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <F label="1 — Sales"><input name="transferNumber" defaultValue={s.transferNumber ?? ""} inputMode="tel" placeholder="10-digit mobile" className="input mt-1" /></F>
              <F label="2 — Sales Head"><input name="salesHeadNumber" defaultValue={s.salesHeadNumber ?? ""} inputMode="tel" placeholder="10-digit mobile" className="input mt-1" /></F>
              <F label="3 — Customer care (CRM)"><input name="crmNumber" defaultValue={s.crmNumber ?? ""} inputMode="tel" placeholder="10-digit mobile" className="input mt-1" /></F>
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" name="keypadMenu" defaultChecked={s.keypadMenu} className="mt-1" /> <span>Offer the keypad menu at the end of calls (only teams with a number are read out).</span></label>
            <label className="mt-5 flex items-start gap-2 text-sm"><input type="checkbox" name="outboundEnabled" defaultChecked={s.outboundEnabled} className="mt-1" /> <span><b>Outbound calling on.</b> Only leads with consent, not on Do-Not-Call, inside calling hours. Has no effect until the phone line is connected.</span></label>
          </ActionForm>
        </Card>
        <Card>
          <h2 className="font-semibold">Connections</h2>
          <p className="mt-1 text-sm text-muted">Keys live only in the server settings (.env, Vercel, Railway) — never in this page, chat or email. Phone calls also need ANTHROPIC_API_KEY and SARVAM_API_KEY on the Voice Agent server.</p>
          <ul className="mt-4 space-y-3 text-sm">
            {connections.map((c) => (
              <li key={c.key} className="flex items-start justify-between gap-3">
                <span>{c.name}<span className="block text-xs text-muted">{c.key}</span></span>
                <span className={c.on ? "font-semibold text-green" : "text-muted"}>{c.on ? "Connected" : "Not yet"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg bg-paper px-3 py-2 text-xs text-muted">Without these, the console still works: test calls use the built-in rule engine and the browser&apos;s voice.</p>
        </Card>
      </div>
    </>
  );
}
