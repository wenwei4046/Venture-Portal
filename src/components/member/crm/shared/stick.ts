import { useEffect, useRef } from "react";

/**
 * A chat follows its newest message: when one arrives (the 5-second read, or
 * our own send) the list scrolls to the bottom — if the reader was at the
 * bottom before it came. One who scrolled up into the history stays put.
 * Where they were is remembered as they scroll: measured after the new line
 * is drawn, a long message (an address, links) put a reader who WAS at the
 * bottom "far" from it, and the reply after it landed below the fold
 * (user 2026-10-09: 2 分鐘了還沒收到 / 幫我看畫面).
 */
export function useFollowNewest(chatId: string | null | undefined, count: number) {
  const last = useRef<{ id: string | null | undefined; n: number }>({ id: undefined, n: 0 });
  const atBottom = useRef(true);
  useEffect(() => {
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (el?.dataset?.chatList) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);
  useEffect(() => {
    const prev = last.current;
    last.current = { id: chatId, n: count };
    if (!chatId) return;
    const opened = prev.id !== chatId, grew = !opened && count > prev.n;
    if (opened) atBottom.current = true;
    if (!opened && !grew) return;
    if (!atBottom.current) return;
    const t = setTimeout(() => document.querySelectorAll<HTMLElement>("[data-chat-list]").forEach(el => { el.scrollTop = el.scrollHeight; }), 60);
    return () => clearTimeout(t);
  }, [chatId, count]);
}
