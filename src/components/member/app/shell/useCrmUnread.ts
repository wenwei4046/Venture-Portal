"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ask, settleRead, type RevenueSource, type TrackRead } from "../source";

/** A message landing moves its customer's row two or three times: one read a moment after the last of them. */
export const LIVE_SETTLE_MS = 400;

/**
 * Today's CRM chat button, its figure (2026-10-14 — the "Revenue app refresh" handoff §2; the user: the customers'
 * messages not read yet, the CRM's own Inbox figure, moving the moment one comes in — "像 notification 这样，只要一 send，
 * 对方收到的话，就会跳" — while nothing else on the screen reads again).
 *
 * It is one of the open's reads and every pull's (tracked: the pull's dot waits for it), shown from the phone's kept
 * answer meanwhile. Between pulls it moves by itself: the app listens to crm_contacts' changes through Supabase
 * Realtime under the member's own session — the table's row policy decides whose customers reach whom (mig
 * 20261014120000) — and a moment after one, reads the figure again SILENTLY: no dot, no other read. It also reads it
 * again on coming back to the app and on leaving the CRM, where the member read their chats. Only the latest answer
 * is kept, so a slow read never puts back an older figure.
 *
 * `fixture`: the design preview's figure (the prototype's 4); nothing is read or listened to there.
 */
export function useCrmUnread({ enabled, live, ready, source, gen, track, account, onCrm, fixture }: {
  /** The account holds CRM · View and the button can show (a phone): nothing is read or listened to otherwise. */
  enabled: boolean;
  /** The live app on real data. */
  live: boolean;
  /** The phone's kept answers are loaded (the app asks for nothing before). */
  ready: boolean;
  source: RevenueSource;
  gen: number;
  track: TrackRead;
  /** The signed-in login: the channel is theirs. */
  account: string;
  /** The CRM is the page open now: leaving it reads the figure again. */
  onCrm: boolean;
  fixture?: number;
}): number | null {
  const [count, setCount] = useState<number | null>(null);
  const on = enabled && live && ready && !!source.crmUnread;
  const latest = useRef(0);
  const read = useCallback((tracked: boolean, forGen: number) => {
    if (!source.crmUnread) return;
    const mine = ++latest.current;
    const answer = source.crmUnread();
    void (tracked ? track(forGen, answer) : settleRead(answer)).then(r => {
      if (mine === latest.current && r.ok) setCount(r.data);
    });
  }, [source, track]);

  // What the phone kept from the last open, at once — the read below replaces it.
  useEffect(() => {
    if (!on) return;
    const kept = source.peek?.<number>(ask.crmUnread());
    if (typeof kept === "number") setCount(c => c ?? kept);
  }, [on, source]);

  // The open, and every pull.
  useEffect(() => {
    if (on) read(true, gen);
  }, [on, gen, read]);

  // Live: a customer's row changing (a message in, a chat read, a chat handed on) reads the figure again, silently.
  useEffect(() => {
    if (!on) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => read(false, -1), LIVE_SETTLE_MS); };
    const db = createClient();
    const channel = db.channel(`rv-crm-unread:${account}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_contacts" }, soon)
      .subscribe();
    // Back in the app: whatever came while it slept (a phone's page stops listening in the background).
    const back = () => { if (document.visibilityState === "visible") soon(); };
    document.addEventListener("visibilitychange", back);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", back);
      void db.removeChannel(channel);
    };
  }, [on, account, read]);

  // Out of the CRM: the chats just read leave the figure.
  const wasOnCrm = useRef(onCrm);
  useEffect(() => {
    if (wasOnCrm.current && !onCrm && on) read(false, -1);
    wasOnCrm.current = onCrm;
  }, [onCrm, on, read]);

  return fixture ?? (on ? count : null);
}
