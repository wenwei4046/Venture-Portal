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
 * (`crmNav` = how many stand, carried by pushStep beside the camera's and the viewer's keys), and the screen before it
 * is kept. Back pops a step and puts that screen back exactly (the tab included). The CRM's own ‹ / × that closes a
 * layer counts as Back too: when it leaves the same layers open as the screen kept under it, that screen is put back
 * and our step taken off the history, so the phone's Back and the screen's ‹ always agree.
 *
 * `shape` is what a screen IS (tab names, ids, true / false for an open sheet) — never a draft's words, so typing does
 * not step; `snap` is the state to put back. `layers` are the parts of a shape that open over a page (anything but its
 * tab and side).
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

const MAX = 30;

export function useNavHistory<S>(frame: NavFrame<S> | null, restore: (snap: S) => void, key = "crmNav") {
  const stack = useRef<NavFrame<S>[]>([]);
  const cur = useRef<NavFrame<S> | null>(null);
  const ignore = useRef(0);
  const latestRestore = useRef(restore);
  latestRestore.current = restore;
  const k = frame ? keyOf(frame.shape) : "";

  useEffect(() => {
    if (!frame) { cur.current = null; return; }
    const was = cur.current;
    cur.current = frame;
    if (!was || keyOf(was.shape) === k) return;
    const top = stack.current[stack.current.length - 1];
    // The screen's own ‹ / ×: back to the screen kept under this one.
    if (top && (keyOf(top.shape) === k || (onlyClosed(was.shape, frame.shape) && sameLayers(top.shape, frame.shape)))) {
      stack.current.pop();
      if (keyOf(top.shape) !== k) { cur.current = top; latestRestore.current(top.snap); }
      ignore.current++;
      try { history.back(); } catch { ignore.current--; }
      return;
    }
    if (stack.current.length >= MAX) return; // past the cap the screen still moves, Back just stops stepping
    stack.current.push(was);
    if (!pushStep(`${key}${stack.current.length}`)) stack.current.pop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the shape's key is the dependency
  }, [k]);

  useEffect(() => {
    const onPop = () => {
      if (ignore.current > 0) { ignore.current--; dropStep(`${key}${stack.current.length + 1}`); return; }
      const st = (history.state ?? {}) as Record<string, unknown>;
      // How many of our steps the entry we landed on stands on.
      let depth = 0;
      for (let i = stack.current.length; i > 0; i--) if (st[`${key}${i}`]) { depth = i; break; }
      if (depth >= stack.current.length) return; // a step stacked on ours (the camera, the viewer) closed
      let snap: NavFrame<S> | undefined;
      while (stack.current.length > depth) { dropStep(`${key}${stack.current.length}`); snap = stack.current.pop(); }
      if (snap) { cur.current = snap; latestRestore.current(snap.snap); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [key]);
}
