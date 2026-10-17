import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * A chat follows its newest message: when one arrives (the 5-second read, or
 * our own send) the list scrolls to the bottom — if the reader was at the
 * bottom before it came. One who scrolled up into the history stays put.
 * Where they were is remembered as they scroll: measured after the new line
 * is drawn, a long message (an address, links) put a reader who WAS at the
 * bottom "far" from it, and the reply after it landed below the fold
 * (user 2026-10-09: 2 分鐘了還沒收到 / 幫我看畫面).
 *
 * Opening a chat must not jump (the owner, 2026-10-14: "點入聊天室時，它還是會有載入的痕跡（畫面一直跳動），這會讓人感覺 app
 * 很卡"). It opened at the top and scrolled down 60 ms later, then again each time a photo loaded. Now the list is put on
 * its newest message BEFORE the first paint (a layout effect), and anything in it that changes size afterwards — a photo,
 * a video, a voice note loading — keeps a reader at the bottom in the same frame (a ResizeObserver runs before paint).
 * The photos' boxes are drawn at their final size anyway (shared/chat-media.ts), so there is little left to move.
 */
const LISTS = "[data-chat-list]";
/** The chats on screen: the phone's lists, and on the desktop the scroller around a conversation's end marker. */
export function chatLists(): HTMLElement[] {
  const out = new Set<HTMLElement>(document.querySelectorAll<HTMLElement>(LISTS));
  document.querySelectorAll<HTMLElement>("[data-chat-end]").forEach(end => {
    for (let el = end.parentElement; el && el !== document.body; el = el.parentElement) {
      const y = getComputedStyle(el).overflowY;
      if (y === "auto" || y === "scroll") { el.dataset.chatList = "1"; out.add(el); break; }
    }
  });
  return [...out];
}
const toBottom = () => chatLists().forEach(el => { el.scrollTop = el.scrollHeight; });
/** A list is at its newest message: scrolled to within 120 px of its end — where the chat follows new ones. */
export const atNewest = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight < 120;

export function useFollowNewest(chatId: string | null | undefined, count: number) {
  const last = useRef<{ id: string | null | undefined; n: number }>({ id: undefined, n: 0 });
  const atBottom = useRef(true);
  useEffect(() => {
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (el?.dataset?.chatList) atBottom.current = atNewest(el);
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  // Whatever in an open chat's list changes size keeps a reader at the bottom there.
  useEffect(() => {
    if (!chatId || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (atBottom.current) toBottom(); });
    const seen = new WeakSet<Element>();
    const watch = () => chatLists().forEach(list => {
      if (!seen.has(list)) { seen.add(list); ro.observe(list); }
      for (const child of Array.from(list.children)) if (!seen.has(child)) { seen.add(child); ro.observe(child); }
    });
    watch();
    // Looked again at most once a frame, however many nodes changed.
    let raf = 0;
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; watch(); }); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); cancelAnimationFrame(raf); };
  }, [chatId]);

  useLayoutEffect(() => {
    const prev = last.current;
    last.current = { id: chatId, n: count };
    if (!chatId) return;
    const opened = prev.id !== chatId, grew = !opened && count > prev.n;
    if (opened) atBottom.current = true;
    if (!opened && !grew) return;
    if (!atBottom.current) return;
    toBottom();
    // A screen that slides in may lay its list out a moment later: once more after that.
    const t = setTimeout(toBottom, 60);
    return () => clearTimeout(t);
  }, [chatId, count]);
}
