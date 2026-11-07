"use client";

import { useEffect, useRef } from "react";
import { dropStep, pushStep } from "@/components/member/crm/shared/back";

/**
 * While `on` (and the component calling it is on screen), one history step of ours stands for it — the address and Next's
 * own state kept, the keys of the CRM's steps under it too (crm/shared/back.ts › pushStep). The phone's Back pops it and
 * `onBack` runs, so Back closes what is on top and nothing under it (2026-11-08, the claim invoice's viewer — a side note
 * the user forwarded: Back took the app back a page, and the claim typed in with it). Gone from the screen another way
 * (×, Escape), the step is taken back, so the next Back is the page's own again.
 *
 * `onBack` answering true keeps it on screen — it asked something first (the request form's *Discard this claim?*, the
 * same day's second note: Back with only the form open still dropped the claim) — and the step stands again, so the next
 * Back comes here too.
 *
 * Taken back a moment later, not in the cleanup itself: React runs a component's effects twice in development (Strict
 * Mode) — a Back taken in the first cleanup raced the second push, and the viewer opened and closed at once on
 * /member/preview. Mounted again within that moment, the step simply stays. Taken back only while the address is still
 * the one it was pushed on: a move elsewhere in the meantime is never undone.
 */
export function useBackStep(key: string, onBack: () => boolean | void, on = true) {
  const latest = useRef(onBack);
  useEffect(() => { latest.current = onBack; }, [onBack]);
  const pushedAt = useRef<string | null>(null);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!on) return;
    if (leaving.current) {
      clearTimeout(leaving.current);
      leaving.current = null;
    } else if (pushedAt.current === null && pushStep(key)) {
      pushedAt.current = window.location.href;
    }
    const onPop = () => {
      // A step stacked on ours popping lands on ours: still open.
      if ((window.history.state as Record<string, unknown> | null)?.[key] || pushedAt.current === null) return;
      pushedAt.current = null;
      dropStep(key);
      if (latest.current() === true && pushStep(key)) pushedAt.current = window.location.href;
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushedAt.current === null) return;
      leaving.current = setTimeout(() => {
        leaving.current = null;
        const at = pushedAt.current;
        pushedAt.current = null;
        dropStep(key);
        if (at !== null && window.location.href === at) {
          try { window.history.back(); } catch { /* gone already */ }
        }
      }, 0);
    };
  }, [key, on]);
}
