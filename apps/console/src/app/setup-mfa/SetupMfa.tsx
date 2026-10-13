"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { ArrowRight, Check, Copy, Download, Smartphone } from "lucide-react";
import { beginMfaSetup, confirmMfaSetup, logout, type SetupStart } from "../actions";

/** 1) start → QR code  2) type the 6-digit code  3) save the recovery codes. */
export function SetupMfa({ email, alreadyDone }: { email: string; alreadyDone: boolean }) {
  const [start, setStart] = useState<SetupStart>();
  const [starting, begin] = useTransition();
  const [done, confirm, confirming] = useActionState(confirmMfaSetup, undefined);
  const [copied, setCopied] = useState(false);

  if (alreadyDone && !done?.codes) {
    return (
      <>
        <h1 className="mt-8 text-[1.5rem] font-bold">Two-factor sign-in is on</h1>
        <p className="mt-2 text-sm text-muted">Your account is already protected.</p>
        <Link href="/" className="btn btn-accent mt-6 h-12 w-full rounded-xl">Go to dashboard <ArrowRight size={17} /></Link>
      </>
    );
  }

  if (done?.codes) {
    const text = `Multi Solar Voice — recovery codes for ${email}\nEach code works once.\n\n${done.codes.join("\n")}\n`;
    return (
      <>
        <h1 className="mt-8 flex items-center gap-2 text-[1.5rem] font-bold"><Check className="text-emerald-600" /> Two-factor sign-in is on</h1>
        <p className="mt-2 text-sm text-muted">
          Save these <b>recovery codes</b> somewhere safe (password manager or printed). If you lose your phone, each code lets you sign in <b>once</b>. They will not be shown again.
        </p>
        <ol className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-[#faf8f5] p-4 font-mono text-[0.95rem] font-semibold ring-1 ring-[#efebe4]">
          {done.codes.map((c) => <li key={c} className="rounded-lg bg-white px-3 py-2 text-center ring-1 ring-[#efebe4]">{c}</li>)}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost h-10" onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); }}>
            <Copy size={16} /> {copied ? "Copied" : "Copy"}
          </button>
          <a className="btn btn-ghost h-10" download="multisolar-voice-recovery-codes.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}>
            <Download size={16} /> Download
          </a>
        </div>
        <Link href="/" className="btn btn-accent mt-6 h-12 w-full rounded-xl">I saved them — open the dashboard <ArrowRight size={17} /></Link>
      </>
    );
  }

  return (
    <>
      <h1 className="mt-8 text-[1.5rem] font-bold leading-tight">Set up two-factor sign-in</h1>
      <p className="mt-2 text-sm text-muted">
        Required for everyone. After your password you will also enter a 6-digit code from an app on your phone — so a stolen password alone cannot open company data.
      </p>

      {!start?.qr ? (
        <>
          <ol className="mt-6 space-y-3 text-sm text-ink-2">
            <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-50 text-xs font-bold text-orange-700">1</span> Install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone.</li>
            <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-50 text-xs font-bold text-orange-700">2</span> Press <b>Start setup</b> and scan the QR code with the app.</li>
            <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-50 text-xs font-bold text-orange-700">3</span> Type the 6-digit code the app shows.</li>
          </ol>
          {start?.error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-600/15">{start.error}</p>}
          <button type="button" disabled={starting} onClick={() => begin(async () => setStart(await beginMfaSetup()))} className="btn btn-accent mt-6 h-12 w-full rounded-xl">
            <Smartphone size={18} /> {starting ? "Preparing…" : "Start setup"}
          </button>
        </>
      ) : (
        <form action={confirm} className="mt-6">
          <div className="grid items-center gap-5 sm:grid-cols-[auto_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated QR code (data URL) */}
            <img src={start.qr} alt="QR code for your authenticator app" width={180} height={180} className="mx-auto rounded-2xl bg-white p-2 ring-1 ring-[#efebe4]" />
            <div className="text-sm">
              <p className="font-semibold">Scan with your authenticator app</p>
              <p className="mt-1 text-muted">Can&apos;t scan? Choose “Enter a setup key” in the app and type:</p>
              <p className="mt-2 break-all rounded-lg bg-[#faf8f5] px-3 py-2 font-mono text-[0.85rem] font-bold tracking-wider ring-1 ring-[#efebe4]">{start.secret}</p>
              <p className="mt-1 text-xs text-muted">Account: {email} · Time-based</p>
            </div>
          </div>
          <label htmlFor="code" className="mt-6 block text-sm font-medium">6-digit code from the app</label>
          <input
            id="code" name="code" required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
            placeholder="123456" className="input mt-1.5 h-14 text-center font-mono text-2xl font-bold tracking-[0.5em]"
          />
          {done?.error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-600/15">{done.error}</p>}
          <button type="submit" disabled={confirming} className="btn btn-accent mt-4 h-12 w-full rounded-xl">
            {confirming ? "Checking…" : <>Turn on two-factor sign-in <ArrowRight size={17} /></>}
          </button>
        </form>
      )}
      <form action={logout} className="mt-4 text-center">
        <button type="submit" className="text-sm text-muted hover:text-ink">Sign out</button>
      </form>
    </>
  );
}
