"use client";
/**
 * Calendar › Book appt (the owner, 2026-11-19: "calendar 的右上角点击之后能直接 book appt" — a customer closed on the phone):
 * pick one of the CRM's own customers by name or phone, then that screen opens its usual Book visit on them. Mounted once
 * by CrmApp, as the action sheet; the phone's Back or a tap outside closes it.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { typePx } from "./type";
import { useBackCloses } from "./back";
import { Ic } from "./icons4a";

export type CustomerPick = { customers: CrmCustomer[]; pick: (c: CrmCustomer) => void; title?: string };

let state: CustomerPick | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
export function openCustomerPick(s: CustomerPick) { state = s; emit(); }
const close = () => { state = null; emit(); };

const digits = (s: string) => s.replace(/\D/g, "");
/** Every word of the search in the name, or its digits in the phone (any of 012-…, +6012…, 6012…). */
export function customerMatches(c: Pick<CrmCustomer, "name" | "phone">, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const d = digits(t);
  if (d.length >= 3) { const p = digits(c.phone ?? ""); if (p.includes(d) || p.includes(d.replace(/^0/, "")) || p.replace(/^60/, "0").includes(d)) return true; }
  const name = (c.name ?? "").toLowerCase();
  return t.split(/\s+/).every(w => name.includes(w));
}

const STATUS: Record<string, string> = { new: "New", follow_up: "Follow up", appointment: "Appointment", won: "Won", lost: "Lost" };

export function CustomerPickHost() {
  const s = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => null);
  const closeThen = useBackCloses(!!s, close, "crmCustomerPick");
  const [q, setQ] = useState("");
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (s) { setQ(""); requestAnimationFrame(() => box.current?.focus()); } }, [s]);
  useEffect(() => {
    if (!s) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [s]);
  const list = useMemo(() => {
    if (!s) return [];
    const at = (c: CrmCustomer) => c.lastCustomerAt ?? "";
    return s.customers.filter(c => customerMatches(c, q)).sort((a, b) => at(b).localeCompare(at(a))).slice(0, 80);
  }, [s, q]);
  if (!s || typeof document === "undefined") return null;
  return createPortal(
    <div onClick={close} role="dialog" aria-modal="true" aria-label={s.title ?? "Book appt"} data-customer-pick=""
      style={{ position: "fixed", inset: 0, zIndex: 2147480000, background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif", animation: "fadeIn 200ms ease-out" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", height: "80%", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 18px calc(var(--safe-bottom, 0px) + 12px)", display: "flex", flexDirection: "column", gap: "10px", animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)" }}>
        <span style={{ flex: "none", alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }} />
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
          <strong style={{ fontSize: typePx(18), color: "var(--crm-ink)" }}>{s.title ?? "Book appt"}</strong>
          <span style={{ fontSize: typePx(13), color: "var(--crm-muted)" }}>Pick the customer, then the time</span>
        </div>
        <label style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 12px", borderRadius: "12px", border: "1px solid var(--crm-line)", background: "var(--crm-page, #fff)", color: "var(--crm-muted)" }}>
          <Ic name="search" size={16} />
          <input ref={box} value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or phone" aria-label="Search name or phone"
            style={{ flex: 1, minWidth: 0, height: "40px", border: 0, background: "transparent", outline: "none", font: "inherit", fontSize: typePx(16), color: "var(--crm-ink)" }} />
        </label>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehaviorY: "contain", display: "flex", flexDirection: "column" }}>
          {list.length === 0 && <span style={{ padding: "16px 4px", fontSize: typePx(14), color: "var(--crm-muted)" }}>{s.customers.length ? "No customer matches." : "No customers yet."}</span>}
          {list.map(c => (
            <button key={c.id} type="button" data-pick-customer={c.id} onClick={() => closeThen(() => s.pick(c))}
              style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px", minHeight: "56px", padding: "6px 4px", border: 0, borderBottom: "1px solid var(--crm-rule-2, var(--crm-rule))", background: "transparent", textAlign: "left", cursor: "pointer", font: "inherit", color: "var(--crm-ink)" }}>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: typePx(15), fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name || c.phone || "Customer"}</span>
                <span style={{ fontSize: typePx(12.5), color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[c.phone, c.channel === "messenger" ? "Messenger" : "WhatsApp"].filter(Boolean).join(" · ")}</span>
              </span>
              <span style={{ flex: "none", fontSize: typePx(12), color: "var(--crm-muted)" }}>{STATUS[c.status] ?? ""}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
