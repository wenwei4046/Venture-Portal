"use client";

import { useEffect, useRef } from "react";

/** The keys of our steps standing in the history now (pushStep / dropStep). */
const standing = new Set<string>();

/**
 * Pushes one step of ours, carrying the keys of every step of ours still standing under it (2026-10-17). Next's router
 * rewrites the entry it is on with its own state alone whenever a Server Action brings the page back — any that sets a
 * cookie does, as the session's hourly refresh (Next's `preserveCustomHistoryState` is false then) — so the step under
 * ours could have lost its key: the camera's step, taken back as it handed its video to the chat, then landed on a chat
 * entry without `crmChat`, and the chat closed too (an iPhone back from the background: on the Inbox as the recording
 * stopped, the video lost). The entry we stand on gets the keys back first.
 */
export function pushStep(key: string): boolean {
  try {
    const base: Record<string, unknown> = { ...(history.state ?? {}) };
    for (const k of standing) base[k] = 1;
    history.replaceState(base, "");
    history.pushState({ ...base, [key]: 1 }, "");
    standing.add(key);
    return true;
  } catch { return false; }
}
/** Our step gone from the history — popped by Back, or taken back. */
export function dropStep(key: string) { standing.delete(key); }

/**
 * The phone's Back closes what is open — a chat, back to the Inbox (the owner, 2026-10-15: "When I press back button at
 * my phone, it back to homepage revenue app, it should jump back to inbox"). A chat changes no address, so Back went past
 * the whole CRM to the Revenue app's page before it. While `open`, one history step of our own stands for it (the
 * address and Next's own state kept, as the photo viewer's — shared/viewer.tsx); Back pops it and `close` runs; closed
 * on screen (its ‹), the step is taken back. A step stacked on ours (the camera, the viewer) popping lands on ours —
 * `key` still in the state (pushStep) — and leaves this open.
 */
export function useBackCloses(open: boolean, close: () => void, key: string): (then?: () => void) => void {
  const pushed = useRef(false);
  const latest = useRef(close);
  latest.current = close;
  /**
   * Closed by a choice that goes on somewhere (notes/10 §1, 2026-11-10 — a sheet's button that opens a chat, another sheet,
   * the camera): our step is taken back FIRST and `then` runs once the browser has landed under it. Run at once, a step
   * `then` pushes (a chat, the camera) stood on ours while our Back was still on its way, and that Back took IT.
   */
  const closeThen = useRef((then?: () => void) => {
    if (pushed.current) { pushed.current = false; dropStep(key); backThen(then); } else if (then) then();
    latest.current();
  }).current;
  useEffect(() => {
    if (!open) return;
    if (!pushed.current) pushed.current = pushStep(key);
    const onPop = () => {
      if ((history.state as Record<string, unknown> | null)?.[key]) return;
      pushed.current = false;
      dropStep(key);
      latest.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed on screen: our step goes too, so the next Back is the page's own.
      if (pushed.current) { pushed.current = false; dropStep(key); try { history.back(); } catch { /* gone already */ } }
    };
  }, [open, key]);
  return closeThen;
}

/**
 * history.back(), then `then` once the browser has landed (its popstate), or after 400 ms if none comes (a history
 * already at its start). Other code's popstate listeners see that Back as any other.
 */
export function backThen(then?: () => void) {
  let done = false;
  const land = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", land);
    clearTimeout(t);
    then?.();
  };
  window.addEventListener("popstate", land);
  const t = setTimeout(land, 400);
  try { history.back(); } catch { land(); }
}
