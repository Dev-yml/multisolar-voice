"use client";

import { useActionState } from "react";
import { regenerateRecoveryCodes } from "../actions";

export function RecoveryCodes() {
  const [state, run, pending] = useActionState(regenerateRecoveryCodes, undefined);
  if (state?.codes) {
    return (
      <div>
        <p className="text-sm font-semibold text-emerald-700">{state.ok}</p>
        <ol className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-[#faf8f5] p-3 font-mono text-sm font-semibold ring-1 ring-[#efebe4]">
          {state.codes.map((c) => <li key={c} className="rounded-lg bg-white px-2 py-1.5 text-center ring-1 ring-[#efebe4]">{c}</li>)}
        </ol>
        <p className="mt-2 text-xs text-muted">Save them now — they will not be shown again.</p>
      </div>
    );
  }
  return (
    <form action={run} className="flex flex-wrap items-center gap-2">
      <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="Code from app" className="input w-40 text-center font-mono font-bold tracking-widest" />
      <button type="submit" disabled={pending} className="btn btn-ghost">{pending ? "Checking…" : "New recovery codes"}</button>
      {state?.error && <span role="alert" className="text-sm font-medium text-rose-700">{state.error}</span>}
    </form>
  );
}
