"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlarmClock, BookOpen, Headset, IndianRupee, LayoutDashboard, Menu, PhoneCall, ShieldCheck, SlidersHorizontal, Users, X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/util";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: number };

/** Dark navy sidebar (desktop) + slide-in drawer (mobile). The official logo sits on a white card, unchanged. */
export function Nav({
  canManage,
  isAdmin,
  openEscalations,
  user,
  footer,
}: {
  canManage: boolean;
  isAdmin: boolean;
  openEscalations: number;
  user: { name: string; role: string };
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const groups: { title: string; items: Item[] }[] = [
    { title: "Overview", items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
    {
      title: "Calling",
      items: [
        { href: "/test-call", label: "Test call", icon: Headset },
        { href: "/calls", label: "Calls", icon: PhoneCall },
        { href: "/leads", label: "Leads", icon: Users },
        { href: "/escalations", label: "Escalations", icon: AlarmClock, badge: openEscalations },
      ],
    },
    {
      title: "Content",
      items: [
        { href: "/knowledge", label: "Knowledge", icon: BookOpen },
        ...(canManage ? [{ href: "/pricing", label: "Prices & subsidy", icon: IndianRupee }] : []),
      ],
    },
    ...(canManage || isAdmin
      ? [{
          title: "Admin",
          items: [
            ...(canManage ? [{ href: "/settings", label: "Agent settings", icon: SlidersHorizontal }] : []),
            ...(isAdmin ? [{ href: "/users", label: "Users", icon: ShieldCheck }] : []),
          ],
        }]
      : []),
  ];

  const initials = user.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  const panel = (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-5">
        <Link href="/" className="block" aria-label="Multi Solar Voice — dashboard">
          <span className="block w-[168px] rounded-xl bg-white px-3 py-2.5 shadow-[0_8px_24px_-10px_rgb(0_0_0/0.5)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- official logo file, shown as-is */}
            <img src="/multi-solar-logo.png" alt="Multi Solar" className="h-auto w-full" />
          </span>
        </Link>
        <p className="mt-4 flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.2em] text-white/70">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_2px_rgb(242_140_40/0.6)]" /> Voice Console
        </p>
      </div>
      <nav aria-label="Console" className="scroll-thin flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-white/45">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.92rem] font-semibold transition-colors",
                        active ? "bg-gradient-to-r from-[#ff8a2b] to-[#f06d12] text-white shadow-[0_10px_22px_-10px_rgb(244_123_32/0.8)]" : "text-white/80 hover:bg-white/[0.07] hover:text-white",
                      )}
                    >
                      <Icon size={19} strokeWidth={2} className={active ? "text-white" : "text-white/70 group-hover:text-white"} />
                      {item.label}
                      {item.badge ? (
                        <span className={cn("ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] font-bold leading-none", active ? "bg-white text-accent-ink" : "bg-accent text-white")}>{item.badge}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="relative">
        {/* Solar field at the bottom of the sidebar */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-full h-40 bg-[url('/images/solar-sunset.jpg')] bg-cover bg-[position:50%_85%] opacity-60 [mask-image:linear-gradient(to_bottom,transparent,black_70%)]" />
      </div>
      <div className="relative border-t border-white/10 bg-[#172328]/80 p-3 backdrop-blur">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold text-white ring-1 ring-white/20">{initials}</span>
          <Link href="/account" className="min-w-0 flex-1 rounded-lg hover:bg-white/5" title="My account · change password">
            <span className="block truncate text-sm font-semibold text-white">{user.name}</span>
            <span className="block truncate text-xs text-white/50">{user.role} · My account</span>
          </Link>
          {footer}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="glass-dark sticky top-0 z-30 flex items-center justify-between px-4 py-3 lg:hidden">
        <Link href="/" className="block w-[132px] rounded-lg bg-white px-2 py-1.5" aria-label="Dashboard">
          {/* eslint-disable-next-line @next/next/no-img-element -- official logo file, shown as-is */}
          <img src="/multi-solar-logo.png" alt="Multi Solar" className="h-auto w-full" />
        </Link>
        <button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white" aria-label="Open menu">
          <Menu size={20} />
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="glass-dark hidden lg:sticky lg:top-0 lg:block lg:h-svh">{panel}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-[#0d161a]/60 backdrop-blur-sm" />
          <aside className="glass-dark absolute inset-y-0 left-0 w-[280px]">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10" aria-label="Close menu">
              <X size={18} />
            </button>
            {panel}
          </aside>
        </div>
      )}
    </>
  );
}
