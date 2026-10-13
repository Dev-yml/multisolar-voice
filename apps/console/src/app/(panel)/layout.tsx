import Link from "next/link";
import { Bell, Headset, LogOut, Search } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { ADMINS, MANAGERS, ROLE_LABELS } from "@/lib/roles";
import { logout } from "../actions";
import { Nav } from "./Nav";

export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h >= 4 && h < 12 ? "Good morning" : h >= 12 && h < 17 ? "Good afternoon" : "Good evening";
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const openEscalations = await prisma.escalation.count({ where: { status: { not: "RESOLVED" } } });
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <Nav
        canManage={MANAGERS.includes(user.role)}
        isAdmin={ADMINS.includes(user.role)}
        openEscalations={openEscalations}
        user={{ name: user.name, role: ROLE_LABELS[user.role] }}
        footer={
          <form action={logout}>
            <button type="submit" title="Sign out" aria-label="Sign out" className="grid h-9 w-9 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white">
              <LogOut size={17} />
            </button>
          </form>
        }
      />
      <div className="min-w-0">
        <header className="sticky top-0 z-20 hidden border-b border-[#ebe7e0] bg-white/90 backdrop-blur-xl lg:block">
          <div className="flex h-[76px] items-center gap-6 px-10">
            <div className="min-w-0">
              <p className="truncate text-[1.05rem] font-bold">{greeting()}, {user.name.split(" ")[0]}</p>
              <p className="text-[0.82rem] text-muted">{today}</p>
            </div>
            <form action="/leads" className="relative ml-auto w-full max-w-md">
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a959b]" />
              <input name="q" placeholder="Search leads by name, number or city…" className="input h-12 rounded-2xl bg-[#faf8f5] pl-10" />
            </form>
            <Link href="/escalations" className="relative grid h-11 w-11 place-items-center rounded-2xl text-ink-2 transition-colors hover:bg-[#f4f2ee]" aria-label={openEscalations ? `${openEscalations} open escalations` : "Escalations"}>
              <Bell size={20} />
              {openEscalations > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
            </Link>
            <Link href="/test-call" className="btn btn-accent h-12 rounded-2xl px-5 text-[0.95rem]">
              <Headset size={18} /> Test call
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
