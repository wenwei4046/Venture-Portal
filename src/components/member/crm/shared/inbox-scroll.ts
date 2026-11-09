"use client";
/**
 * The Inbox comes back where it was (the owner, 2026-11-09: "如果我点进看了一个聊天，那在返回时要回到那个聊天的 inbox，而不是又
 * 从上开始往下滑"). On the phone a chat takes the whole screen, so the Inbox list is unmounted and drawn again from its top on
 * the way back. This keeps each list's place as it scrolls — Mine's list (the scroller holding `[data-inbox-row]`), the Team
 * board's sideways place (`[data-inb-board]`) and each of its columns — and puts it back the first time that list is drawn
 * again. It reads the generated markup's own markers, so no generated screen changes.
 */
import { useEffect, useLayoutEffect, useRef } from "react";

type Place = Map<string, number>;

const scrolls = (el: Element, axis: "x" | "y") => {
  const o = getComputedStyle(el)[axis === "y" ? "overflowY" : "overflowX"];
  return o === "auto" || o === "scroll";
};
/** The nearest ancestor of `el` (itself included) that scrolls up and down, inside `root`. */
function scrollerOf(el: Element | null, root: Element): HTMLElement | null {
  for (let n = el; n && n !== root.parentElement; n = n.parentElement) if (n instanceof HTMLElement && scrolls(n, "y")) return n;
  return null;
}
/** The first element under `el` that scrolls up and down (a Team column's list). */
function innerScroller(el: Element): HTMLElement | null {
  const all = el.querySelectorAll<HTMLElement>("*");
  for (const n of [el as HTMLElement, ...all]) if (scrolls(n, "y")) return n;
  return null;
}

/** Which kept place a scrolling element is, or null when it is not an Inbox list. */
export function placeKey(el: Element, root: Element): string | null {
  const board = el.closest("[data-inb-board]");
  if (board && root.contains(board)) {
    if (el === board) return "board";
    const col = [...board.children].findIndex(c => c.contains(el));
    return col < 0 ? null : `team:${col}`;
  }
  const row = root.querySelector("[data-inbox-row]");
  return row && el.contains(row) ? "mine" : null;
}

export function useKeepInboxScroll(root: React.RefObject<HTMLElement | null>) {
  const place = useRef<Place>(new Map());
  const placed = useRef(new WeakSet<Element>());

  // Every scroll of an Inbox list is kept.
  useEffect(() => {
    const r = root.current;
    if (!r) return;
    const on = (e: Event) => {
      const el = e.target;
      if (!(el instanceof Element) || !r.contains(el)) return;
      const k = placeKey(el, r);
      if (k) place.current.set(k, k === "board" ? el.scrollLeft : el.scrollTop);
    };
    r.addEventListener("scroll", on, { capture: true, passive: true });
    return () => r.removeEventListener("scroll", on, { capture: true });
  }, [root]);

  // A list drawn again (a new element) gets its place back, once — before the screen is painted.
  useLayoutEffect(() => {
    const r = root.current;
    if (!r || !place.current.size) return;
    const put = (el: HTMLElement | null, k: string, x = false) => {
      if (!el || placed.current.has(el)) return;
      placed.current.add(el);
      const v = place.current.get(k);
      if (v == null) return;
      if (x) el.scrollLeft = v; else el.scrollTop = v;
    };
    const row = r.querySelector("[data-inbox-row]");
    if (row && !row.closest("[data-inb-board]")) put(scrollerOf(row, r), "mine");
    const board = r.querySelector<HTMLElement>("[data-inb-board]");
    if (board) {
      put(board, "board", true);
      [...board.children].forEach((c, i) => put(innerScroller(c), `team:${i}`));
    }
  });
}
