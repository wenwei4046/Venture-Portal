import { useEffect, useRef } from "react";

/**
 * A chat follows its newest message: when one arrives (the 10-second read, or
 * our own send) the list scrolls to the bottom — unless the reader had
 * scrolled up into the history, which a new line must not yank them out of.
 * Before this the customer's reply landed below the fold and looked like it
 * never came (user 2026-10-09: 2 分鐘了還沒收到).
 */
export function useFollowNewest(chatId: string | null | undefined, count: number) {
  const last = useRef<{ id: string | null | undefined; n: number }>({ id: undefined, n: 0 });
  useEffect(() => {
    const prev = last.current;
    last.current = { id: chatId, n: count };
    if (!chatId) return;
    const opened = prev.id !== chatId, grew = !opened && count > prev.n;
    if (!opened && !grew) return;
    const t = setTimeout(() => document.querySelectorAll<HTMLElement>("[data-chat-list]").forEach(el => {
      // The new line is already drawn, so the gap is the reader's own + its height: within ~600 px they follow; deeper in the history they stay put.
      if (opened || el.scrollHeight - el.scrollTop - el.clientHeight < 600) el.scrollTop = el.scrollHeight;
    }), 60);
    return () => clearTimeout(t);
  }, [chatId, count]);
}
