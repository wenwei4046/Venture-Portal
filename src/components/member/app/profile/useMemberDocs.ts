"use client";

import { useCallback, useEffect, useState } from "react";
import type { MemberDocument } from "@/lib/documentation/member";
import { ask, settleRead, type RevenueSource } from "../source";

/**
 * Documentation's state (2026-10-11): the list (read on Profile, for its
 * row's count of new files, and on the page — kept on the phone like the
 * app's other reads), and opening a file. The member's own tap marks it seen
 * at once; a Principal viewing them opens it without that. A file's link is
 * asked for at the tap and opened in a tab readied in the same tap, so a
 * phone's pop-up blocker lets it through.
 */
export function useMemberDocs({ active, onPage, source, staffId, fixture, readOnly }: {
  /** Profile or Documentation is on screen (and the phone's kept answers are loaded). */
  active: boolean;
  /** Documentation itself is: leaving it clears "Opening …". */
  onPage: boolean;
  source: RevenueSource;
  /** The Principal viewing somebody: whose list. */
  staffId?: string;
  /** The design preview's files (the handoff's sample): read from nowhere. */
  fixture?: MemberDocument[];
  readOnly: boolean;
}): { docs: MemberDocument[] | null; message: string | null; opening: string; unseen: number; open: (id: string) => void } {
  const [docs, setDocs] = useState<MemberDocument[] | null>(fixture ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [opening, setOpening] = useState("");

  // Somebody else viewed: their list, not the last one's (before the read below, which may fill it from the phone).
  useEffect(() => { if (!fixture) { setDocs(null); setMessage(null); } }, [staffId, fixture]);

  useEffect(() => {
    if (!active || fixture || !source.documents) return;
    const context = staffId ? { staffId } : undefined;
    const kept = source.peek?.<MemberDocument[]>(ask.documents(context));
    if (kept) setDocs(d => d ?? kept);
    let live = true;
    void settleRead(source.documents(context)).then(res => {
      if (!live) return;
      if (res.ok) { setDocs(res.data); setMessage(null); } else setMessage(res.error);
    });
    return () => { live = false; };
  }, [active, fixture, source, staffId]);

  useEffect(() => { if (!onPage) setOpening(""); }, [onPage]);

  const open = useCallback((id: string) => {
    const doc = docs?.find(x => x.id === id);
    if (!doc) return;
    setOpening(doc.fileName || doc.name);
    setMessage(null);
    if (!readOnly) setDocs(list => list?.map(x => (x.id === id ? { ...x, seen: true } : x)) ?? list);
    if (fixture || !source.openDocument) return;
    // Readied in the tap itself: a tab opened after the server answers is a pop-up to a phone.
    const tab = window.open("", "_blank");
    void settleRead(source.openDocument(id, staffId ? { staffId } : undefined)).then(res => {
      if (res.ok) {
        if (tab) tab.location.href = res.data.url;
        else window.location.assign(res.data.url);
      } else {
        tab?.close();
        setOpening("");
        setMessage(res.error);
      }
    });
  }, [docs, readOnly, fixture, source, staffId]);

  return { docs, message, opening, unseen: docs?.filter(x => !x.seen).length ?? 0, open };
}
