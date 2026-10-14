"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Notices } from "@/lib/push/notices";
import { settleRead, type RevenueSource, type TrackRead } from "../source";
import { LIVE_SETTLE_MS } from "./useCrmUnread";

/** Which of the bell's three moved — the database names it (mig 20261014223000). */
export type BellNews = "notice" | "memo" | "request";

/** Back in the app after this long away, the memos and requests are read again too. */
export const AWAY_MS = 60_000;

/**
 * The bell, live (2026-10-14 — the owner, after Today's CRM chat button went live: "change to on live as well"; nothing
 * else on the screen reads again by itself).
 *
 * The bell counts the account's notifications, HR's memos to acknowledge and the requests HR returned. Whenever one of
 * them changes for this person, the database tells their own private Realtime channel `bell:<user id>` which of the three
 * (mig 20261014223000 — the channel carries nothing else, and only its owner may listen), and a moment after the last of a
 * burst, silently — no dot, no other read:
 *   notice         → the notifications are read again (`source.notices`) and held here;
 *   memo, request  → `onSnapshot`: the app reads its snapshot and takes only the memos and the requests from it.
 * Coming back to the app reads the notifications again — and the memos and requests too after AWAY_MS away: a phone's
 * page stops listening in the background. Every pull reads the notifications with the rest (tracked: the pull's dot waits
 * for it); the open has the layout's. Only the latest answer is kept, so a slow read never puts back an older one.
 */
export function useLiveBell({ enabled, account, initial, source, gen, track, onSnapshot }: {
  /** The live app on a member's own data — never the design preview, the demo, nor the Principal viewing members. */
  enabled: boolean;
  /** The signed-in login: the channel is theirs. */
  account: string;
  /** The open's notifications (the layout's). */
  initial: Notices;
  source: RevenueSource;
  gen: number;
  track: TrackRead;
  /** Read the snapshot again and take its memos and requests. */
  onSnapshot: () => void;
}): Notices {
  const [notices, setNotices] = useState(initial);
  // A server render of the app (the layout again) hands newer ones.
  useEffect(() => { setNotices(initial); }, [initial]);
  const on = enabled && !!account && !!source.notices;
  const latest = useRef(0);
  const read = useCallback((forGen: number | null) => {
    if (!source.notices) return;
    const mine = ++latest.current;
    const answer = source.notices();
    void (forGen === null ? settleRead(answer) : track(forGen, answer)).then(r => {
      if (mine === latest.current && r.ok) setNotices(r.data);
    });
  }, [source, track]);
  const snapshot = useRef(onSnapshot);
  useEffect(() => { snapshot.current = onSnapshot; }, [onSnapshot]);

  // Every pull; the open is the layout's.
  useEffect(() => { if (on && gen > 0) read(gen); }, [on, gen, read]);

  useEffect(() => {
    if (!on) return;
    const due = { notices: false, snapshot: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      if (due.notices) read(null);
      if (due.snapshot) snapshot.current();
      due.notices = due.snapshot = false;
    };
    const soon = (news: BellNews) => {
      if (news === "notice") due.notices = true; else due.snapshot = true;
      clearTimeout(timer);
      timer = setTimeout(run, LIVE_SETTLE_MS);
    };
    const db = createClient();
    let channel: RealtimeChannel | null = null;
    let gone = false;
    // A private channel joins with the session's own token: Realtime asks realtime.messages' policy who may listen.
    void db.realtime.setAuth().catch(() => undefined).then(() => {
      if (gone) return;
      channel = db.channel(`bell:${account}`, { config: { private: true } })
        .on("broadcast", { event: "notice" }, () => soon("notice"))
        .on("broadcast", { event: "memo" }, () => soon("memo"))
        .on("broadcast", { event: "request" }, () => soon("request"))
        .subscribe();
    });
    // Back in the app: whatever came while it slept.
    let hiddenAt: number | null = null;
    const back = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      soon("notice");
      if (away >= AWAY_MS) soon("memo");
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      gone = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", back);
      if (channel) void db.removeChannel(channel);
    };
  }, [on, account, read]);

  return notices;
}
