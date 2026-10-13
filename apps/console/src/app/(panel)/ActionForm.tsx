"use client";

import { useActionState } from "react";
import { CircleCheck, Phone } from "lucide-react";
import type { ActionState } from "./actions";

/** A form wired to a server action that shows "Saved" / an error under it. `compact` = one small inline button (tables). */
export function ActionForm({
  action,
  children,
  className,
  submit = "Save",
  resetOnOk = false,
  compact = false,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  submit?: string;
  resetOnOk?: boolean;
  compact?: boolean;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  if (compact) {
    return (
      <form action={run} className="inline-flex items-center gap-2">
        {children}
        {state?.ok && <span role="status" className="max-w-44 truncate text-xs font-medium text-emerald-700" title={state.ok}>{state.ok}</span>}
        {state?.error && <span role="alert" className="max-w-44 truncate text-xs font-medium text-rose-700" title={state.error}>{state.error}</span>}
        <button type="submit" disabled={pending} className="btn btn-sm">
          <Phone size={14} /> {pending ? "Calling…" : submit}
        </button>
      </form>
    );
  }
  return (
    <form action={run} className={className} key={resetOnOk && state?.ok ? state.at : undefined}>
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn">{pending ? "Saving…" : submit}</button>
        {state?.ok && <span role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"><CircleCheck size={16} /> {state.ok}</span>}
        {state?.error && <span role="alert" className="text-sm font-medium text-rose-700">{state.error}</span>}
      </div>
    </form>
  );
}
