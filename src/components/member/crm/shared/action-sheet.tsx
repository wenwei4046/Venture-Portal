"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * A small bottom sheet of choices — a title, a line under it, and its buttons (the owner, 2026-10-14: after Book visit
 * the Team chat's ⋮ › Appointment "無法修改 & cancel 預約": it only ever opened a new booking). Mounted once by CrmApp;
 * a tap outside or Esc closes it.
 */
export type SheetAction = { label: string; danger?: boolean; primary?: boolean; run: () => void };
export type ActionSheet = { title: string; sub?: string; actions: SheetAction[] };

let state: ActionSheet | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
export function openActions(s: ActionSheet) { state = s; emit(); }
const close = () => { state = null; emit(); };

export function ActionSheetHost() {
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
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 18px calc(var(--safe-bottom, 0px) + 18px)", display: "flex", flexDirection: "column", gap: "10px", animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)" }}>
        <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }} />
        <strong style={{ fontSize: "18px", color: "#3F2B22", marginTop: "4px" }}>{s.title}</strong>
        {!!s.sub && <span style={{ fontSize: "14px", color: "#806B60", lineHeight: 1.45, marginTop: "-4px" }}>{s.sub}</span>}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" }}>
          {s.actions.map((a, i) => (
            <button key={i} type="button" onClick={() => { close(); a.run(); }}
              style={{ height: "46px", borderRadius: "23px", border: a.primary ? 0 : "1px solid #E2CFC1", background: a.primary ? "#BD4A19" : "#fff", color: a.primary ? "#fff" : a.danger ? "#A3371A" : "#3F2B22", fontSize: "15px", fontWeight: 650, cursor: "pointer" }}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
