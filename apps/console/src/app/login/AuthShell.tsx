import { ShieldCheck } from "lucide-react";

/** Centred card used by the second sign-in step and the authenticator setup. */
export function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-14">
      <div className={wide ? "w-full max-w-[560px]" : "w-full max-w-[420px]"}>
        <div className="glass rounded-[2rem] p-8 shadow-[0_30px_60px_-30px_rgb(18_28_34/0.3)] sm:p-10">
          {/* eslint-disable-next-line @next/next/no-img-element -- official logo file, shown as-is */}
          <img src="/multi-solar-logo.png" alt="Multi Solar" className="h-auto w-44" />
          {children}
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted"><ShieldCheck size={14} /> Two-factor sign-in protects company data</p>
      </div>
    </main>
  );
}
