"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { login } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required defaultValue={state?.email} key={state?.email ?? "email"} className="input mt-1.5 h-11" />
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus={Boolean(state?.email)} className="input mt-1.5 h-11" />
      </div>
      {state?.error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-600/15">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-accent h-12 w-full rounded-xl text-[0.95rem]">
        {pending ? "Signing in…" : <>Sign in <ArrowRight size={17} /></>}
      </button>
    </form>
  );
}
