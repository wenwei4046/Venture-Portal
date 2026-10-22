"use client";

import { useEffect, useRef } from "react";
import { logPageView } from "@/lib/page-view";

/** Back in the app after this long away, the visit is written again — the database stamps Last seen five minutes apart. */
export const VISIT_AGAIN_MS = 5 * 60_000;

/**
 * The Revenue app's use, written where the portal writes its own (2026-10-22 — People's Last seen read "never" for the
 * whole Revenue Department though 21 of its 29 logins had signed in: the app never said it was used; the owner, asked
 * whether to record it: "1 and 2 both do"). A page view through `log_data_access` — the RPC the portal shell calls on
 * every navigation (lib/page-view.ts), which also stamps `users.last_seen_at` — when the app opens, on every page it
 * moves to, and when it comes back to the front after VISIT_AGAIN_MS away or out of the browser's page cache: a phone
 * keeps the app open for days. `path` is the route's `visitPath`; nothing while `on` is false (the preview's demo and
 * fixtures).
 */
export function useVisits(path: string, on: boolean): void {
  const latest = useRef(path);
  latest.current = path;

  // The ref keeps React's development double-effect from writing the same page twice, as PortalFrame's does.
  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (!on || logged.current === path) return;
    logged.current = path;
    logPageView(path);
  }, [on, path]);

  useEffect(() => {
    if (!on) return;
    let hiddenAt: number | null = null;
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= VISIT_AGAIN_MS) logPageView(latest.current);
      hiddenAt = null;
    };
    const shown = (e: PageTransitionEvent) => {
      if (e.persisted) logPageView(latest.current);
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", shown);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", shown);
    };
  }, [on]);
}
