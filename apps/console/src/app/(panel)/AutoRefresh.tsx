"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-loads the page data every `seconds` while the tab is visible, so new calls and escalations appear by themselves. */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      // Skip while hidden or while someone is typing in a form.
      const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
      if (document.visibilityState === "visible" && !typing) router.refresh();
    };
    const id = window.setInterval(tick, seconds * 1000);
    const onShow = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [router, seconds]);
  return null;
}
