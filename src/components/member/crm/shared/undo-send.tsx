"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { typePx } from "./type";

/**
 * Undo send (the owner, 2026-10-15: a message to a customer should be taken back within a short time; told that neither
 * WhatsApp's nor Messenger's API can take back one the customer already has, the owner chose "1" — a send held a moment
 * with Undo). A message tapped Send shows in the chat at once with its clock, but goes to the customer only after
 * UNDO_MS; Undo in that time takes it out of the chat and puts its words back in the box — the customer never gets it.
 * Words, photos, videos, voice notes and files alike; a visit card, a template and a forward go at once. The hold lives
 * on the phone: closed in those seconds, the message does not go.
 */
export const UNDO_MS = 10_000;

type Held = { id: string; label: string; until: number; done: (send: boolean) => void };
let held: Held[] = [];
const subs = new Set<() => void>();
const emit = () => { held = [...held]; subs.forEach(f => f()); };

/** Holds a send for UNDO_MS: true when it should go, false when it was undone. */
export function holdForUndo(id: string, label: string): Promise<boolean> {
  return new Promise(resolve => {
    const h: Held = { id, label, until: Date.now() + UNDO_MS, done: () => {} };
    const timer = setTimeout(() => h.done(true), UNDO_MS);
    h.done = send => { clearTimeout(timer); held = held.filter(x => x !== h); emit(); resolve(send); };
    held.push(h);
    emit();
  });
}
/** Undo the newest held send (the bar's button). */
export function undoLast() { held[held.length - 1]?.done(false); }

/** The bar above the composer while a send is held: what goes, the seconds left, Undo. */
export function UndoSendBar() {
  const list = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => held, () => held);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!list.length) return;
    const t = setInterval(() => tick(n => n + 1), 250);
    return () => clearInterval(t);
  }, [list.length]);
  const last = list[list.length - 1];
  if (!last) return null;
  const left = Math.max(1, Math.ceil((last.until - Date.now()) / 1000));
  return (
    <div role="status" style={{ position: "absolute", left: "12px", right: "12px", bottom: "calc(var(--safe-bottom, 0px) + 84px)", zIndex: 30, display: "flex", alignItems: "center", gap: "10px", padding: "10px 10px 10px 14px", borderRadius: "14px", background: "#3F2B22", color: "#fff", boxShadow: "0 8px 24px rgba(63,43,34,.25)", fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif", animation: "fadeIn 160ms ease-out" }}>
      <span style={{ flex: "1", minWidth: 0, fontSize: typePx(14), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {list.length > 1 ? `${list.length} messages` : last.label} · sending in {left}s
      </span>
      <button type="button" onClick={undoLast} style={{ flex: "none", height: "34px", padding: "0 14px", borderRadius: "17px", border: 0, background: "#fff", color: "#BD4A19", fontSize: typePx(14), fontWeight: 700, cursor: "pointer" }}>Undo</button>
    </div>
  );
}
