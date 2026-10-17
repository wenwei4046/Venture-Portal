import { useEffect, useRef } from "react";
import { atNewest, chatLists } from "./stick";

/**
 * A chat's messages are read once its newest is on the screen (the owner, 2026-10-17: "开着 chat 时新进来的讯息它怎样算已读
 * 呢？只有当你的 screen 显示到这条信息才算。比如说你在往上滑着看 chat history，然后有新的 message 进来，如果你的 screen 本身没有
 * 看到那条最新 message，它就不算你已经 read 了 … 只要你滑到最下面，screen 一 detect 到那条新 message 的时候，它才会当成是已读").
 *
 * While the open chat has unread messages, `read` runs as soon as its list is at its newest message (stick.ts keeps it
 * there unless the reader scrolled up) and the app is in front: on opening, as a message arrives, as the reader
 * scrolls back down, on coming back to the app. Never for a list that is not drawn. Whose chat may be read, `read`
 * decides — act.readChat: one's own only, Mine or Team alike ("如果我在 Team 那边点进我自己的 chat，它要能变成已读").
 */
export function useReadWhenSeen(chatId: string | null | undefined, unread: number, read: (id: string) => void) {
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    if (!chatId || unread <= 0) return;
    const check = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      const lists = chatLists().filter(el => el.clientHeight > 0);
      if (lists.length && lists.every(atNewest)) readRef.current(chatId);
    };
    check();
    // Once more after the list was put on its newest (stick.ts scrolls again 60 ms after a screen slides in).
    const t = setTimeout(check, 120);
    const onScroll = (e: Event) => { if ((e.target as HTMLElement | null)?.dataset?.chatList) check(); };
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearTimeout(t);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [chatId, unread]);
}
