"use client";

import { useCallback, useEffect, useState } from "react";
import type { MemberDocument } from "@/lib/documentation/member-model";
import { personalUnseen, type Personal } from "@/lib/documentation/personal";
import { ask, settleRead, type RevenueSource } from "../source";

/**
 * Documentation's state (2026-10-11): the list (read on Profile, for its
 * row's count of new files, and on the page — kept on the phone like the
 * app's other reads), and opening a file. The member's own tap marks it seen
 * at once; a Principal viewing them opens it without that. A file's link is
 * asked for at the tap and opened in a tab readied in the same tap, so a
 * phone's pop-up blocker lets it through.
 *
 * Since 2026-10-14 (the user: "documentation 我要分成两种：company / personal")
 * it reads Personal beside Company — what HR shares with the member of their own
 * folder, and their letters — read and opened the same way; the row's count is
 * both's new.
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
}): {
  docs: MemberDocument[] | null;
  personal: Personal | null;
  message: string | null;
  personalMessage: string | null;
  opening: string;
  unseen: number;
  open: (id: string) => void;
  openPersonal: (kind: "drive" | "letter", id: string) => void;
} {
  const [docs, setDocs] = useState<MemberDocument[] | null>(fixture ?? null);
  const [personal, setPersonal] = useState<Personal | null>(fixture ? { folders: [], files: [], letters: [] } : null);
  const [message, setMessage] = useState<string | null>(null);
  const [personalMessage, setPersonalMessage] = useState<string | null>(null);
  const [opening, setOpening] = useState("");

  // Somebody else viewed: their list, not the last one's (before the read below, which may fill it from the phone).
  useEffect(() => {
    if (fixture) return;
    setDocs(null);
    setPersonal(null);
    setMessage(null);
    setPersonalMessage(null);
  }, [staffId, fixture]);

  useEffect(() => {
    if (!active || fixture) return;
    const context = staffId ? { staffId } : undefined;
    let live = true;
    if (source.documents) {
      const kept = source.peek?.<MemberDocument[]>(ask.documents(context));
      if (kept) setDocs(d => d ?? kept);
      void settleRead(source.documents(context)).then(res => {
        if (!live) return;
        if (res.ok) { setDocs(res.data); setMessage(null); } else setMessage(res.error);
      });
    }
    if (source.personal) {
      const kept = source.peek?.<Personal>(ask.personal(context));
      if (kept) setPersonal(p => p ?? kept);
      void settleRead(source.personal(context)).then(res => {
        if (!live) return;
        if (res.ok) { setPersonal(res.data); setPersonalMessage(null); } else setPersonalMessage(res.error);
      });
    }
    return () => { live = false; };
  }, [active, fixture, source, staffId]);

  useEffect(() => { if (!onPage) setOpening(""); }, [onPage]);

  /** Readied in the tap itself: a tab opened after the server answers is a pop-up to a phone. */
  const follow = useCallback((name: string, link: () => Promise<{ ok: true; data: { url: string } } | { ok: false; error: string }>, failed: (error: string) => void) => {
    setOpening(name);
    const tab = window.open("", "_blank");
    // The file's page gets no handle back on the app.
    if (tab) tab.opener = null;
    void settleRead(link()).then(res => {
      if (res.ok) {
        if (tab) tab.location.href = res.data.url;
        else window.location.assign(res.data.url);
      } else {
        tab?.close();
        setOpening("");
        failed(res.error);
      }
    });
  }, []);

  const open = useCallback((id: string) => {
    const doc = docs?.find(x => x.id === id);
    if (!doc || !docs) return;
    setMessage(null);
    if (!readOnly) {
      const seen = docs.map(x => (x.id === id ? { ...x, seen: true } : x));
      setDocs(seen);
      // …and so on the phone's kept list (2026-10-20 — the user: "只要我按过一次就等于 read 了 … by right 就不应该再跳出来显示
      // 1 个 notification"): the next open shows it opened while the list is read again, not New for a moment.
      if (!fixture) source.keep?.(ask.documents(staffId ? { staffId } : undefined), seen);
    }
    if (fixture || !source.openDocument) return setOpening(doc.fileName || doc.name);
    const openDocument = source.openDocument;
    follow(doc.fileName || doc.name, () => openDocument(id, staffId ? { staffId } : undefined), setMessage);
  }, [docs, readOnly, fixture, source, staffId, follow]);

  const openPersonal = useCallback((kind: "drive" | "letter", id: string) => {
    const item = kind === "drive" ? personal?.files.find(x => x.id === id) : personal?.letters.find(x => x.id === id);
    if (!item || !personal) return;
    setPersonalMessage(null);
    if (!readOnly) {
      const seen = kind === "drive"
        ? { ...personal, files: personal.files.map(x => (x.id === id ? { ...x, seen: true } : x)) }
        : { ...personal, letters: personal.letters.map(x => (x.id === id ? { ...x, readAt: x.readAt ?? new Date().toISOString() } : x)) };
      setPersonal(seen);
      if (!fixture) source.keep?.(ask.personal(staffId ? { staffId } : undefined), seen);
    }
    if (fixture || !source.openPersonal) return setOpening(item.name);
    const openPersonalFile = source.openPersonal;
    follow(item.name, () => openPersonalFile(kind, id, staffId ? { staffId } : undefined), setPersonalMessage);
  }, [personal, readOnly, fixture, source, staffId, follow]);

  const unseen = (docs?.filter(x => !x.seen).length ?? 0) + (personal ? personalUnseen(personal) : 0);
  return { docs, personal, message, personalMessage, opening, unseen, open, openPersonal };
}
