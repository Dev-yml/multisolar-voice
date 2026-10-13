import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
import { getSettings } from "@/lib/calls";
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
    { name: "Voice Agent server (phone calls)", key: "VOICE_SERVER_URL", on: Boolean(process.env.VOICE_SERVER_URL) },
    { name: "Claude (smarter answers, optional)", key: "ANTHROPIC_API_KEY", on: Boolean(process.env.ANTHROPIC_API_KEY) },
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
              <F label="Transfer number (sales desk)" hint="Live transfer when a customer insists on a person."><input name="transferNumber" defaultValue={s.transferNumber ?? ""} inputMode="tel" className="input mt-1" /></F>
              <F label="Monthly budget ₹" hint="Dialer pauses when the month's estimated cost reaches this."><input name="monthlyBudget" defaultValue={s.monthlyBudget} inputMode="numeric" className="input mt-1" /></F>
              <F label="Attempts per lead"><input name="maxAttempts" defaultValue={s.maxAttempts} inputMode="numeric" className="input mt-1" /></F>
              <F label="Gap between attempts (minutes)"><input name="retryGapMinutes" defaultValue={s.retryGapMinutes} inputMode="numeric" className="input mt-1" /></F>
              <F label="Calls at the same time"><input name="maxConcurrent" defaultValue={s.maxConcurrent} inputMode="numeric" className="input mt-1" /></F>
            </div>
            <label className="mt-5 flex items-start gap-2 text-sm"><input type="checkbox" name="outboundEnabled" defaultChecked={s.outboundEnabled} className="mt-1" /> <span><b>Outbound calling on.</b> Only leads with consent, not on Do-Not-Call, inside calling hours. Has no effect until the phone line is connected.</span></label>
          </ActionForm>
        </Card>
        <Card>
          <h2 className="font-semibold">Connections</h2>
          <p className="mt-1 text-sm text-muted">Tata Smartflo and Sarvam keys live on the Voice Agent server, not here. Keys go only in each server&apos;s settings — never in this page, chat or email.</p>
          <ul className="mt-4 space-y-3 text-sm">
            {connections.map((c) => (
              <li key={c.key} className="flex items-start justify-between gap-3">
                <span>{c.name}<span className="block text-xs text-muted">{c.key}</span></span>
                <span className={c.on ? "font-semibold text-green" : "text-muted"}>{c.on ? "Connected" : "Not yet"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg bg-paper px-3 py-2 text-xs text-muted">Without these, the console still works: test calls use the built-in rule engine and browser voice.</p>
        </Card>
      </div>
    </>
  );
}
