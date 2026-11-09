"use client";

import { useEffect, useRef } from "react";
import { dropStep, pushStep } from "./back";

/**
 * The phone's Back steps back through the CRM, one thing at a time (2026-10-20; the owner, an Android phone: "点back
 * 之后回到首页，帮我改成回到上一个动作（比方说我从 calendar -> open chat，点back 应该要回到 calendar），检查每个 back
 * 是否正常"). The CRM changes no address, so Back went past it to the Revenue app; only an open chat had a step of its
 * own (useBackCloses), and closing it left whatever tab the chat was opened on — the Inbox, never the Calendar.
 *
 * Now every move between screens — a tab, a chat, a sub-page, a sheet, Team ⇄ Mine — is one history step of ours
 * (`crmNav<id>`, carried by pushStep beside the camera's and the viewer's keys), and the screen before it is kept. Back
 * pops a step and puts that screen back exactly (the tab included). The CRM's own ‹ / × that closes a layer counts as
 * Back too: when it leaves the same layers open as the screen kept under it, that screen is put back and our step taken
 * off the history, so the phone's Back and the screen's ‹ always agree.
 *
 * `shape` is what a screen IS (tab names, ids, true / false for an open sheet) — never a draft's words, so typing does
 * not step; `snap` is the state to put back. `layers` are the parts of a shape that open over a page (anything but its
 * tab and side).
 *
 * Round 2 (notes/10, 2026-11-10 — the owner: "android 点返回会回到首页"):
 * - Each step has its own id (not its depth), so the oldest can be forgotten: past NAV_MAX the oldest step goes and the
 *   new one is still kept (it used to stop at 30 and Back then jumped far back and soon out of the CRM).
 * - The steps live beside the module, not in the component: a CrmApp mounted again (the Revenue app's view switch, its
 *   curtain, a `key` change) finds them as they were. On mounting they are matched to the history entry the browser is
 *   on — its `crmNav<id>` keys say how many of them still stand — so a Back taken while the CRM was away is not undone.
 *   Kept in memory rather than sessionStorage: a step's snapshot holds what JSON cannot (a picked photo's File), and
 *   the history entry is what says where Back stands, so it is the one truth to match against. After a reload the
 *   memory is gone: an entry still carrying a step of a page before it is passed over (Back goes on through it), so no
 *   press is spent on a screen nobody can put back.
 * - `beforeBack`: a screen may hold Back once (the showroom with unsaved changes asks Save draft / Discard / Keep
 *   editing, frame 4a·3): answering true keeps the screen and puts our step back.
 */
export interface NavFrame<S> { shape: Record<string, string | number | boolean | null>; snap: S }

const PAGE_KEYS = new Set(["side", "tab", "ptab"]);
const keyOf = (s: NavFrame<unknown>["shape"]) => JSON.stringify(s);
const layersOf = (s: NavFrame<unknown>["shape"]) => Object.entries(s).filter(([k]) => !PAGE_KEYS.has(k));
const openLayers = (s: NavFrame<unknown>["shape"]) => layersOf(s).filter(([, v]) => v !== null && v !== false && v !== "").map(([k]) => k);
const sameLayers = (a: NavFrame<unknown>["shape"], b: NavFrame<unknown>["shape"]) => keyOf(Object.fromEntries(layersOf(a))) === keyOf(Object.fromEntries(layersOf(b)));

/**
 * True when going from `cur` to `next` only closed layers on the same page — a ‹ or a ×. A tab tapped while a sub-page
 * was open (it closes that page and moves the tab) is a step forward, not back.
 */
export function onlyClosed(cur: NavFrame<unknown>["shape"], next: NavFrame<unknown>["shape"]): boolean {
  if ([...PAGE_KEYS].some(k => cur[k] !== next[k])) return false;
  const before = new Set(openLayers(cur)), after = openLayers(next);
  if (!after.every(k => before.has(k) && cur[k] === next[k])) return false;
  return after.length < before.size;
}

/** How many steps Back keeps: well above a day's use (notes/10 §2); past it the oldest are forgotten. */
export const NAV_MAX = 200;

type Step<S> = { id: number; f: NavFrame<S> };
/** The steps of each history key, beside the module so a remounted CrmApp keeps them (notes/10 §3). */
const stores = new Map<string, Step<unknown>[]>();
const stackOf = <S,>(key: string) => {
  let s = stores.get(key);
  if (!s) { s = []; stores.set(key, s); }
  return s as Step<S>[];
};
/** Unique across reloads, so an entry left by the page before never reads as one of ours. */
let lastId = Date.now();
const newId = () => ++lastId;

/** How many of `stack`'s steps the history entry with this state stands on. */
function depthOf(stack: Step<unknown>[], st: Record<string, unknown>, key: string): number {
  for (let i = stack.length - 1; i >= 0; i--) if (st[`${key}${stack[i].id}`]) return i + 1;
  return 0;
}
/** The entry carries a step of ours that is no longer known (a page before a reload, or one forgotten past NAV_MAX). */
const staleIn = (st: Record<string, unknown>, key: string) => Object.keys(st).some(k => k.startsWith(key) && /^\d+$/.test(k.slice(key.length)));
const stateNow = () => { try { return (history.state ?? {}) as Record<string, unknown>; } catch { return {}; } };

export function useNavHistory<S>(frame: NavFrame<S> | null, restore: (snap: S) => void, key = "crmNav", beforeBack?: () => boolean) {
  const cur = useRef<NavFrame<S> | null>(null);
  const ignore = useRef(0);
  const active = useRef(false);
  const latestRestore = useRef(restore);
  latestRestore.current = restore;
  const latestBefore = useRef(beforeBack);
  latestBefore.current = beforeBack;
  const k = frame ? keyOf(frame.shape) : "";
  active.current = !!frame;

  // Mounted (again): the steps kept are matched to the entry the browser stands on.
  useEffect(() => {
    const stack = stackOf<S>(key);
    const depth = depthOf(stack, stateNow(), key);
    while (stack.length > depth) dropStep(`${key}${stack.pop()!.id}`);
  }, [key]);

  useEffect(() => {
    if (!frame) { cur.current = null; return; }
    const stack = stackOf<S>(key);
    const was = cur.current;
    cur.current = frame;
    if (!was || keyOf(was.shape) === k) return;
    const top = stack[stack.length - 1];
    // The screen's own ‹ / ×: back to the screen kept under this one.
    if (top && (keyOf(top.f.shape) === k || (onlyClosed(was.shape, frame.shape) && sameLayers(top.f.shape, frame.shape)))) {
      stack.pop();
      dropStep(`${key}${top.id}`);
      if (keyOf(top.f.shape) !== k) { cur.current = top.f; latestRestore.current(top.f.snap); }
      ignore.current++;
      try { history.back(); } catch { ignore.current--; }
      return;
    }
    // Full: the oldest step is forgotten, the new one kept (notes/10 §2 — it used to stop stepping at 30).
    while (stack.length >= NAV_MAX) dropStep(`${key}${stack.shift()!.id}`);
    const step = { id: newId(), f: was };
    stack.push(step);
    if (!pushStep(`${key}${step.id}`)) stack.pop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the shape's key is the dependency
  }, [k]);

  useEffect(() => {
    const onPop = () => {
      if (ignore.current > 0) { ignore.current--; return; }
      if (!active.current) return;
      const stack = stackOf<S>(key);
      const st = stateNow();
      const depth = depthOf(stack, st, key);
      if (depth >= stack.length) {
        // A step of a page before (a reload): nothing to put back — on through it, out of the CRM.
        if (!stack.length && staleIn(st, key)) { try { history.back(); } catch { /* gone */ } }
        return; // else a step stacked on ours (the camera, the viewer) closed
      }
      // The screen holds Back (frame 4a·3): our steps stand again, as they were.
      if (latestBefore.current?.()) {
        for (let i = stack.length - 1; i >= depth; i--) dropStep(`${key}${stack[i].id}`);
        for (let i = depth; i < stack.length; i++) pushStep(`${key}${stack[i].id}`);
        return;
      }
      let snap: NavFrame<S> | undefined;
      while (stack.length > depth) { const s = stack.pop()!; dropStep(`${key}${s.id}`); snap = s.f; }
      if (snap) { cur.current = snap; latestRestore.current(snap.snap); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [key]);
}

/** Tests: how many steps stand for `key`. */
export const navDepth = (key = "crmNav") => stackOf(key).length;
