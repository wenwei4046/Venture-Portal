"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { typePx } from "./type";

/**
 * A notification's summary (the owner, 2026-10-14: "在 notification 裡，我看不到重點，幫我類似做 summary，我點進去看到
 * 更多才去 chat"): a tap on an update opens this card over the CRM — what happened and when, the customer (channel, ad,
 * status, whose, phone), their latest messages and the next visit — and only *Open chat* goes to the chat. Mounted once
 * by CrmApp; a tap outside, Close or Esc shuts it.
 */
export type SummaryLine = { who: string; text: string; at: string; mine: boolean };
export type NotifSummary = {
  title: string; when: string;
  name: string; ini: string; chan: string; chanFg: string;
  facts: [string, string][];
  lines: SummaryLine[];
  visit: string;
  openChat?: () => void;
  /** One more button above Open chat (a visit tomorrow: Send reminder). */
  action?: { label: string; run: () => void };
};

let state: NotifSummary | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
export function openSummary(s: NotifSummary) { state = s; emit(); }
const close = () => { state = null; emit(); };

export function NotifSummaryHost() {
  const s = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => null);
  useEffect(() => {
    if (!s) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [s]);
  if (!s || typeof document === "undefined") return null;
  return createPortal(
    <div onClick={close} role="dialog" aria-modal="true" aria-label={s.title} style={{ position: "fixed", inset: 0, zIndex: 2147480000, background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif", animation: "fadeIn 200ms ease-out" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 18px calc(var(--safe-bottom, 0px) + 18px)", maxHeight: "85vh", display: "flex", flexDirection: "column", gap: "12px", animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)" }}>
        <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <strong style={{ fontSize: typePx(17), color: "#3F2B22", lineHeight: 1.3 }}>{s.title}</strong>
          <span style={{ fontSize: typePx(13), color: "#806B60" }}>{s.when}</span>
        </div>
        <div style={{ overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "16px", background: "#FBF7F3" }}>
            <span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "50%", background: "#FCD6B8", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: typePx(15), fontWeight: 700 }}>{s.ini}</span>
            <span style={{ flex: "1", minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: typePx(16), color: "#3F2B22", overflowWrap: "anywhere" }}>{s.name}</strong>
              <span style={{ fontSize: typePx(13), color: s.chanFg, fontWeight: 600 }}>{s.chan}</span>
            </span>
          </div>
          {!!s.facts.length && (
            <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: "14px", rowGap: "7px", fontSize: typePx(14) }}>
              {s.facts.map(([k, v]) => [
                <span key={k + "k"} style={{ color: "#806B60" }}>{k}</span>,
                <span key={k + "v"} style={{ color: "#3F2B22", fontWeight: 600, overflowWrap: "anywhere" }}>{v}</span>,
              ])}
            </div>
          )}
          {!!s.visit && (
            <div style={{ padding: "10px 12px", borderRadius: "12px", background: "#F3E8EF", color: "#8E4B6E", fontSize: typePx(14), fontWeight: 600 }}>📅 {s.visit}</div>
          )}
          {!!s.lines.length && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: typePx(12), fontWeight: 700, letterSpacing: ".06em", color: "#806B60", textTransform: "uppercase" }}>Latest messages</span>
              {s.lines.map((l, i) => (
                <div key={i} style={{ alignSelf: l.mine ? "flex-end" : "flex-start", maxWidth: "85%", padding: "7px 11px", borderRadius: l.mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: l.mine ? "#FCD6B8" : "#F5EEE8", color: "#3F2B22", fontSize: typePx(14), lineHeight: 1.4 }}>
                  <span style={{ display: "block", fontSize: typePx(11), color: "#806B60", marginBottom: "2px" }}>{l.who} · {l.at}</span>
                  <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{l.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {s.action && (
            <button type="button" onClick={() => { const go = s.action!.run; close(); go(); }}
              style={{ height: "46px", borderRadius: "23px", border: 0, background: "#8E4B6E", color: "#fff", fontSize: typePx(15), fontWeight: 650, cursor: "pointer" }}>{s.action.label}</button>
          )}
          {s.openChat && (
            <button type="button" onClick={() => { const go = s.openChat; close(); go?.(); }}
              style={{ height: "46px", borderRadius: "23px", border: 0, background: "#BD4A19", color: "#fff", fontSize: typePx(15), fontWeight: 650, cursor: "pointer" }}>Open chat</button>
          )}
          <button type="button" onClick={close}
            style={{ height: "46px", borderRadius: "23px", border: "1px solid #E2CFC1", background: "#fff", color: "#3F2B22", fontSize: typePx(15), fontWeight: 650, cursor: "pointer" }}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
