"use client";

import { useEffect, useRef } from "react";

/**
 * The phone's Back closes what is open — a chat, back to the Inbox (the owner, 2026-10-15: "When I press back button at
 * my phone, it back to homepage revenue app, it should jump back to inbox"). A chat changes no address, so Back went past
 * the whole CRM to the Revenue app's page before it. While `open`, one history step of our own stands for it (the
 * address and Next's own state kept, as the photo viewer's — shared/viewer.tsx); Back pops it and `close` runs; closed
 * on screen (its ‹), the step is taken back. A step stacked on ours (the viewer) popping lands on ours — `key` still in
 * the state — and leaves this open.
 */
export function useBackCloses(open: boolean, close: () => void, key: string) {
  const pushed = useRef(false);
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    if (!pushed.current) {
      try { history.pushState({ ...(history.state ?? {}), [key]: 1 }, ""); pushed.current = true; } catch { /* no history */ }
    }
    const onPop = () => {
      if ((history.state as Record<string, unknown> | null)?.[key]) return;
      pushed.current = false;
      latest.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed on screen: our step goes too, so the next Back is the page's own.
      if (pushed.current) { pushed.current = false; try { history.back(); } catch { /* gone already */ } }
    };
  }, [open, key]);
}
