/**
 * The desktop CRM's place, kept (user 2026-10-13, 電腦端: "back 是回到上一個 click 的節點為準，不是上個頁面" and
 * "refresh 後回到相同的頁面"). Where one is — the tab, the pane and what is open in it, the right menu's page, the open
 * chat or customer, the list and its filters — is a step in the browser's history each time it changes, so the browser's
 * Back goes to the previous click inside the CRM, not off the page; and it is kept for this tab (sessionStorage), so a
 * refresh opens on the same place. Toasts, drafts and half-typed things are not steps.
 * Next's router keeps its own state in history entries; window.history.pushState merges ours beside it (Next 15).
 */
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { DeskUi } from "./vm/ctx";

export const NAV_KEYS = ["tab", "pane", "kind", "stage", "pick", "menu", "chat", "fromTeam", "fromList", "fromInfo", "infoId", "visit", "clist", "team", "person", "inbF"] as const;
type NavKey = (typeof NAV_KEYS)[number];
export type DeskPlace = Pick<DeskUi, NavKey>;

const KEY = "crm-desk-place";

export function placeOf(ui: DeskUi): DeskPlace {
  const out = {} as Record<NavKey, unknown>;
  for (const k of NAV_KEYS) out[k] = ui[k];
  return out as DeskPlace;
}

/** A stored place, only with the keys a place has (anything else in storage is ignored). */
export function readPlace(raw: string | null): Partial<DeskPlace> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== "object") return null;
    const out: Record<string, unknown> = {};
    for (const k of NAV_KEYS) if (k in v) out[k] = v[k];
    return out as Partial<DeskPlace>;
  } catch { return null; }
}

/** The place this tab last was (a refresh opens on it), laid over a fresh desk. */
export function withSavedPlace(fresh: DeskUi): DeskUi {
  if (typeof window === "undefined") return fresh;
  try { return { ...fresh, ...(readPlace(sessionStorage.getItem(KEY)) ?? {}) }; } catch { return fresh; }
}

export function useDeskPlace(ui: DeskUi, setUi: Dispatch<SetStateAction<DeskUi>>) {
  const last = useRef<string | null>(null), fromBack = useRef(false);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const p = readPlace(JSON.stringify((e.state as { crmDesk?: unknown } | null)?.crmDesk ?? null));
      if (!p) return;
      fromBack.current = true;
      setUi(u => ({ ...u, ...p }));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setUi]);
  // Each new place: a history step (not when it came from Back / Forward), and kept for a refresh.
  useEffect(() => {
    const place = placeOf(ui), s = JSON.stringify(place);
    if (s === last.current) return;
    const first = last.current === null;
    last.current = s;
    try { sessionStorage.setItem(KEY, s); } catch { /* storage closed */ }
    if (fromBack.current) { fromBack.current = false; return; }
    try {
      if (first) window.history.replaceState({ ...(window.history.state ?? {}), crmDesk: place }, "");
      else window.history.pushState({ crmDesk: place }, "");
    } catch { /* history unavailable */ }
  }, [ui]);
}
