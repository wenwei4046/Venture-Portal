"use client";

import { useEffect, useRef, useState } from "react";
import type { MemberReadContext } from "@/lib/member/types";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import { ask, untracked, type RevenueSource, type TrackRead } from "../source";

export interface MonthArena {
  /** The month's Arena (monthly window, fair history included), or null while there is none to show. */
  snapshot: MemberArenaSnapshot | null;
  /** Put a newer answer in its place (brand weeks just saved and read again). */
  replace: (snapshot: MemberArenaSnapshot) => void;
  /** Nothing to show yet and the read has not answered: a placeholder, not "no place". */
  loading: boolean;
}

/**
 * One month's Arena for the app's own pages — Today, brand weeks, the claim
 * form, the team map. `month` null = not needed now; nothing is read. What the
 * phone kept from an earlier open shows while it is read (2026-10-08); a pull
 * keeps the boards up until the new ones land.
 */
export function useMonthArena({ source, membershipId, context, readable, month, mark, gen = 0, track = untracked }: {
  source: RevenueSource;
  membershipId: string;
  context: MemberReadContext | undefined;
  readable: boolean;
  month: string | null;
  /** A Principal views as somebody: mark them as "you". */
  mark: (snapshot: MemberArenaSnapshot) => MemberArenaSnapshot;
  gen?: number;
  track?: TrackRead;
}): MonthArena {
  const [snapshot, setSnapshot] = useState<MemberArenaSnapshot | null>(null);
  const [answered, setAnswered] = useState("");
  const key = `${membershipId}|${context?.staffId ?? ""}|${month ?? ""}`;
  const shown = useRef("");
  const latestMark = useRef(mark);
  latestMark.current = mark;

  useEffect(() => {
    if (!membershipId || !readable || !month) return;
    let stale = false;
    // Another person or month: the boards were theirs — the phone's copy of this one stands in until the answer lands.
    if (shown.current !== key) {
      const kept = source.peek?.<MemberArenaSnapshot>(ask.arena(membershipId, month, "monthly", context));
      setSnapshot(kept ? latestMark.current(kept) : null);
    }
    shown.current = key;
    void track(gen, source.arena(membershipId, month, "monthly", context)).then(r => {
      if (stale) return;
      if (r.ok) setSnapshot(latestMark.current(r.data));
      setAnswered(key);
    });
    return () => { stale = true; };
  }, [source, membershipId, context, readable, month, key, gen, track]);

  const shownNow = month ? snapshot : null;
  return { snapshot: shownNow, replace: setSnapshot, loading: !!month && !shownNow && answered !== key };
}
