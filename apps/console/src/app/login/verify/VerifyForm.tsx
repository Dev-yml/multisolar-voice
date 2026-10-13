"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { verifyMfa } from "../../actions";

export function VerifyForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(verifyMfa, undefined);
  const [recovery, setRecovery] = useState(false);
  return (
    <form action={action} className="mt-7 space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="code" className="text-sm font-medium">{recovery ? "Recovery code" : "6-digit code"}</label>
        {recovery ? (
          <input id="code" name="code" key="rc" required autoFocus autoComplete="off" placeholder="XXXX-XXXX-XXXX" className="input mt-1.5 h-12 font-mono tracking-wider" />
        ) : (
          <input
            id="code" name="code" key="otp" required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
            placeholder="123456" className="input mt-1.5 h-14 text-center font-mono text-2xl font-bold tracking-[0.5em]"
          />
        )}
      </div>
      {state?.error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-600/15">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-accent h-12 w-full rounded-xl text-[0.95rem]">
        {pending ? "Checking…" : <>Verify <ArrowRight size={17} /></>}
      </button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => setRecovery((r) => !r)} className="inline-flex items-center gap-1.5 font-semibold text-navy-3 hover:underline">
          <KeyRound size={15} /> {recovery ? "Use the app code" : "Lost your phone? Use a recovery code"}
        </button>
        <Link href="/login" className="text-muted hover:text-ink">Back</Link>
      </div>
    </form>
  );
}
