import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlarmClock, Languages, PhoneOutgoing, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/guard";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const FEATURES = [
  { icon: Languages, title: "Hindi + English calls", body: "Switches to Hindi the moment the customer does." },
  { icon: PhoneOutgoing, title: "Auto-dialer with consent", body: "09:00–21:00, Do-Not-Call, retries and callbacks." },
  { icon: AlarmClock, title: "48-hour callback board", body: "Every unanswered question reaches sales." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const s = await getSession();
  if (s) redirect(s.state === "full" ? "/" : "/setup-mfa");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#1b2a30] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute inset-0 bg-[url('/images/solar-sunset.jpg')] bg-cover bg-[position:55%_60%]" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgb(27_42_48/0.55)_0%,rgb(27_42_48/0.82)_45%,rgb(23_35_40/0.96)_100%)]" />
        <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_2px_rgb(242_140_40/0.6)]" /> Multi Solar · Voice Console
        </p>
        <div className="relative max-w-lg">
          <h1 className="text-[2.6rem] font-bold leading-[1.1] tracking-[-0.03em]">The AI voice agent for every solar enquiry.</h1>
          <p className="mt-4 text-base leading-relaxed text-white/70">Calls, transcripts, leads and follow-ups — in one place for the sales team.</p>
          <ul className="mt-10 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent text-white shadow-[0_8px_18px_-8px_rgb(244_123_32/0.8)]"><f.icon size={20} /></span>
                <span>
                  <span className="block font-semibold">{f.title}</span>
                  <span className="block text-sm text-white/60">{f.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-white/50"><ShieldCheck size={14} /> Private system · authorised staff only</p>
      </section>

      <section className="flex items-center justify-center px-5 py-14">
        <div className="w-full max-w-[400px]">
          <div className="glass rounded-[2rem] p-8 shadow-[0_30px_60px_-30px_rgb(18_28_34/0.3)] sm:p-10">
            {/* eslint-disable-next-line @next/next/no-img-element -- official logo file, shown as-is */}
            <img src="/multi-solar-logo.png" alt="Multi Solar" className="h-auto w-48" />
            <h2 className="mt-8 text-[1.6rem] font-bold leading-tight tracking-[-0.02em]">Welcome back</h2>
            <p className="mt-1.5 text-sm text-muted">Sign in to the Voice Console.</p>
            <LoginForm next={next} />
          </div>
          <p className="mt-6 text-center text-xs text-muted">Trouble signing in? Ask your Super Admin to reset your account.</p>
        </div>
      </section>
    </main>
  );
}
