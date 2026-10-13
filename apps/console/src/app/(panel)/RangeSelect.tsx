"use client";

import { CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function RangeSelect({ value }: { value: number }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <label className="relative inline-flex items-center">
      <CalendarDays size={16} className="pointer-events-none absolute left-3 text-muted" />
      <select
        aria-label="Period"
        className="input h-10 w-auto rounded-xl pl-9 pr-9 text-sm"
        value={value}
        onChange={(e) => {
          const q = new URLSearchParams(params.toString());
          q.set("range", e.target.value);
          router.push(`${path}?${q.toString()}`, { scroll: false });
        }}
      >
        <option value={7}>Last 7 days</option>
        <option value={14}>Last 14 days</option>
        <option value={30}>Last 30 days</option>
      </select>
    </label>
  );
}
